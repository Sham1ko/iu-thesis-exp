import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  measurePodStartupDuring,
  POD_STARTUP_CSV_HEADER,
} from "../metrics/pod-startup-report.ts";

type PodFixture = {
  uid: string;
  name: string;
  createdAt: string;
  revisionName?: string;
  readyAt?: string;
  phase?: string;
};

function createPodListJson(pods: readonly PodFixture[]): string {
  return JSON.stringify({
    items: pods.map((pod) => ({
      metadata: {
        uid: pod.uid,
        name: pod.name,
        creationTimestamp: pod.createdAt,
        labels: {
          "serving.knative.dev/revision": pod.revisionName ?? "rev-1",
        },
      },
      status: {
        phase: pod.phase ?? (pod.readyAt ? "Running" : "Pending"),
        conditions: pod.readyAt
          ? [
              {
                type: "Ready",
                status: "True",
                lastTransitionTime: pod.readyAt,
              },
            ]
          : [],
      },
    })),
  });
}

function createExecFileStub(responses: readonly string[]) {
  let callCount = 0;

  return async (_file: string, _args: readonly string[]) => {
    const index = Math.min(callCount, responses.length - 1);
    callCount += 1;
    return {
      stdout: responses[index],
      stderr: "",
    };
  };
}

function createTempResultsFile(name: string): string {
  return path.join(os.tmpdir(), `iu-thesis-exp-${process.pid}-${name}`);
}

async function testMeasuresReadyPodStartup(): Promise<void> {
  const resultsFile = createTempResultsFile("pod-startup-ready.csv");
  const execFileLike = createExecFileStub([
    createPodListJson([]),
    createPodListJson([
      {
        uid: "pod-a",
        name: "pod-a-name",
        createdAt: "2026-04-06T10:00:00.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "pod-a",
        name: "pod-a-name",
        createdAt: "2026-04-06T10:00:00.000Z",
        readyAt: "2026-04-06T10:00:05.000Z",
      },
    ]),
  ]);

  const measurement = await measurePodStartupDuring(
    async () => ({ ok: true }),
    {
      runStartedAt: "2026-04-06T09:59:59.000Z",
      serviceName: "go-benchmark",
      namespace: "default",
      resultsFile,
      execFileLike,
      wait: async () => {},
      settleTimeoutMs: 0,
    },
  );

  assert.equal(path.resolve(measurement.csvWritten), path.resolve(resultsFile));
  assert.deepEqual(measurement.summary, {
    totalEvents: 1,
    readyEvents: 1,
    notReadyEvents: 0,
  });
  assert.equal(measurement.entries[0]?.status, "ready");
  assert.equal(measurement.entries[0]?.startupTimeMs, 5_000);

  const csv = await fs.readFile(resultsFile, "utf8");
  assert.match(csv, new RegExp(`^${POD_STARTUP_CSV_HEADER}`, "m"));
  assert.match(csv, /pod-a-name,pod-a,2026-04-06T10:00:00.000Z,2026-04-06T10:00:05.000Z,5000,ready/);

  await fs.rm(resultsFile, { force: true });
}

async function testIgnoresBaselinePods(): Promise<void> {
  const resultsFile = createTempResultsFile("pod-startup-baseline.csv");
  const execFileLike = createExecFileStub([
    createPodListJson([
      {
        uid: "baseline-pod",
        name: "baseline-pod-name",
        createdAt: "2026-04-06T09:55:00.000Z",
        readyAt: "2026-04-06T09:55:02.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "baseline-pod",
        name: "baseline-pod-name",
        createdAt: "2026-04-06T09:55:00.000Z",
        readyAt: "2026-04-06T09:55:02.000Z",
      },
      {
        uid: "new-pod",
        name: "new-pod-name",
        createdAt: "2026-04-06T10:00:00.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "baseline-pod",
        name: "baseline-pod-name",
        createdAt: "2026-04-06T09:55:00.000Z",
        readyAt: "2026-04-06T09:55:02.000Z",
      },
      {
        uid: "new-pod",
        name: "new-pod-name",
        createdAt: "2026-04-06T10:00:00.000Z",
        readyAt: "2026-04-06T10:00:03.000Z",
      },
    ]),
  ]);

  const measurement = await measurePodStartupDuring(
    async () => ({ ok: true }),
    {
      runStartedAt: "2026-04-06T09:59:59.000Z",
      serviceName: "node-benchmark-min0",
      namespace: "default",
      resultsFile,
      execFileLike,
      wait: async () => {},
      settleTimeoutMs: 0,
    },
  );

  assert.equal(measurement.entries.length, 1);
  assert.equal(measurement.entries[0]?.podUid, "new-pod");

  await fs.rm(resultsFile, { force: true });
}

async function testRecordsNotReadyPods(): Promise<void> {
  const resultsFile = createTempResultsFile("pod-startup-not-ready.csv");
  const execFileLike = createExecFileStub([
    createPodListJson([]),
    createPodListJson([
      {
        uid: "pod-pending",
        name: "pod-pending-name",
        createdAt: "2026-04-06T10:10:00.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "pod-pending",
        name: "pod-pending-name",
        createdAt: "2026-04-06T10:10:00.000Z",
      },
    ]),
  ]);

  const measurement = await measurePodStartupDuring(
    async () => ({ ok: true }),
    {
      runStartedAt: "2026-04-06T10:09:59.000Z",
      serviceName: "go-benchmark",
      namespace: "default",
      resultsFile,
      execFileLike,
      wait: async () => {},
      settleTimeoutMs: 0,
    },
  );

  assert.deepEqual(measurement.summary, {
    totalEvents: 1,
    readyEvents: 0,
    notReadyEvents: 1,
  });
  assert.equal(measurement.entries[0]?.status, "not_ready");
  assert.equal(measurement.entries[0]?.readyAt, null);
  assert.equal(measurement.entries[0]?.startupTimeMs, null);

  await fs.rm(resultsFile, { force: true });
}

async function main(): Promise<void> {
  await testMeasuresReadyPodStartup();
  await testIgnoresBaselinePods();
  await testRecordsNotReadyPods();
  console.log("pod startup metrics tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
