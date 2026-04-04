import { promises as fs } from "node:fs";
import path from "node:path";

import type { SendOneResult } from "./send-one";

type SavedMetric = {
    requestId: number;
    startedAt: string;
    ttfbMs: number | null;
    statusCode: number | null;
    error: string | null;
};

const RESULTS_FILE = process.env.RESULTS_FILE ?? path.join("results", "ttfb_raw.csv");

function csvEscape(value: string | number | null): string {
    if (value === null) {
        return "";
    }

    const text = String(value);

    if (!/[",\n\r]/.test(text)) {
        return text;
    }

    return `"${text.replaceAll("\"", '""')}"`;
}

async function saveMetric(metric: SavedMetric): Promise<string> {
    const outputPath = path.resolve(process.cwd(), RESULTS_FILE);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);

    if (!fileExists) {
        await fs.writeFile(outputPath, "request_id,started_at,ttfb_ms,status_code,error\n", "utf8");
    }

    const row = [
        csvEscape(metric.requestId),
        csvEscape(metric.startedAt),
        csvEscape(metric.ttfbMs),
        csvEscape(metric.statusCode),
        csvEscape(metric.error),
    ].join(",");

    await fs.appendFile(outputPath, `${row}\n`, "utf8");
    return outputPath;
}

export async function reportRequestOnce(result: SendOneResult): Promise<void> {
    const csvWritten = await saveMetric({
        requestId: 1,
        startedAt: result.sentAt,
        ttfbMs: result.ttfbMs,
        statusCode: result.status,
        error: result.errorMessage,
    });

    console.log(`status: ${result.status ?? "n/a"}`);
    console.log(`ttfb_ms: ${result.ttfbMs ?? "n/a"}`);
    console.log(`elapsed_ms: ${result.elapsedMs}`);
    console.log("body:");
    console.log(result.bodyRaw);
    console.log(`csv_written: ${csvWritten}`);
}