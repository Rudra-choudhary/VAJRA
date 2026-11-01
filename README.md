# Vajra

Vajra reviews npm packages by comparing the files in a published package with files from its source code. It highlights differences and suspicious code patterns, then shows the evidence and any parts it could not inspect.

Vajra is a review aid. It does not prove that a package is safe or that a flagged change is malicious.

## What Vajra does

For an analysis, Vajra:

1. Gets a package release from npm or reads an uploaded `.tgz` package archive.
2. Finds source code from the package's repository, a selected GitHub commit, or an uploaded source archive.
3. Selects the package folder, including the right package folder in a monorepo when it can identify it.
4. Compares package and source files using SHA-256 hashes and bounded text diffs.
5. Checks for suspicious differences, such as new network calls, process execution, dynamic code execution, sensitive environment access, changed lifecycle hooks, or executable files that only appear in the package.
6. Saves the report and file details in SQLite, then displays the results in the web app.

The report separates file status, findings, evidence, and coverage. A finding points to a file and, when available, a line or excerpt. Coverage shows files that were compared, skipped, or limited by processing rules.

## What the results mean

- **Identical:** The package and source file have the same SHA-256 hash.
- **Modified:** Both sides contain a file at the same path, but their contents differ.
- **Added:** A file appears in the published package but not in the selected source.
- **Removed:** A file appears in the selected source but not in the published package.
- **Skipped or limited:** Vajra could not fully inspect or compare the file. Review the report's limitations.

Different hashes mean the file contents differ. That can be a legitimate packaging or build change, or something that needs review. It is not, by itself, proof of tampering. Matching hashes mean the compared bytes are identical, but do not prove that the source or package is trustworthy.

## Requirements

