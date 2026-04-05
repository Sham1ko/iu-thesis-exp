import { request, type RequestOptions } from "node:http";

export type SendOneResult = {
  ok: boolean;
  status: number | null;
  ttfbMs: number | null;
  elapsedMs: number;
  sentAt: string;
  receivedAt: string;
  bodyRaw: string;
  bodyJson: unknown | null;
  errorMessage: string | null;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

const REQUEST_TIMEOUT_MS = parsePositiveInteger(process.env.REQUEST_TIMEOUT_MS, 10_000);

const REQUEST_OPTIONS: RequestOptions = {
  hostname: process.env.REQUEST_HOSTNAME ?? "127.0.0.1",
  port: parsePositiveInteger(process.env.REQUEST_PORT, 8080),
  path: process.env.REQUEST_PATH ?? "/ping",
  method: "GET",
  headers: {
    Host: process.env.REQUEST_HOST ?? "node-benchmark.default.127.0.0.1.sslip.io",
  },
  timeout: REQUEST_TIMEOUT_MS,
};

function safeParseJson(value: string): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function sendOneRequest(): Promise<SendOneResult> {
  const startedAtMs = Date.now();
  const sentAt = new Date(startedAtMs).toISOString();

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: SendOneResult) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const fail = (message: string, status: number | null = null, bodyRaw = "", ttfbMs: number | null = null) => {
      const finishedAtMs = Date.now();

      finish({
        ok: false,
        status,
        ttfbMs,
        elapsedMs: finishedAtMs - startedAtMs,
        sentAt,
        receivedAt: new Date(finishedAtMs).toISOString(),
        bodyRaw,
        bodyJson: safeParseJson(bodyRaw),
        errorMessage: message,
      });
    };

    const req = request(REQUEST_OPTIONS, (res) => {
      let bodyRaw = "";
      const ttfbMs = Date.now() - startedAtMs;

      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        bodyRaw += chunk;
      });

      res.on("end", () => {
        const finishedAtMs = Date.now();
        const status = res.statusCode ?? null;
        const ok = status !== null && status >= 200 && status < 300;

        finish({
          ok,
          status,
          ttfbMs,
          elapsedMs: finishedAtMs - startedAtMs,
          sentAt,
          receivedAt: new Date(finishedAtMs).toISOString(),
          bodyRaw,
          bodyJson: safeParseJson(bodyRaw),
          errorMessage: ok ? null : `Unexpected status code: ${status ?? "unknown"}`,
        });
      });

      res.on("error", (error) => {
        fail(error.message, res.statusCode ?? null, bodyRaw, Date.now() - startedAtMs);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS} ms`));
    });

    req.on("error", (error) => {
      fail(error.message);
    });

    req.end();
  });
}
