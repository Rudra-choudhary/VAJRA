import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AnalysisJob, AnalysisReport, FileDetail, WatchEntry } from "@vajra/contracts";

export interface Storage {
  saveJob(job: AnalysisJob): void;
  getJob(id: string): AnalysisJob | null;
  listJobs(limit: number, cursor: string | null): { items: AnalysisJob[]; nextCursor: string | null };
  saveReport(report: AnalysisReport): void;
  getReport(id: string): AnalysisReport | null;
  saveFileDetail(analysisId: string, fileId: string, detail: FileDetail): void;
  getFileDetail(analysisId: string, fileId: string): FileDetail | null;
  listWatch(): WatchEntry[];
  upsertWatch(entry: WatchEntry): WatchEntry;
  deleteWatch(id: string): void;
  getWatch(id: string): WatchEntry | null;
  close(): void;
}

export function createStorage(dbPath: string): Storage {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, stage TEXT NOT NULL, report TEXT, error TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS file_details (analysis_id TEXT NOT NULL, file_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (analysis_id, file_id));
    CREATE TABLE IF NOT EXISTS watchlist (id TEXT PRIMARY KEY, body TEXT NOT NULL);
  `);
  const getJobStmt = db.prepare("SELECT status, stage, report, error FROM jobs WHERE id = ?");
  const insertJob = db.prepare("INSERT INTO jobs (id,status,stage,report,error,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,stage=excluded.stage,report=excluded.report,error=excluded.error");
  const listJobsStmt = db.prepare("SELECT id,status,stage,report,error,created_at FROM jobs ORDER BY created_at DESC LIMIT ?");
  const insertReport = db.prepare("INSERT INTO reports (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body");
  const getReportStmt = db.prepare("SELECT body FROM reports WHERE id = ?");
  const insertDetail = db.prepare("INSERT INTO file_details (analysis_id,file_id,body) VALUES (?,?,?) ON CONFLICT(analysis_id,file_id) DO UPDATE SET body=excluded.body");
  const getDetailStmt = db.prepare("SELECT body FROM file_details WHERE analysis_id = ? AND file_id = ?");
  const listWatchStmt = db.prepare("SELECT body FROM watchlist");
  const upsertWatchStmt = db.prepare("INSERT INTO watchlist (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body");
  const getWatchStmt = db.prepare("SELECT body FROM watchlist WHERE id = ?");
  const deleteWatchStmt = db.prepare("DELETE FROM watchlist WHERE id = ?");

  return {
    saveJob(job) {
      insertJob.run(job.id, job.status, job.stage, job.report ? JSON.stringify(job.report) : null, job.error ? JSON.stringify(job.error) : null, new Date().toISOString());
    },
    getJob(id) {
      const row = getJobStmt.get(id) as any;
      if (!row) return null;
      return {
        id,
        status: row.status,
        stage: row.stage,
        report: row.report ? JSON.parse(row.report) : undefined,
        error: row.error ? JSON.parse(row.error) : undefined,
      } as AnalysisJob;
    },
    listJobs(limit, cursor) {
      const rows = listJobsStmt.all(limit + 1) as any[];
      const items = rows.slice(0, limit).map((r) => ({
        id: r.id,
        status: r.status,
        stage: r.stage,
        report: r.report ? JSON.parse(r.report) : undefined,
        error: r.error ? JSON.parse(r.error) : undefined,
      })) as AnalysisJob[];
      const nextCursor = rows.length > limit ? items[items.length - 1].id : null;
      return { items, nextCursor };
    },
    saveReport(report) {
      insertReport.run(report.id, JSON.stringify(report));
    },
    getReport(id) {
      const row = getReportStmt.get(id) as any;
      return row ? (JSON.parse(row.body) as AnalysisReport) : null;
    },
    saveFileDetail(analysisId, fileId, detail) {
      insertDetail.run(analysisId, fileId, JSON.stringify(detail));
    },
    getFileDetail(analysisId, fileId) {
      const row = getDetailStmt.get(analysisId, fileId) as any;
      return row ? (JSON.parse(row.body) as FileDetail) : null;
    },
    listWatch() {
      return (listWatchStmt.all() as any[]).map((r) => JSON.parse(r.body) as WatchEntry);
    },
    upsertWatch(entry) {
      upsertWatchStmt.run(entry.id, JSON.stringify(entry));
      return entry;
    },
    deleteWatch(id) {
      deleteWatchStmt.run(id);
    },
    getWatch(id) {
      const row = getWatchStmt.get(id) as any;
      return row ? (JSON.parse(row.body) as WatchEntry) : null;
    },
    close() {
      db.close();
    },
  };
}