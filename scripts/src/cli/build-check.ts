import "./benchmark.ts";
import "../commands/request-once.ts";
import "../config/resolve-target.ts";
import "../config/scenario-config.ts";
import "../metrics/request-metrics-report.ts";
import "../network/send-one.ts";
import "../workloads/burst.ts";
import "../workloads/sporadic.ts";
import "../workloads/steady.ts";

console.log("build check passed");
