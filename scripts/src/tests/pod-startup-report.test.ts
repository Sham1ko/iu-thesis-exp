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
  podScheduledAt?: string;
  podReadyToStartContainersAt?: string;
  containersReadyAt?: string;
  userContainerStartedAt?: string;
  userContainerLastStartedAt?: string;
  queueProxyStartedAt?: string;
  queueProxyLastStartedAt?: string;
};

function createContainerStatus(
  name: string,
  runningStartedAt?: string,
  lastStartedAt?: string,
) {
  if (!runningStartedAt && !lastStartedAt) {
    return null;
  }

  return {
    name,
    ...(runningStartedAt ? { state: { running: { startedAt: runningStartedAt } } } : {}),
    ...(lastStartedAt ? { lastState: { terminated: { startedAt: lastStartedAt } } } : {}),
  };
}

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
        conditions: [
          ...(pod.podScheduledAt
            ? [
                {
                  type: "PodScheduled",
                  status: "True",
                  lastTransitionTime: pod.podScheduledAt,
                },
              ]
            : []),
          ...(pod.podReadyToStartContainersAt
            ? [
                {
                  type: "PodReadyToStartContainers",
                  status: "True",
                  lastTransitionTime: pod.podReadyToStartContainersAt,
                },
              ]
            : []),
          ...(pod.containersReadyAt ?? pod.readyAt
            ? [
                {
                  type: "ContainersReady",
                  status: "True",
                  lastTransitionTime: pod.containersReadyAt ?? pod.readyAt,
                },
              ]
            : []),
          ...(pod.readyAt
            ? [
                {
                  type: "Ready",
                  status: "True",
                  lastTransitionTime: pod.readyAt,
                },
              ]
            : []),
        ],
        containerStatuses: [
          createContainerStatus("user-container", pod.userContainerStartedAt, pod.userContainerLastStartedAt),
          createContainerStatus("queue-proxy", pod.queueProxyStartedAt, pod.queueProxyLastStartedAt),
        ].filter((status) => status !== null),
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

async function readCsvRecords(resultsFile: string): Promise<Record<string, string>[]> {
  const csv = await fs.readFile(resultsFile, "utf8");
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];

  return lines.slice(1).map((line) =>
    Object.fromEntries(header.map((column, index) => [column, line.split(",")[index] ?? ""])),
  );
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
        podScheduledAt: "2026-04-06T10:00:00.100Z",
        podReadyToStartContainersAt: "2026-04-06T10:00:01.000Z",
        queueProxyStartedAt: "2026-04-06T10:00:01.000Z",
        userContainerStartedAt: "2026-04-06T10:00:02.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "pod-a",
        name: "pod-a-name",
        createdAt: "2026-04-06T10:00:00.000Z",
        podScheduledAt: "2026-04-06T10:00:00.100Z",
        podReadyToStartContainersAt: "2026-04-06T10:00:01.000Z",
        queueProxyStartedAt: "2026-04-06T10:00:01.000Z",
        userContainerStartedAt: "2026-04-06T10:00:02.000Z",
        containersReadyAt: "2026-04-06T10:00:05.000Z",
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
      now: () => Date.parse("2026-04-06T10:00:00.500Z"),
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
  assert.equal(measurement.entries[0]?.createdToReadyMs, 5_000);
  assert.equal(measurement.entries[0]?.observedLagMs, 500);
  assert.equal(measurement.entries[0]?.createdToUserStartedMs, 2_000);
  assert.equal(measurement.entries[0]?.createdToQueueProxyStartedMs, 1_000);
  assert.equal(measurement.entries[0]?.userStartedToReadyMs, 3_000);
  assert.equal(measurement.entries[0]?.queueProxyStartedToReadyMs, 4_000);

  const records = await readCsvRecords(resultsFile);
  assert.equal(records.length, 1);
  assert.equal((await fs.readFile(resultsFile, "utf8")).split(/\r?\n/, 1)[0], POD_STARTUP_CSV_HEADER);
  assert.equal(records[0]?.pod_name, "pod-a-name");
  assert.equal(records[0]?.startup_time_ms, "5000");
  assert.equal(records[0]?.created_to_ready_ms, "5000");
  assert.equal(records[0]?.pod_first_observed_at, "2026-04-06T10:00:00.500Z");
  assert.equal(records[0]?.created_to_user_started_ms, "2000");
  assert.equal(records[0]?.created_to_queue_proxy_started_ms, "1000");
  assert.equal(records[0]?.user_started_to_ready_ms, "3000");
  assert.equal(records[0]?.queue_proxy_started_to_ready_ms, "4000");

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

