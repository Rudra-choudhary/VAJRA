import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AnalysisJob,
  AnalysisReport,
  ApiError,
  FileDetail,
  JobStatus,
  Stage,
  WatchEntry,
} from "@vajra/contracts";

/** Persistence interface for Vajra jobs, reports, file details, and watchlist entries. */
export interface Storage {
  /** Insert or update an analysis job record. */
  saveJob(job: AnalysisJob): void;
  /** Retrieve an analysis job by ID, or null if not found. */
  getJob(id: string): AnalysisJob | null;
  /** List analysis jobs ordered newest-first with cursor pagination. */
  listJobs(
    limit: number,
    cursor: string | null,
  ): { items: AnalysisJob[]; nextCursor: string | null };
  /** Persist a completed or partial analysis report. */
  saveReport(report: AnalysisReport): void;
  /** Retrieve a report by ID, or null if not found. */
  getReport(id: string): AnalysisReport | null;
  /** Persist a single file's text/diff detail for an analysis. */
  saveFileDetail(analysisId: string, fileId: string, detail: FileDetail): void;
  /** Retrieve a file's text/diff detail, or null if not found. */
  getFileDetail(analysisId: string, fileId: string): FileDetail | null;
  /** Return all entries in the package watchlist. */
  listWatch(): WatchEntry[];
  /** Insert or update a watchlist entry and return it. */
  upsertWatch(entry: WatchEntry): WatchEntry;
  /** Delete a watchlist entry by ID. */
  deleteWatch(id: string): void;
  /** Retrieve a single watchlist entry by ID, or null if not found. */
  getWatch(id: string): WatchEntry | null;
  /** Close the underlying SQLite database connection. */
  close(): void;
}

interface JobRow {
  id: string;
  status: JobStatus;
  stage: Stage;
  report: string | null;
  error: string | null;
}

interface BodyRow {
  body: string;
}

function hydrateJob(id: string, row: Omit<JobRow, "id">): AnalysisJob {
  return {
    id,
    status: row.status,
    stage: row.stage,
    report: row.report ? (JSON.parse(row.report) as AnalysisReport) : undefined,
    error: row.error ? (JSON.parse(row.error) as ApiError) : undefined,
  };
}

/**
 * Opens (or creates) a SQLite database at `dbPath`, initializes tables if
 * needed, and returns a typed `Storage` repository.
 */
export function createStorage(dbPath: string): Storage {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, stage TEXT NOT NULL, report TEXT, error TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS file_details (analysis_id TEXT NOT NULL, file_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (analysis_id, file_id));
    CREATE TABLE IF NOT EXISTS watchlist (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  `);
  const getJobStmt = db.prepare(
    "SELECT status, stage, report, error FROM jobs WHERE id = ?",
  );
  const insertJob = db.prepare(
    "INSERT INTO jobs (id,status,stage,report,error,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,stage=excluded.stage,report=excluded.report,error=excluded.error",
  );
  const listJobsStmt = db.prepare(
    "SELECT id,status,stage,report,error,created_at FROM jobs WHERE (? IS NULL OR created_at < (SELECT created_at FROM jobs WHERE id = ?)) ORDER BY created_at DESC LIMIT ?",
  );
  const insertReport = db.prepare(
    "INSERT INTO reports (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
  );
  const getReportStmt = db.prepare("SELECT body FROM reports WHERE id = ?");
  const insertDetail = db.prepare(
    "INSERT INTO file_details (analysis_id,file_id,body) VALUES (?,?,?) ON CONFLICT(analysis_id,file_id) DO UPDATE SET body=excluded.body",
  );
  const getDetailStmt = db.prepare(
    "SELECT body FROM file_details WHERE analysis_id = ? AND file_id = ?",
  );
  const listWatchStmt = db.prepare("SELECT body FROM watchlist");
  const upsertWatchStmt = db.prepare(
    "INSERT INTO watchlist (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
  );
  const getWatchStmt = db.prepare("SELECT body FROM watchlist WHERE id = ?");
  const deleteWatchStmt = db.prepare("DELETE FROM watchlist WHERE id = ?");

  return {
    saveJob(job) {
      insertJob.run(
        job.id,
        job.status,
        job.stage,
        job.report ? JSON.stringify(job.report) : null,
        job.error ? JSON.stringify(job.error) : null,
        new Date().toISOString(),
      );
    },
    getJob(id) {
      const row = getJobStmt.get(id) as Omit<JobRow, "id"> | undefined;
      return row ? hydrateJob(id, row) : null;
    },
    listJobs(limit, cursor) {
      const rows = listJobsStmt.all(cursor, cursor, limit + 1) as unknown as JobRow[];
      const items = rows.slice(0, limit).map((r) => hydrateJob(r.id, r));
      const nextCursor =
        rows.length > limit && rows[limit - 1] ? rows[limit - 1]!.id : null;
      return { items, nextCursor };
    },
    saveReport(report) {
      insertReport.run(report.id, JSON.stringify(report));
    },
    getReport(id) {
      const row = getReportStmt.get(id) as BodyRow | undefined;
      return row ? (JSON.parse(row.body) as AnalysisReport) : null;
    },
    saveFileDetail(analysisId, fileId, detail) {
      insertDetail.run(analysisId, fileId, JSON.stringify(detail));
    },
    getFileDetail(analysisId, fileId) {
      const row = getDetailStmt.get(analysisId, fileId) as BodyRow | undefined;
      return row ? (JSON.parse(row.body) as FileDetail) : null;
    },
    listWatch() {
      return (listWatchStmt.all() as unknown as BodyRow[]).map(
        (r) => JSON.parse(r.body) as WatchEntry,
      );
    },
    upsertWatch(entry) {
      upsertWatchStmt.run(entry.id, JSON.stringify(entry));
      return entry;
    },
    deleteWatch(id) {
      deleteWatchStmt.run(id);
    },
    getWatch(id) {
      const row = getWatchStmt.get(id) as BodyRow | undefined;
      return row ? (JSON.parse(row.body) as WatchEntry) : null;
    },
    close() {
      db.close();
    },
  };
}
