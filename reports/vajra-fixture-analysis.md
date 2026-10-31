# Vajra analysis report: uploaded fixture ZIP

- **Run date:** 1 November 2026
- **Input:** `vajra-fixtures.zip`
- **Package under review:** `ms@2.1.3`
- **Source selected for normal cases:** `https://github.com/vercel/ms` at commit `1c6264b795492e8fdecbc82cb8802fcfbfc08d26`
- **Model:** Not configured; deterministic checks only.

## Summary

Vajra successfully read the original package archive and all six tampered variants, fetched the pinned GitHub source snapshot, and produced reports with file-level evidence. It detected three of the four planted suspicious changes. It did not correctly classify the planted source-code behavior change, and it did not explain the harmless rename/comment. The source-ambiguity case was marked unresolved, but the resolver selected the variant's `gitHead` commit rather than reporting the conflict between that pointer and the 2.1.3 release tag.

**Assessment:** The tool is working for archive ingestion, pinned source retrieval, comparisons, and several planted-change signals. This run also found important detection and source-resolution gaps. It is not yet reliable enough to treat its results as a complete security assessment.

## Input verification and method

The ZIP labels the cases as development fixtures, not real npm releases. All six synthetic archive SHA-256 values and the original archive SHA-256 matched the ZIP's `manifest.json`. The fixture README says package scripts and package contents must not be executed. No archive was installed and no package code was run.

Each archive was supplied to Vajra's ingestion adapter as a package upload. The ordinary cases were compared against the exact release commit above. The ambiguity case used automatic source resolution to observe the engine's source-selection behavior. Model assistance was disabled. Full results, including each report and file details, are in `vajra-fixture-analysis.json` beside this report.

## Results

| Fixture | Expected | Vajra result | Assessment |
| --- | --- | --- | --- |
| Original `ms@2.1.3` | Control | No suspicious-change finding; several packaging explanations | No planted change indicated. Report is partial because some source files were omitted from the package and `package-lock.json` exceeded inspection limits. |
| Lifecycle script injection | Suspicious change | `lifecycle_change` — suspicious | Detected. The report identifies the added `postinstall` script in `package.json`. |
| Outbound request injection | Suspicious change | `published_executable` and `introduced_network` — suspicious | Detected. The added `lib/telemetry.js` is identified as package-only and contains an introduced HTTPS call. |
| Unexpected executable content | Suspicious change | `published_executable` — suspicious | Detected as package-only executable source. The engine does not currently preserve or assess executable mode, so the finding is based on added code, not the mode bit. |
| Source modification | Suspicious change | `unexplained_difference` — unresolved | Missed the expected suspicious classification. `index.js` was reported modified, but the behavior change was not recognized by a rule. |
| Harmless packaging change | Explained packaging | `unexplained_difference` — unresolved | False unresolved result. Vajra did not recognize the variable rename and added comment as behavior-preserving. |
| Source ambiguity | Unresolved | Partial report with unresolved differences; source method `release_git_head`, commit `7920885e…` | Partially correct label, but source selection did not flag the conflicting release tag. It compared against the publisher-supplied 2.1.2 commit instead of explicitly reporting both candidates. |

All seven reports were `partial`, because the model was disabled and at least one source file could not be fully inspected. In particular, the repository's `package-lock.json` was marked skipped/truncated. The partial status is appropriate and should be shown to reviewers.

## Key gaps exposed

1. A source file changed in a behavioral way can remain only `unresolved`; the current rules do not determine whether the altered expression is suspicious.
2. Harmless identifier and comment changes are not explained and can create unresolved findings.
3. Automatic source resolution trusts `gitHead` ahead of release-tag candidates, so a conflicting pointer does not currently produce the expected ambiguity warning.
4. Package-lock text was truncated despite being about 68 KB, leaving coverage incomplete. The report correctly marks it skipped, but the effective text limit/configuration needs review.
5. Executable permission bits are not represented in findings. The unexpected-script fixture was caught because it was a newly added code file, not because Vajra noticed mode `0755`.

## Verdict

**The end-to-end local engine path works, but this evaluation does not pass all expected fixture outcomes.** It caught 3/4 planted suspicious cases and exposed two incorrect/unhelpful classifications plus an ambiguity-resolution issue. Treat this as a development regression report, not a malware-accuracy measurement.
