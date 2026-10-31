import React from "react";
import type { FixtureId } from "../api/fixtures/index.js";
import { FIXTURES } from "../api/fixtures/index.js";

export type NavTab = "review" | "history" | "watchlist";

export interface HeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isMock: boolean;
  onToggleTransport: () => void;
  selectedFixtureId: FixtureId;
  onSelectFixture: (id: FixtureId) => void;
  serverOnline: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isMock,
  onToggleTransport,
  selectedFixtureId,
  onSelectFixture,
  serverOnline,
}) => {
  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">
            ⚡
          </div>
          <div className="brand-titles">
            <h1 className="brand-name">VAJRA</h1>
            <span className="brand-tagline">
              Package vs Source Integrity Analyzer
            </span>
          </div>
        </div>

        <div className="header-controls">
          <div className="transport-mode-card">
            <div className="transport-status">
              <span
                className={`status-dot ${isMock ? "dot-fixture" : serverOnline ? "dot-online" : "dot-offline"}`}
                aria-hidden="true"
              />
              <span className="transport-label">
                {isMock ? (
                  <strong className="text-warning">Contract Fixtures</strong>
                ) : (
                  <span>
                    Live API:{" "}
                    <strong>
                      {serverOnline === null
                        ? "Checking…"
                        : serverOnline
                          ? "Connected"
                          : "Unreachable"}
                    </strong>
                  </span>
                )}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-outline btn-sm mode-toggle-btn"
              onClick={onToggleTransport}
              title={
                isMock
                  ? "Switch to live API (/api)"
                  : "Switch to contract fixtures"
              }
            >
              {isMock ? "Switch to Live API" : "Switch to Fixtures"}
            </button>
          </div>

          {isMock && (
            <div className="fixture-picker">
              <label htmlFor="fixture-select" className="fixture-label">
                Demo Fixture:
              </label>
              <select
                id="fixture-select"
                className="select-input select-sm"
                value={selectedFixtureId}
                onChange={(e) => onSelectFixture(e.target.value as FixtureId)}
              >
                {Object.entries(FIXTURES).map(([id, fix]) => (
                  <option key={id} value={id}>
                    {fix.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {isMock && (
        <div className="fixture-notice-banner" role="status">
          <span className="notice-icon" aria-hidden="true">
            ⓘ
          </span>
          <span className="notice-text">
            <strong>Demonstration Fixture Active:</strong> Displaying synthetic
            contract data (
            {FIXTURES[selectedFixtureId]?.description ?? "Development fixture"}
            ). Never represents a live assessment.
          </span>
        </div>
      )}

      <nav className="header-nav" aria-label="Main Navigation">
        <div className="nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "review"}
            className={`nav-tab ${activeTab === "review" ? "active" : ""}`}
            onClick={() => onTabChange("review")}
            id="tab-review"
          >
            <span className="tab-icon" aria-hidden="true">
              🔍
            </span>
            <span>Review & Analysis</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "history"}
            className={`nav-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => onTabChange("history")}
            id="tab-history"
          >
            <span className="tab-icon" aria-hidden="true">
              🕒
            </span>
            <span>Analysis History</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "watchlist"}
            className={`nav-tab ${activeTab === "watchlist" ? "active" : ""}`}
            onClick={() => onTabChange("watchlist")}
            id="tab-watchlist"
          >
            <span className="tab-icon" aria-hidden="true">
              👁
            </span>
            <span>Watchlist</span>
          </button>
        </div>
      </nav>
    </header>
  );
};
