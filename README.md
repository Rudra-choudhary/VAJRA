# Vajra

Vajra compares an exact npm package release or uploaded package archive with a selected source snapshot, then reports differences with evidence and coverage limitations. It is a review aid, not a safety certification.

## Current capabilities

- Analysis engine with source resolution, package-root selection, raw hash comparison, bounded diffs, deterministic review rules, and optional Ollama explanations.
- npm release retrieval and safe `.tgz` inspection for package/source uploads. Archive content is parsed without extracting or executing it.
- Local Fastify API, SQLite persistence, JSON/Markdown report export, and React review UI.
- CLI analysis and watch commands use the local API; `monitor --once` checks watch entries and queues analyses for new npm versions.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci --ignore-scripts
npm run build
npm run check
```

Start the local API with `npx tsx apps/server/src/index.ts` (defaults to `127.0.0.1:3000`). Start the web UI with `npm run dev -w apps/web`; configure its API base URL as documented by the web client. The server uses `./data/vajra.db` and `./data/uploads` by default.

## Deploy with Vercel and Render

Vercel serves the built React app. Render runs the Fastify API and keeps its SQLite database, uploads, and analysis workspaces on a persistent disk. The Vercel rewrite sends `/api/*` requests to the Render API, so the browser uses one origin and does not need a CORS exception.

1. Create the API from this repository using Render Blueprint and `render.yaml`. The blueprint uses a persistent disk and sets `VAJRA_MODEL=none`, so production runs deterministic checks without Ollama. Reports will indicate that the model is not configured. Local startup still uses `qwen3.5:latest` by default.
2. Confirm the Render service URL is `https://vajra-api.onrender.com`. If Render assigns a different URL, update the API rewrite destination in `vercel.json` to that URL before deploying the frontend.
3. Import the same repository into Vercel. Keep the project root at the repository root. `vercel.json` sets the install command, Vite build command, output directory, API proxy, and SPA fallback.
4. After both services deploy, open the Vercel URL and check `/api/health`. Keep the Render persistent disk attached. Back it up before removing or replacing the service.

The Render blueprint uses the Starter plan because the API needs persistent disk storage. Vajra currently has no user sign-in or access control. For a private team demo, enable Vercel Deployment Protection or put the site behind an authentication layer. Do not expose the app publicly without access control.

The server uses `qwen3.5:latest` through a local Ollama server by default. Qwen reviews selected findings with bounded file and diff context, adds a plain-language interpretation, and lists uncertainty. Rule findings and their evidence remain authoritative; Qwen cannot invent evidence locations. Install the model with `ollama pull qwen3.5:latest`. Override the model with `VAJRA_MODEL`, or set `VAJRA_MODEL=none` to disable model calls. If Ollama is unavailable, deterministic findings are retained and the report records model failure and partial status. The recorded Qwen live smoke check is a functionality check, not a quality benchmark.

## Known limitations

- GitHub exact-commit retrieval is implemented, but its live behavior has not been verified against GitHub from this environment. Uploaded source archives are supported.
- Upload handles are opaque UUIDs stored under purpose-separated directories and survive server restarts; upload retention/cleanup policy is still minimal.
- The scheduled workflow uses GitHub Actions cache restore/save for local SQLite state. Cache eviction can cause safe reanalysis.
- The local API smoke startup succeeded, but an HTTP health request could not be confirmed in the restricted execution environment.
- Real npm source matching depends on publisher metadata and may remain unresolved. No package code or build scripts are executed.
- The evaluation uses a small set of real packages and controlled synthetic modifications. It is not a general malware detection accuracy benchmark.

See [VAJRA_TEAM_PRD.md](VAJRA_TEAM_PRD.md), [engine notes](packages/engine/README.md), and [contract/adapter guidance](packages/contracts/README.md) for requirements, limits, and interfaces.
