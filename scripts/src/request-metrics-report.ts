import path from "node:path";

import { appendCsvRows, csvEscape } from "./csv-report";
import type { SendOneResult } from "./send-one";

export type BurstMetricEntry = {
  requestId: number;
  result: SendOneResult;
};

export type SporadicMetricEntry = {
  requestId: number;
  idleBeforeMs: number;
  result: SendOneResult;
};

type CsvMetricReport = {
  resultsFile: string;
  header: string;
  rows: string[];
};

const DEFAULT_REQUEST_ONCE_RESULTS_FILE = path.join("results", "ttfb_raw.csv");
const DEFAULT_BURST_RESULTS_FILE = path.join("results", "burst_raw.csv");
const DEFAULT_SPORADIC_RESULTS_FILE = path.join("results", "sporadic_raw.csv");

export const REQUEST_ONCE_CSV_HEADER = "request_id,started_at,ttfb_ms,status_code,error";
export const BURST_CSV_HEADER = "run_started_at,request_id,started_at,ttfb_ms,status_code,error";
export const SPORADIC_CSV_HEADER =
  "run_started_at,request_id,idle_before_ms,started_at,ttfb_ms,status_code,error";

function resolveResultsFile(defaultFile: string): string {
  return process.env.RESULTS_FILE ?? defaultFile;
}

function toCsvRow(values: Array<string | number | null>): string {
  return values.map(csvEscape).join(",");
}

async function writeMetricReport(report: CsvMetricReport): Promise<string> {
  return appendCsvRows(report.resultsFile, report.header, report.rows);
}

export function createRequestOnceMetricReport(result: SendOneResult): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_REQUEST_ONCE_RESULTS_FILE),
    header: REQUEST_ONCE_CSV_HEADER,
    rows: [
      toCsvRow([1, result.sentAt, result.ttfbMs, result.status, result.errorMessage]),
    ],
  };
}

export function createBurstMetricReport(runStartedAt: string, results: readonly BurstMetricEntry[]): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_BURST_RESULTS_FILE),
    header: BURST_CSV_HEADER,
    rows: results.map(({ requestId, result }) =>
      toCsvRow([runStartedAt, requestId, result.sentAt, result.ttfbMs, result.status, result.errorMessage]),
    ),
  };
}

export function createSporadicMetricReport(
  runStartedAt: string,
  results: readonly SporadicMetricEntry[],
): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_SPORADIC_RESULTS_FILE),
    header: SPORADIC_CSV_HEADER,
    rows: results.map(({ requestId, idleBeforeMs, result }) =>
      toCsvRow([
        runStartedAt,
        requestId,
        idleBeforeMs,
        result.sentAt,
        result.ttfbMs,
        result.status,
        result.errorMessage,
      ]),
    ),
  };
}

export async function saveRequestOnceMetric(result: SendOneResult): Promise<string> {
  return writeMetricReport(createRequestOnceMetricReport(result));
}

export async function saveBurstMetrics(
  runStartedAt: string,
  results: readonly BurstMetricEntry[],
): Promise<string> {
  return writeMetricReport(createBurstMetricReport(runStartedAt, results));
}

export async function saveSporadicMetrics(
  runStartedAt: string,
  results: readonly SporadicMetricEntry[],
): Promise<string> {
  return writeMetricReport(createSporadicMetricReport(runStartedAt, results));
}
