import React from "react";
import type { AnalysisJob, Stage } from "@vajra/contracts";
import { getStageLabel } from "../utils/formatters.js";
import { Button, ErrorBanner } from "./Common.js";

const STAGES: { id: Stage; name: string; description: string }[] = [
  { id: "queued", name: "1. Queued", description: "In queue for execution" },
  {
    id: "retrieving",
    name: "2. Retrieving",
    description: "Fetching package artifact & source snapshot",
  },
  {
    id: "resolving",
    name: "3. Resolving",
    description: "Verifying commit, tags & package root mapping",
  },
  {
    id: "comparing",
    name: "4. Comparing",
    description: "Computing file hashes and unified diffs",
  },
  {
    id: "assessing",
    name: "5. Assessing",
    description: "Running deterministic rules & contextual AI model",
  },
  {
    id: "done",
    name: "6. Finalized",
    description: "Report generated and validated",
  },
];

export interface ProgressViewProps {
  job: AnalysisJob;
  onRetry?: () => void;
  onReset?: () => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  job,
  onRetry,
  onReset,
}) => {
  const currentStageIndex = STAGES.findIndex((s) => s.id === job.stage);
  const isFailed = job.status === "failed";

  return (
    <section className="card progress-card" aria-labelledby="progress-heading">
      <div className="card-header">
        <div>
          <h2 id="progress-heading" className="card-title">
            Analysis In Progress
          </h2>
          <p className="card-subtitle">
            Job ID: <code className="font-mono">{job.id}</code> — Status:{" "}
            <strong className={`status-text-${job.status}`}>
              {job.status.toUpperCase()}
            </strong>
          </p>
        </div>

        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            New Analysis
          </Button>
        )}
      </div>

      <div
        className="pipeline-container"
        role="region"
        aria-label="Pipeline Stages"
      >
        <div className="pipeline-stages">
          {STAGES.map((s, idx) => {
            let stepState: "completed" | "current" | "pending" | "failed" =
              "pending";
            if (isFailed && idx === currentStageIndex) {
              stepState = "failed";
            } else if (
              idx < currentStageIndex ||
              (job.stage === "done" && idx <= currentStageIndex)
            ) {
              stepState = "completed";
            } else if (idx === currentStageIndex) {
              stepState = "current";
            }

            return (
              <div
                key={s.id}
                className={`pipeline-step step-${stepState}`}
                aria-current={stepState === "current" ? "step" : undefined}
              >
                <div className="step-indicator" aria-hidden="true">
                  {stepState === "completed" && "✓"}
                  {stepState === "current" && <span className="step-pulse" />}
                  {stepState === "failed" && "✕"}
                  {stepState === "pending" && idx + 1}
                </div>
                <div className="step-content">
                  <h3 className="step-title">{s.name}</h3>
                  <p className="step-desc">{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="stage-live-announcer" role="status" aria-live="polite">
          Current Stage: <strong>{getStageLabel(job.stage)}</strong>
        </div>
      </div>

      {isFailed && job.error && (
        <div className="mt-4">
          <ErrorBanner
            title="Analysis Failed"
            message={job.error.message}
            code={job.error.code}
            retryable={job.error.retryable}
            onRetry={onRetry}
          />
        </div>
      )}
    </section>
  );
};
