# VAJRA Hackathon Details

## Team name

VAJRA

## Team members

1. Ayush Aryan
2. Aparna Singh
3. Rudra Pratap Singh Choudhary
4. Neeraj Singh

## Project owner

| Assignment | Owner | Responsibility |
| --- | --- | --- |
| A | Rudra Pratap Singh Choudhary | Technical lead, shared contracts, and analysis engine |

B, C, and D owners are assigned by the team separately.

## Selected problem statement

Problem 04 — Published Package vs Source Code Integrity Analyzer.

## Project

Vajra compares published npm packages with their source code, flags suspicious changes, and provides evidence-backed explanations.

## AI models used and selection rationale

### Open-weight product model

| Model | Selection rationale and intended role |
| --- | --- |
| [Qwen](https://huggingface.co/Qwen) | Qwen is the documented product model family for contextual explanations of package/source findings. The local integration smoke-tested `qwen3.5:latest` through Ollama. |

The engine includes an Ollama adapter with structured-output and evidence validation. A live integration check used `qwen3.5:latest` on a controlled tampering fixture. The smoke report is in `packages/engine/evaluation/qwen-live-smoke.json`.

Gemma 4 E4B (`gemma4:e4b`) was also attempted on the same controlled fixture. Its initial response was rejected because a cited excerpt did not match the source lines; the complete failed report is preserved in `packages/engine/evaluation/gemma-initial-rejected.json`. The engine correctly retained deterministic findings and marked model assessment failed. The evidence-ID contract was subsequently tightened so the model can select only existing finding evidence and cannot supply new locations. A passing Gemma rerun has not yet been recorded. These are model integration checks, not quality benchmarks. Full application integration remains in progress.

## AI coding assistants

OpenAI Codex has assisted with planning, documentation, and repository setup. It was chosen to support code-oriented reasoning, implementation planning, and verification workflows. Codex is disclosed as a coding assistant, not as an integrated product model.

### Team-declared development models

The team has declared the following models for development assistance. These names are recorded as provided by the team; they are not claims of product-runtime integration.

| Model | Selection rationale and intended role |
| --- | --- |
| GPT-6 | Complex implementation planning, analysis-engine development, and evidence-validation reasoning. |
| Claude Sonnet 5.5 | Module implementation, code review, and test development. |
| Gemini 3 | Research assistance, explanation review, and documentation support. |

Each pull request will disclose the models and coding assistants actually used for that change. The planned product models above are separate from development assistance; actual runtime usage will be documented after integration.