async function testHandlesMissingContainerStartTimestamps(): Promise<void> {
  const resultsFile = createTempResultsFile("pod-startup-missing-starts.csv");
  const execFileLike = createExecFileStub([
    createPodListJson([]),
    createPodListJson([
      {
        uid: "pod-no-starts",
        name: "pod-no-starts-name",
        createdAt: "2026-04-06T10:10:00.000Z",
        readyAt: "2026-04-06T10:10:03.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "pod-no-starts",
        name: "pod-no-starts-name",
        createdAt: "2026-04-06T10:10:00.000Z",
        readyAt: "2026-04-06T10:10:03.000Z",
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
      now: () => Date.parse("2026-04-06T10:10:00.750Z"),
    },
  );

  assert.deepEqual(measurement.summary, {
    totalEvents: 1,
    readyEvents: 1,
    notReadyEvents: 0,
  });
  assert.equal(measurement.entries[0]?.status, "ready");
  assert.equal(measurement.entries[0]?.startupTimeMs, 3_000);
  assert.equal(measurement.entries[0]?.createdToUserStartedMs, null);
  assert.equal(measurement.entries[0]?.createdToQueueProxyStartedMs, null);
  assert.equal(measurement.entries[0]?.observedLagMs, 750);

  const [record] = await readCsvRecords(resultsFile);
  assert.equal(record?.user_container_started_at, "");
  assert.equal(record?.queue_proxy_started_at, "");
  assert.equal(record?.created_to_user_started_ms, "");
  assert.equal(record?.created_to_queue_proxy_started_ms, "");

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
      now: () => Date.parse("2026-04-06T10:10:00.750Z"),
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
  assert.equal(measurement.entries[0]?.createdToReadyMs, null);
  assert.equal(measurement.entries[0]?.observedLagMs, 750);

  const [record] = await readCsvRecords(resultsFile);
  assert.equal(record?.ready_at, "");
  assert.equal(record?.startup_time_ms, "");
  assert.equal(record?.created_to_ready_ms, "");

  await fs.rm(resultsFile, { force: true });
}

async function testPreservesEarliestContainerStartAcrossRestarts(): Promise<void> {
  const resultsFile = createTempResultsFile("pod-startup-restart.csv");
  const execFileLike = createExecFileStub([
    createPodListJson([]),
    createPodListJson([
      {
        uid: "pod-restart",
        name: "pod-restart-name",
        createdAt: "2026-04-06T10:20:00.000Z",
        userContainerStartedAt: "2026-04-06T10:20:04.000Z",
        userContainerLastStartedAt: "2026-04-06T10:20:02.000Z",
        queueProxyStartedAt: "2026-04-06T10:20:03.000Z",
        readyAt: "2026-04-06T10:20:06.000Z",
      },
    ]),
    createPodListJson([
      {
        uid: "pod-restart",
        name: "pod-restart-name",
        createdAt: "2026-04-06T10:20:00.000Z",
        userContainerStartedAt: "2026-04-06T10:20:04.000Z",
        userContainerLastStartedAt: "2026-04-06T10:20:02.000Z",
        queueProxyStartedAt: "2026-04-06T10:20:03.000Z",
        readyAt: "2026-04-06T10:20:06.000Z",
      },
    ]),
  ]);

  const measurement = await measurePodStartupDuring(
    async () => ({ ok: true }),
    {
      runStartedAt: "2026-04-06T10:19:59.000Z",
      serviceName: "go-benchmark",
      namespace: "default",
      resultsFile,
      execFileLike,
      wait: async () => {},
      settleTimeoutMs: 0,
      now: () => Date.parse("2026-04-06T10:20:00.500Z"),
    },
  );

  assert.equal(measurement.entries[0]?.userContainerStartedAt, "2026-04-06T10:20:02.000Z");
  assert.equal(measurement.entries[0]?.createdToUserStartedMs, 2_000);
  assert.equal(measurement.entries[0]?.userStartedToReadyMs, 4_000);
  assert.equal(measurement.entries[0]?.startupTimeMs, 6_000);

  await fs.rm(resultsFile, { force: true });
}

async function main(): Promise<void> {
  await testMeasuresReadyPodStartup();
  await testIgnoresBaselinePods();
  await testHandlesMissingContainerStartTimestamps();
  await testRecordsNotReadyPods();
  await testPreservesEarliestContainerStartAcrossRestarts();
  console.log("pod startup metrics tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
