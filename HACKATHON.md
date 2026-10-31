# VAJRA Hackathon Details

## Team name

VAJRA

## Team members

1. Ayush Aryan
2. Aparna Singh
3. Rudra Pratap Singh Choudhary
4. Neeraj Singh

## Selected problem statement

Problem 04 — Published Package vs Source Code Integrity Analyzer.

## Project

Vajra compares published npm packages with their source code, flags suspicious changes, and provides evidence-backed explanations.

## AI models used and selection rationale

### Planned open-weight product models

| Model | Selection rationale and intended role |
| --- | --- |
| [Gemma](https://ai.google.dev/gemma/docs) | Open-weight model family selected for explaining package/source differences and producing readable, evidence-backed findings. Exact variant and runtime will be recorded after validation. |
| [Qwen2.5-Coder-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) | Apache-2.0-licensed coding model selected for contextual analysis of code diffs and suspicious modifications. |

The engine now includes an Ollama adapter with structured-output and evidence validation. A live integration check used the already-installed `qwen3.5:latest` model on a controlled tampering fixture; it is distinct from the planned Qwen2.5 model above. Gemma 4 E4B is being downloaded for local comparison. The exact tested Gemma runtime and results will be recorded after validation. Full application integration remains in progress.

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
