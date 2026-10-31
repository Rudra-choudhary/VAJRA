"""Evaluation-only collector. Reads bounded regular files in memory; never extracts or executes.
Production archive ingestion belongs to teammate B. Outputs are ignored local artifacts.
"""
import base64, hashlib, io, json, pathlib, re, tarfile, urllib.request
CASES=[('is-number','7.0.0'),('is-odd','3.0.1'),('kind-of','6.0.3'),('is-buffer','2.0.5'),('kleur','4.1.5'),('picocolors','1.1.1'),('is-even','1.0.0'),('isobject','3.0.1')]
OUT=pathlib.Path('.vajra/evaluation'); OUT.mkdir(parents=True,exist_ok=True)
def get(url):
    if not url.startswith(('https://registry.npmjs.org/','https://codeload.github.com/')):
        raise ValueError('Unexpected fixture host')
    req=urllib.request.Request(url,headers={'User-Agent':'Vajra-evaluation'})
    with urllib.request.urlopen(req,timeout=40) as r:
        if not r.url.startswith(('https://registry.npmjs.org/','https://codeload.github.com/')):raise ValueError('Unexpected redirect')
        raw=r.read(25*1024*1024+1)
    if len(raw)>25*1024*1024:raise ValueError('Download limit')
    return raw

def unpack(raw,strip):
    files={};total=0
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as t:
        for i,e in enumerate(t):
            if i>10000:raise ValueError('Entry limit')
            if e.isdir():continue
            if not e.isfile():raise ValueError('Nonregular entry')
            if e.size>5*1024*1024:raise ValueError('Entry size limit')
            parts=e.name.split('/')
            if any(p in ('','..','.') for p in parts) or e.name.startswith('/') or '\\' in e.name:raise ValueError('Unsafe path')
            key='/'.join(parts[strip:])
            if not key or key in files:raise ValueError('Invalid/duplicate path')
            total+=e.size
            if total>25*1024*1024:raise ValueError('Expanded limit')
            data=t.extractfile(e).read()
            try:
                if b'\0' in data:raise UnicodeError()
                files[key]=data.decode('utf-8')
            except UnicodeError:
                files[key]={'base64':base64.b64encode(data).decode('ascii')}
    return files
for name,version in CASES:
    if (OUT/f'{name}-{version}.json').exists():
        print(name,version,'cached',flush=True); continue
    meta=json.loads(get(f'https://registry.npmjs.org/{name}/{version}'))
    repo=meta['repository']['url'].removeprefix('git+').replace('git://','https://').removesuffix('.git')
    if not re.fullmatch(r'https://github.com/[\w.-]+/[\w.-]+',repo):raise ValueError('Unsupported source')
    commit=meta['gitHead']
    if not re.fullmatch('[0-9a-f]{40}',commit):raise ValueError('No immutable source')
    artifact=get(meta['dist']['tarball'])
    if meta['dist'].get('shasum') and hashlib.sha1(artifact).hexdigest()!=meta['dist']['shasum']:raise ValueError('Registry digest mismatch')
    source_url='https://codeload.github.com/'+repo.removeprefix('https://github.com/')+'/tar.gz/'+commit
    source=get(source_url)
    result={'name':name,'version':version,'repositoryUrl':repo,'commit':commit,'artifactUrl':meta['dist']['tarball'],'sourceUrl':source_url,'artifactSha256':hashlib.sha256(artifact).hexdigest(),'sourceSha256':hashlib.sha256(source).hexdigest(),'packageFiles':unpack(artifact,1),'sourceFiles':unpack(source,1)}
    (OUT/f'{name}-{version}.json').write_text(json.dumps(result,indent=2)+'\n')
    print(name,version,'pinned to',commit,flush=True)
