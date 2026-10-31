import React, { useEffect, useState } from "react";
import type { AnalysisSummary } from "@vajra/contracts";
import type { VajraTransport } from "../api/transport.js";
import { formatDate, getJobStatusBadge } from "../utils/formatters.js";
import { Button, EmptyState, ErrorBanner, LoadingState } from "./Common.js";

export interface HistoryViewProps {
  transport: VajraTransport;
  onOpenAnalysis: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  transport,
  onOpenAnalysis,
}) => {
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await transport.listAnalyses();
      setItems(res.items);
    } catch (err: any) {
      setError(err.message || "Failed to load analysis history.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [transport]);

  return (
    <section className="card history-card" aria-labelledby="history-heading">
      <div className="card-header">
        <div>
          <h2 id="history-heading" className="card-title">
            Analysis History
          </h2>
          <p className="card-subtitle">
            Prior package reviews recorded in the persistence store.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchHistory}
          disabled={isLoading}
        >
          🔄 Refresh
        </Button>
      </div>

      {isLoading ? (
        <LoadingState message="Loading analysis history…" />
      ) : error ? (
        <ErrorBanner
          title="History Unavailable"
          message={error}
          retryable={true}
          onRetry={fetchHistory}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🕒"
          title="No Past Analyses Found"
          description="Submit an analysis from the Review tab to begin inspecting npm releases."
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Package / Identifier</th>
                <th scope="col">Version</th>
                <th scope="col">Findings</th>
                <th scope="col">Analyzed At</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const statusMeta = getJobStatusBadge(item.status);
                return (
                  <tr key={item.id}>
                    <td>
                      <span
                        className={`status-badge-pill ${statusMeta.className}`}
                      >
                        {statusMeta.symbol} {statusMeta.label}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <strong>{item.name ?? "unnamed"}</strong>
                        {item.id.startsWith("fixture_") && (
                          <span className="status-badge-pill status-skipped">
                            FIXTURE
                          </span>
                        )}
                      </div>
                      <div className="cell-id font-mono text-muted">
                        {item.id}
                      </div>
                    </td>
                    <td>
                      <code className="font-mono">{item.version ?? "—"}</code>
                    </td>
                    <td>
                      <span className="findings-count-tag">
                        {item.findingCount}{" "}
                        {item.findingCount === 1 ? "finding" : "findings"}
                      </span>
                    </td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onOpenAnalysis(item.id)}
                        title="Load and inspect report"
                      >
                        Inspect Report ↗
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
