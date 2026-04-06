import path from "node:path";

import { appendCsvRows, csvEscape } from "./csv-report.ts";
import type { SendOneResult } from "../network/send-one.ts";

export type BurstMetricEntry = {
  requestId: number;
  result: SendOneResult;
};

export type SporadicMetricEntry = {
  requestId: number;
  idleBeforeMs: number;
  result: SendOneResult;
};

export type SteadyMetricEntry = {
  requestId: number;
  intervalMs: number;
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
const DEFAULT_STEADY_RESULTS_FILE = path.join("results", "steady_raw.csv");

export const REQUEST_ONCE_CSV_HEADER = "request_id,started_at,ttfb_ms,status_code,error";
export const BURST_CSV_HEADER = "run_started_at,request_id,started_at,ttfb_ms,status_code,error";
export const SPORADIC_CSV_HEADER =
  "run_started_at,request_id,idle_before_ms,started_at,ttfb_ms,status_code,error";
export const STEADY_CSV_HEADER =
  "run_started_at,request_id,interval_ms,started_at,ttfb_ms,status_code,error";

type MetricReportOptions = {
  resultsFile?: string;
};

function resolveResultsFile(defaultFile: string, override?: string): string {
  return override ?? process.env.RESULTS_FILE ?? defaultFile;
}

function toCsvRow(values: Array<string | number | null>): string {
  return values.map(csvEscape).join(",");
}

async function writeMetricReport(report: CsvMetricReport): Promise<string> {
  return appendCsvRows(report.resultsFile, report.header, report.rows);
}

export function createRequestOnceMetricReport(result: SendOneResult, options: MetricReportOptions = {}): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_REQUEST_ONCE_RESULTS_FILE, options.resultsFile),
    header: REQUEST_ONCE_CSV_HEADER,
    rows: [
      toCsvRow([1, result.sentAt, result.ttfbMs, result.status, result.errorMessage]),
    ],
  };
}

export function createBurstMetricReport(
  runStartedAt: string,
  results: readonly BurstMetricEntry[],
  options: MetricReportOptions = {},
): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_BURST_RESULTS_FILE, options.resultsFile),
    header: BURST_CSV_HEADER,
    rows: results.map(({ requestId, result }) =>
      toCsvRow([runStartedAt, requestId, result.sentAt, result.ttfbMs, result.status, result.errorMessage]),
    ),
  };
}

export function createSporadicMetricReport(
  runStartedAt: string,
  results: readonly SporadicMetricEntry[],
  options: MetricReportOptions = {},
): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_SPORADIC_RESULTS_FILE, options.resultsFile),
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

export function createSteadyMetricReport(
  runStartedAt: string,
  results: readonly SteadyMetricEntry[],
  options: MetricReportOptions = {},
): CsvMetricReport {
  return {
    resultsFile: resolveResultsFile(DEFAULT_STEADY_RESULTS_FILE, options.resultsFile),
    header: STEADY_CSV_HEADER,
    rows: results.map(({ requestId, intervalMs, result }) =>
      toCsvRow([runStartedAt, requestId, intervalMs, result.sentAt, result.ttfbMs, result.status, result.errorMessage]),
    ),
  };
}

export async function saveRequestOnceMetric(result: SendOneResult, options: MetricReportOptions = {}): Promise<string> {
  return writeMetricReport(createRequestOnceMetricReport(result, options));
}

export async function saveBurstMetrics(
  runStartedAt: string,
  results: readonly BurstMetricEntry[],
  options: MetricReportOptions = {},
): Promise<string> {
  return writeMetricReport(createBurstMetricReport(runStartedAt, results, options));
}

export async function saveSporadicMetrics(
  runStartedAt: string,
  results: readonly SporadicMetricEntry[],
  options: MetricReportOptions = {},
): Promise<string> {
  return writeMetricReport(createSporadicMetricReport(runStartedAt, results, options));
}

export async function saveSteadyMetrics(
  runStartedAt: string,
  results: readonly SteadyMetricEntry[],
  options: MetricReportOptions = {},
): Promise<string> {
  return writeMetricReport(createSteadyMetricReport(runStartedAt, results, options));
}