- Node.js 22 or newer
- npm
- Optional for local AI explanations: [Ollama](https://ollama.com/) and the `qwen3.5:latest` model

## Run locally

From the repository root:

```sh
npm ci --ignore-scripts
npm run build
```

Start the API in one terminal:

```sh
npx tsx apps/server/src/index.ts
```

The API listens at `http://127.0.0.1:3000` by default. Check that it is running at `http://127.0.0.1:3000/api/health`.

Start the web app in a second terminal:

```sh
npm run dev --workspace @vajra/web
```

Open `http://127.0.0.1:5173`. The web app opens in **Demo mode** with synthetic sample reports. Click **Live API** in the header to connect it to the local API. Demo reports are examples only. They are not the result of analyzing a real package.

The local API uses these defaults:

- Database: `./data/vajra.db`
- Uploaded archives: `./data/uploads`
- Analysis workspaces: `./data/workspaces`
- API host and port: `127.0.0.1:3000`
- Model: `qwen3.5:latest` through local Ollama

These settings can be overridden with `VAJRA_DB`, `VAJRA_UPLOADS`, `VAJRA_WORKSPACE`, `HOST`, `PORT`, and `VAJRA_MODEL`.

## Use Qwen locally

Qwen adds a plain-language explanation and summary for selected rule findings. The deterministic checks produce the findings and evidence. Qwen cannot add new evidence locations or remove rule findings.

Install and start the model with Ollama:

```sh
ollama pull qwen3.5:latest
```

Then start the API as usual. To choose another model already installed in Ollama, set `VAJRA_MODEL` before starting the API. To disable model calls locally:

```sh
VAJRA_MODEL=none npx tsx apps/server/src/index.ts
```

`VAJRA_OLLAMA_URL` can point to a trusted local Ollama server. Vajra does not download models automatically and does not fall back to a cloud model. If Ollama is unavailable or its response cannot be validated, deterministic findings are retained and the report records the model issue, usually with a partial status.

## Analyze a package in the web app

In Live API mode, choose the package and source inputs:

### Published package

- **NPM Registry Package:** Enter the exact package name and version, such as `ms` and `2.1.3`.
- **Upload Package Archive:** Select a `.tgz` package archive from your computer.

### Source code

- **Automatic Source Resolution:** Let Vajra use available package metadata and repository references to locate source. The result may be unresolved or tentative if the metadata does not identify an exact source revision.
- **Explicit GitHub Commit:** Provide a GitHub repository URL and commit SHA to compare against a specific revision.
- **Upload Source Archive:** Upload a `.zip` or `.tar.gz` source archive. Set the package root if the package is inside a larger repository folder.

Submit the analysis and wait for it to finish. Review the top-level tampering assessment, findings, file list, diffs, evidence, model status, and coverage. Use **Export JSON** or **Export Markdown** to save the report.

## Run an analysis with the CLI

The CLI uses the local API by default. Start the API first, then run commands from the repository root.

Analyze an exact npm release and let Vajra resolve its source:

```sh
npx tsx apps/cli/src/index.ts analyze --name ms --version 2.1.3
```

Analyze an uploaded package archive:

```sh
npx tsx apps/cli/src/index.ts analyze --package ./package.tgz
```

Analyze an uploaded package and source archive together:

```sh
npx tsx apps/cli/src/index.ts analyze --package ./package.tgz --source ./source.tar.gz
```

Compare an npm release against a specific GitHub commit:

```sh
npx tsx apps/cli/src/index.ts analyze \
  --name ms \
  --version 2.1.3 \
  --repository https://github.com/vercel/ms \
  --commit 1c6264b795492e8fdecbc82cb8802fcfbfc08d26
```

Set `VAJRA_API_URL` to use a different Vajra API URL. The CLI prints job progress and outputs the final report as JSON. A partial or failed analysis exits with a non-zero status.

## Watch npm packages

The watchlist can track package names and check for newer npm releases through the API:

```sh
npx tsx apps/cli/src/index.ts watch add ms
npx tsx apps/cli/src/index.ts watch list
npx tsx apps/cli/src/index.ts watch remove <watch-id>
npx tsx apps/cli/src/index.ts monitor --once
```

`monitor --once` checks the current watchlist and queues analyses when it finds new versions. It does not run continuously by itself. A scheduler or workflow must invoke it periodically.

## Archive and network safeguards

Vajra reads archive entries without extracting the archive to disk or running package code. It does not run package lifecycle hooks, install scripts, or build steps during analysis.

Ingestion applies bounded limits, including:

- 25 MiB compressed upload or download
- 100 MiB expanded archive content
- 5 MiB per archive entry
- 10,000 archive entries
- Maximum path depth of 32
- Expansion-ratio checks for large archives
- Network timeouts and a maximum of 3 redirects

Unsafe archive paths and unsupported entry types are rejected. Text previews are limited, and binary or oversized files may be reported as skipped or limited rather than fully compared. These safeguards reduce risk and resource use; they do not make arbitrary package files safe to execute. Vajra does not execute them.

## API endpoints

The local API currently provides:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health status |
| `POST` | `/api/uploads` | Upload a package or source archive |
| `POST` | `/api/analyses` | Create an analysis |
| `GET` | `/api/analyses` | List saved analyses |
| `GET` | `/api/analyses/:id` | Read an analysis and its status |
| `GET` | `/api/analyses/:id/files/:fileId` | Read compared file details |
| `GET` | `/api/analyses/:id/export` | Export a report |
| `GET`, `POST`, `DELETE` | `/api/watchlist` and `/api/watchlist/:id` | Manage watched packages |
| `POST` | `/api/monitor/once` | Check the watchlist once |

## Project layout

| Path | Contents |
| --- | --- |
| `apps/web` | React and Vite user interface |
| `apps/server` | Fastify API, analysis jobs, and HTTP routes |
| `apps/cli` | Command-line client for analysis and package watchlists |
| `packages/engine` | Source resolution, comparison, deterministic rules, and model explanations |
| `packages/ingestion` | npm, GitHub, and archive retrieval and parsing |
| `packages/contracts` | Shared request, report, and API schemas |
| `packages/storage` | SQLite persistence |
| `packages/reports` | JSON and Markdown report output |
| `test-fixtures` | Synthetic clean and tampered package/source examples |
| `reports` | Saved example analysis reports |

## Run checks

```sh
npm run build
npm run check
```

`npm run check` runs the repository's type checks and automated tests. The tests use deterministic fixtures and do not require a live npm package or an AI model.

## Deploy with Vercel and Render

The repository contains `vercel.json` and `render.yaml` for deployment. Vercel serves the built web app and forwards `/api/*` requests to Render. Render runs the API and uses a persistent disk for the database, uploaded archives, and analysis workspaces.

1. Create the API service from the Render Blueprint in `render.yaml`.
2. Confirm its service URL matches the destination in `vercel.json`. If the URL differs, update that destination before deploying the web app.
3. Import the repository into Vercel with the repository root as the project root. The Vercel config supplies the build and output settings.
4. Check `/api/health` through the deployed Vercel site after both services are live.

The Render deployment sets `VAJRA_MODEL=none`. Production therefore runs deterministic checks without Ollama or Qwen; local runs still default to Qwen. The Render Blueprint uses a paid Starter service and a 1 GB persistent disk. See [Render's persistent disk documentation](https://render.com/docs/disks) for current requirements and limitations.

Vajra does not currently have built-in user sign-in or API access control. Treat a deployment as a private demo unless an access-control layer is enabled. Protecting the Vercel website alone does not prevent direct requests to the Render API URL. Do not use the deployment for sensitive data or expose it publicly without addressing this.

## Limitations and interpretation

- A SHA-256 mismatch means two files differ. It does not establish why they differ or whether a change is malicious.
- A clean comparison only describes the selected package and selected source revision. It is not a general safety guarantee.
- Source metadata and repository links are not authenticated provenance. Automatic source resolution can be tentative or unresolved.
- Static rules find selected code patterns. They do not prove that a call runs, what data reaches it, or the author's intent. Obfuscation, unsupported languages, computed behavior, and generated transformations may be missed.
- The model explains selected findings. It is not the source of truth for file hashes or evidence, and semantic explanations can still be wrong.
- Large, binary, or unsupported files may be partially inspected or skipped. Read coverage and limitations before interpreting a report.
- Synthetic fixtures demonstrate expected behavior. The small evaluation set is not a broad malware-detection accuracy benchmark.
- The watchlist monitor runs when invoked. It needs an external scheduler for recurring checks.

## More project notes

- [Team PRD](VAJRA_TEAM_PRD.md)
- [Engine notes](packages/engine/README.md)
- [Shared contracts and adapter guidance](packages/contracts/README.md)
- [Project roadmap](ROADMAP.md)
- [Hackathon summary](HACKATHON.md)

