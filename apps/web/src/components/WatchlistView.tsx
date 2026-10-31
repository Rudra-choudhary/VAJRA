import React, { useEffect, useState } from "react";
import type { WatchEntry } from "@vajra/contracts";
import type { VajraTransport } from "../api/transport.js";
import { formatDate, shortHash } from "../utils/formatters.js";
import { validateNpmName } from "../utils/validation.js";
import { Button, EmptyState, ErrorBanner, LoadingState } from "./Common.js";

export interface WatchlistViewProps {
  transport: VajraTransport;
  onOpenAnalysis: (id: string) => void;
  onAnalyzePackage: (name: string) => void;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  transport,
  onOpenAnalysis,
  onAnalyzePackage,
}) => {
  const [items, setItems] = useState<WatchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await transport.listWatchlist();
      setItems(res.items);
    } catch (err: any) {
      setError(err.message || "Failed to load watchlist.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, [transport]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateNpmName(newName);
    if (err) {
      setNameError(err);
      return;
    }

    setNameError(null);
    setIsAdding(true);
    try {
      const created = await transport.addToWatchlist(newName.trim());
      setNewName("");
      setItems((prev) => {
        const filtered = prev.filter((item) => item.name !== created.name);
        return [created, ...filtered];
      });
    } catch (err: any) {
      setNameError(err.message || "Failed to add package to watchlist.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await transport.removeFromWatchlist(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to remove package from watchlist.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="watchlist-container">
      {/* Add Package Card */}
      <section
        className="card add-watch-card"
        aria-labelledby="add-watch-heading"
      >
        <h2 id="add-watch-heading" className="card-title">
          Monitor an NPM Package
        </h2>
        <p className="card-subtitle">
          Watch a package to track upcoming releases and run automated
          discrepancy analysis.
        </p>

        <form onSubmit={handleAdd} className="add-watch-form">
          <div className="form-field flex-grow">
            <label htmlFor="watch-pkg-name" className="field-label sr-only">
              Package Name
            </label>
            <input
              id="watch-pkg-name"
              type="text"
              className={`text-input ${nameError ? "has-error" : ""}`}
              placeholder="e.g. express, @angular/core, lodash"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (nameError) setNameError(null);
              }}
              disabled={isAdding}
              autoComplete="off"
              spellCheck={false}
            />
            {nameError && (
              <span className="field-error" role="alert">
                {nameError}
              </span>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            isLoading={isAdding}
            disabled={isAdding}
          >
            Add to Watchlist
          </Button>
        </form>
      </section>

      {/* Watchlist Table */}
      <section
        className="card watchlist-items-card"
        aria-labelledby="watchlist-items-heading"
      >
        <div className="card-header">
          <div>
            <h3 id="watchlist-items-heading" className="card-title">
              Monitored Packages ({items.length})
            </h3>
            <p className="card-subtitle">
              Scheduled monitoring records release state and digests.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchWatchlist}
            disabled={isLoading}
          >
            🔄 Refresh
          </Button>
        </div>

        {isLoading ? (
          <LoadingState message="Loading watched packages…" />
        ) : error ? (
          <ErrorBanner
            title="Watchlist Error"
            message={error}
            retryable={true}
            onRetry={fetchWatchlist}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="👁"
            title="Watchlist is Empty"
            description="Add packages above to monitor future releases against their source repositories."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Package Name</th>
                  <th scope="col">Last Version</th>
                  <th scope="col">Last Digest</th>
                  <th scope="col">Last Checked</th>
                  <th scope="col">Status / Error</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="pkg-name font-mono">
                        {item.name}
                      </strong>
                    </td>
                    <td>
                      <code className="font-mono">
                        {item.lastVersion ?? "—"}
                      </code>
                    </td>
                    <td>
                      {item.lastDigest ? (
                        <code className="font-mono" title={item.lastDigest}>
                          {shortHash(item.lastDigest, 6)}
                        </code>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{formatDate(item.lastCheckedAt)}</td>
                    <td>
                      {item.lastError ? (
                        <span
                          className="status-badge-pill status-failed"
                          title={item.lastError.message}
                        >
                          ✕ {item.lastError.code}
                        </span>
                      ) : item.lastCheckedAt ? (
                        <span className="status-badge-pill status-identical">
                          ✓ Monitored
                        </span>
                      ) : (
                        <span className="status-badge-pill status-skipped">
                          ⏳ Pending
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {item.lastAnalysisId ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onOpenAnalysis(item.lastAnalysisId!)}
                            title="Inspect latest analysis report"
                          >
                            View Report
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onAnalyzePackage(item.name)}
                            title="Trigger analysis for this package"
                          >
                            Analyze
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          isLoading={deletingId === item.id}
                          disabled={deletingId === item.id}
                          onClick={() => handleDelete(item.id)}
                          title="Remove from watchlist"
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
