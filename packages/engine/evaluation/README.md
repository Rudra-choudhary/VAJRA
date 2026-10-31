# Engine evaluation receipts

## Real releases and controlled changes

Results are 16/16 planted cases flagged across 8 releases; only 2 releases (8 analyses: is-even and isobject, including original/harmless controls and planted variants) were held out from rule tuning. This is a small controlled evaluation, not an accuracy claim about real-world malicious packages.

Run `npm run evaluate:engine` from the repository root to download bounded public archives, resolve their recorded commit snapshots, and reproduce the deterministic comparisons. The collector is an evaluation harness, not the production ingestion adapter. It never extracts or executes downloaded content. Raw archives/source data stay under ignored `.vajra/`.

`real-release-results.json` records package versions, exact source commits, archive hashes, source URLs and actual findings. Each release has an original control, a lifecycle injection, a network/sensitive-data injection and a harmless text addition. Modified variants use a canonical file-inventory digest, explicitly distinguished from an archive digest. The domains and commands in injections are controlled fixture strings and are never executed.

Eight releases produced 32 analyses. All 16 planted-change cases produced suspicious findings; none of the 16 original/harmless variants produced suspicious findings in this run. This counts cases with signals, not confirmed malware or universal accuracy. Informational unresolved differences still appear. Models were disabled, so reports are partial by design.

Six releases informed development. Kleur exposed two normal build outputs that initially raised generic executable-file warnings; the general source-declared-entry-point rule was improved and covered by synthetic regressions. Therefore these six releases are regression cases, not independent test data. Two additional releases, is-even 1.0.0 and isobject 3.0.1, were evaluated after that adjustment without further tuning. Their four planted-change cases were flagged and their four original/harmless controls produced no suspicious findings. These small, older packages and known injection recipes do not represent the full organizer evaluation distribution.

## Local model check

`qwen-live-smoke.json` contains an actual qwen3.5:latest response to the controlled fixture in `src/testing.ts`, not a fabricated AI output. It produced five validated explanations in about 59 seconds. One finding was omitted by the intentionally restricted model context in this smoke test; the report explicitly records partial coverage.

A single inference run is a functionality and latency check, not a model-quality benchmark. Machine load, caching and model warm-up affect timing. Qwen is the documented product model for the current implementation. Gemma's failed initial response is retained for transparency in `gemma-initial-rejected.json`; no Gemma quality claim or passing run is made.
