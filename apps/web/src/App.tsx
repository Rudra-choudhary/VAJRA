import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalysisJob,
  AnalysisRequest,
  EvidenceRef,
  FileDetail,
} from "@vajra/contracts";
import { HttpVajraClient } from "./api/client.js";
import { MockVajraClient } from "./api/mockClient.js";
import { FIXTURES, type FixtureId } from "./api/fixtures/index.js";
import { Header, type NavTab } from "./components/Header.js";
import { AnalysisInput } from "./components/AnalysisInput.js";
import { ProgressView } from "./components/ProgressView.js";
import { ReportOverview } from "./components/ReportOverview.js";
import {
  SearchableFileList,
  type FileStatusFilter,
} from "./components/SearchableFileList.js";
import { DiffViewer } from "./components/DiffViewer.js";
import { EvidenceReview } from "./components/EvidenceReview.js";
import { ExportActions } from "./components/ExportActions.js";
import { HistoryView } from "./components/HistoryView.js";
import { WatchlistView } from "./components/WatchlistView.js";
import { Button, LoadingState } from "./components/Common.js";

export const App: React.FC = () => {
  const [transportMode, setTransportMode] = useState<"mock" | "live">("mock");
  const [activeTab, setActiveTab] = useState<NavTab>("review");
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FixtureId>("suspicious");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Active transports
  const mockClient = useMemo(() => new MockVajraClient(), []);
  const httpClient = useMemo(() => new HttpVajraClient(), []);
  const activeTransport = transportMode === "live" ? httpClient : mockClient;

  // Analysis State
  const [currentJob, setCurrentJob] = useState<AnalysisJob | null>(null);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // File Review & Diff State
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<
    | { side: "package" | "source"; startLine?: number; endLine?: number }
    | undefined
  >(undefined);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>("all");
  const [findingsOnly, setFindingsOnly] = useState(false);

  // Check live API health periodically
  useEffect(() => {
    let isMounted = true;
    const checkServerHealth = async () => {
      try {
        await httpClient.checkHealth();
        if (isMounted) setServerOnline(true);
      } catch {
        if (isMounted) setServerOnline(false);
      }
    };

    checkServerHealth();
    const interval = setInterval(checkServerHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [httpClient]);

  // Load initial fixture or update when selected fixture changes
  useEffect(() => {
    if (transportMode === "mock") {
      mockClient.setFixture(selectedFixtureId);
      const fixtureData = FIXTURES[selectedFixtureId];
      if (fixtureData) {
        setCurrentJob(fixtureData.job);
        const firstFile = fixtureData.job.report?.files[0];
        if (firstFile) {
          setSelectedFileId(firstFile.id);
        } else {
          setSelectedFileId(null);
        }
      }
    }
  }, [transportMode, selectedFixtureId, mockClient]);

  // Load File Detail whenever selectedFileId changes
  useEffect(() => {
    let isCancelled = false;
    if (!currentJob || !selectedFileId) {
      setFileDetail(null);
      return;
    }

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setDetailError(null);
      try {
        const detail = await activeTransport.getFileDetail(
          currentJob.id,
          selectedFileId,
        );
        if (!isCancelled) {
          setFileDetail(detail);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDetailError(err.message || "Failed to load file diff.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDetail(false);
        }
      }
    };

    loadDetail();
    return () => {
      isCancelled = true;
    };
  }, [currentJob?.id, selectedFileId, activeTransport]);

  // Poll running jobs in live mode every 2000ms until terminal status
  useEffect(() => {
    if (
      transportMode !== "live" ||
      !currentJob ||
      (currentJob.status !== "queued" && currentJob.status !== "running")
    ) {
      return;
    }

    let isCancelled = false;
    const pollInterval = setInterval(async () => {
      try {
        const updated = await httpClient.getAnalysis(currentJob.id);
        if (!isCancelled) {
          setCurrentJob(updated);
          if (updated.status === "completed" || updated.status === "partial") {
            const firstFile = updated.report?.files[0];
            if (firstFile) setSelectedFileId(firstFile.id);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setJobError(err.message || "Failed to poll job status.");
        }
      }
    }, 2000);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
    };
  }, [transportMode, currentJob?.id, currentJob?.status, httpClient]);

  // Handle Analysis Submission
  const handleSubmitAnalysis = async (request: AnalysisRequest) => {
    setIsSubmitting(true);
    setJobError(null);
    try {
      const submission = await activeTransport.submitAnalysis(request);
      if (activeTransport.isMock) {
        // In mock mode, immediately load the active fixture
        const job = await activeTransport.getAnalysis(submission.id);
        setCurrentJob(job);
        const firstFile = job.report?.files[0];
        if (firstFile) setSelectedFileId(firstFile.id);
      } else {
        // In live mode, set queued state and begin polling
        setCurrentJob({
          id: submission.id,
          status: "queued",
          stage: "queued",
        });
      }
      setActiveTab("review");
    } catch (err: any) {
      setJobError(err.message || "Analysis submission failed.");
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Analysis by ID (from History or Watchlist)
  const handleOpenAnalysis = useCallback(
    async (id: string) => {
      setIsLoadingJob(true);
      setJobError(null);
      setActiveTab("review");
      try {
        const job = await activeTransport.getAnalysis(id);
        setCurrentJob(job);
        const firstFile = job.report?.files[0];
        if (firstFile) setSelectedFileId(firstFile.id);
      } catch (err: any) {
        setJobError(err.message || `Failed to load analysis ${id}`);
      } finally {
        setIsLoadingJob(false);
      }
    },
    [activeTransport],
  );

  const handleSelectEvidence = (ev: EvidenceRef) => {
    setSelectedFileId(ev.fileId);
    setHighlightRange({
      side: ev.side,
      startLine: ev.startLine,
      endLine: ev.endLine,
    });
  };

  const handleToggleTransport = () => {
    const nextMode = transportMode === "live" ? "mock" : "live";
    setTransportMode(nextMode);
    setCurrentJob(null);
    setSelectedFileId(null);
    setFileDetail(null);
    setJobError(null);
  };

  const handleRetryJob = async () => {
    if (currentJob?.report?.request) {
      await handleSubmitAnalysis(currentJob.report.request);
    } else {
      setCurrentJob(null);
    }
  };

  const handleResetAnalysis = () => {
    setCurrentJob(null);
    setSelectedFileId(null);
    setFileDetail(null);
  };

  const selectedFileSummary = useMemo(() => {
    if (!currentJob?.report || !selectedFileId) return null;
    return currentJob.report.files.find((f) => f.id === selectedFileId) ?? null;
  }, [currentJob?.report, selectedFileId]);

  return (
    <div className="vajra-app">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMock={transportMode === "mock"}
        onToggleTransport={handleToggleTransport}
        selectedFixtureId={selectedFixtureId}
        onSelectFixture={setSelectedFixtureId}
        serverOnline={serverOnline}
      />

      <main id="main-content" className="app-main-container">
        {activeTab === "review" && (
          <div className="tab-pane review-tab-pane">
            {/* If no job is loaded, show the input form */}
            {!currentJob && (
              <AnalysisInput
                transport={activeTransport}
                onSubmit={handleSubmitAnalysis}
                isSubmitting={isSubmitting}
                onSelectFixture={(id) => {
                  setSelectedFixtureId(id);
                  if (transportMode !== "mock") setTransportMode("mock");
                }}
              />
            )}

            {/* If job is running or failed without a report, show ProgressView */}
            {currentJob &&
              (currentJob.status === "queued" ||
                currentJob.status === "running" ||
                (currentJob.status === "failed" && !currentJob.report)) && (
                <ProgressView
                  job={currentJob}
                  onRetry={handleRetryJob}
                  onReset={handleResetAnalysis}
                />
              )}

            {/* If job has a terminal report (completed or partial), show full review UI */}
            {currentJob?.report && (
              <div className="report-workspace">
                <div className="workspace-top-bar">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleResetAnalysis}
                  >
                    ← New Analysis
                  </Button>
                  <ExportActions
                    report={currentJob.report}
                    transport={activeTransport}
                  />
                </div>

                <ReportOverview report={currentJob.report} />

                {/* Split Review Workspace: Left = Searchable File List, Right = Diff & Evidence */}
                <div className="review-split-layout">
                  <aside
                    className="split-aside-panel"
                    aria-label="File Navigation"
                  >
                    <SearchableFileList
                      files={currentJob.report.files}
                      findings={currentJob.report.findings}
                      selectedFileId={selectedFileId}
                      onSelectFile={(id) => {
                        setSelectedFileId(id);
                        setHighlightRange(undefined);
                      }}
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      statusFilter={statusFilter}
                      onStatusFilterChange={setStatusFilter}
                      findingsOnly={findingsOnly}
                      onFindingsOnlyChange={setFindingsOnly}
                    />
                  </aside>

                  <section
                    className="split-main-panel"
                    aria-label="Diff and Evidence Workspace"
                  >
                    <DiffViewer
                      fileSummary={selectedFileSummary}
                      detail={fileDetail}
                      isLoading={isLoadingDetail}
                      error={detailError}
                      highlightRange={highlightRange}
                    />

                    <EvidenceReview
                      findings={currentJob.report.findings}
                      files={currentJob.report.files}
                      selectedFileId={selectedFileId}
                      onSelectEvidence={handleSelectEvidence}
                      onSelectFile={(id) => {
                        setSelectedFileId(id);
                        setHighlightRange(undefined);
                      }}
                    />
                  </section>
                </div>
              </div>
            )}

            {isLoadingJob && (
              <LoadingState message="Loading analysis report…" />
            )}
            {jobError && (
              <div className="banner banner-error mt-4" role="alert">
                {jobError}
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="tab-pane history-tab-pane">
            <HistoryView
              transport={activeTransport}
              onOpenAnalysis={handleOpenAnalysis}
            />
          </div>
        )}

        {activeTab === "watchlist" && (
          <div className="tab-pane watchlist-tab-pane">
            <WatchlistView
              transport={activeTransport}
              onOpenAnalysis={handleOpenAnalysis}
              onAnalyzePackage={(name) => {
                setActiveTab("review");
                handleResetAnalysis();
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
};
