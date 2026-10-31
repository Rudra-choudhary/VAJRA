# Vajra package analysis fixtures

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
