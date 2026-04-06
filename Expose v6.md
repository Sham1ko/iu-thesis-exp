Name: Shamshyrak Zholdasbek  
Matr.-No: 102302930  
Programme:M.Sc. Computer Science  
Supervisor:Prof. Dr. T. Lu

# **Title**

Reproducible Benchmark Protocol for Cold-Start Evaluation in Kubernetes-Based Serverless Containers

# **Motivation**

Kubernetes-based serverless containers promise elastic scaling and reduced idle cost through scale-to-zero, but this benefit comes with cold-start latency: after idle periods, the first request must wait for provisioning and runtime initialization, which can noticeably degrade user-perceived performance, especially under sporadic and bursty demand. At the same time, prior work often reports serverless performance results using platform-specific or ad-hoc setups, which makes findings difficult to reproduce and difficult to compare across environments and configuration choices (Copik et al., 2021).

Therefore, this thesis focuses on the design and validation of a reproducible benchmark protocol for measuring cold-start latency in Kubernetes-based serverless containers. The main contribution is not another isolated cold-start measurement study, but a structured protocol that enables fair, repeatable, and transparent comparison of runtime and mitigation choices under controlled conditions. Knative Serving is used as a representative open-source validation platform for demonstrating the protocol under controlled conditions, rather than as a claim to cover the broader serverless ecosystem. The resulting artefact is intended to support practitioners and researchers in making more informed runtime and scaling decisions in serverless-on-Kubernetes environments.

# **Gap Analysis Table (Feature-Based)**

A \= Empirical benchmark / controlled experiment protocol (serverless cold starts)  
B \= Platform scope: Kubernetes/Serverless containers; Knative/scale-to-zero  
C \= Runtime/language comparison (Go vs. Node.js / different runtimes)  
D \= Comparison of cold-start mitigation strategies under scale-to-zero

| Study | A | B | C | D | Notes |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Copik et al., 2021 | Yes | No | Partial | No | Open-source FaaS benchmark suite with a reproducible experimental protocol (incl. cold vs warm start measurements) evaluated on AWS Lambda/Azure/GCP; includes workload suite \+ tooling \+ statistical treatment. Not Kubernetes/Knative/scale-to-zero knobs; runtime comparison mainly Python vs Node.js; no direct mitigation comparison (non-zero minimum replica settings). |
| Schmid et al., 2025 | Partial | No | No | Partial | Open-source benchmark suite for serverless workflows with a platform-agnostic model and generators for AWS, GCP, and Azure; enables reproducible experiments on runtime, cost, and scaling, and analyzes sources of overhead and variability, including the impact of cold starts (warm vs. cold analysis), but does not cover Kubernetes/Knative or compare runtimes or mitigation knobs (e.g., non-zero minimum replica settings). |
| Bermbach et al., 2020 | Yes | No | No | Yes | Client-side choreography middleware \+ “hinting” (naive/extended/global) uses workflow/composition knowledge to proactively trigger container provisioning and reduce number of cold starts; evaluated on AWS Lambda & OpenWhisk, reports \~30–40% avg (up to \~80%) cold-start reduction with small cost overhead; not Kubernetes/Knative and no runtime (Go vs Node) factor. |
| Hsieh & Chou, 2023 | Yes | Yes | No | Yes | Knative-on-Kubernetes experiment introducing an “In-place” policy based on Kubernetes in-place pod resize; compares Cold, Warm, and In-place across different workloads and shows latency reductions of up to approximately 18× relative to the cold policy. |
| Djemame et al. (2022) | Yes | Partial | Yes | No | Experiments with “empty” functions, comparing runtime overhead and cold-start differences between compiled and dynamic languages on open-source platforms. |
| Your work | Yes | Yes | Yes | Yes | Reproducible controlled benchmark protocol for Kubernetes-based serverless containers, evaluated on Knative scale-to-zero; compares Go vs. Node.js and baseline scale-to-zero vs. cold-start mitigation through a non-zero minimum replica setting across workload profiles. |

## Research Questions

- MRQ: How can a reproducible benchmark protocol for evaluating cold-start latency in Kubernetes-based serverless containers be designed and validated through a controlled validation case on Knative Serving?  
    
- Which workload design, latency metrics, repetitions, and reporting rules are required for a reproducible and statistically defensible benchmark protocol for cold-start evaluation in Kubernetes-based serverless containers?  
    
- To what extent does the proposed protocol support controlled and repeatable evaluation on Knative Serving as the selected validation case?  
    
- Under the proposed protocol, how do Go and Node.js compare on Knative with respect to cold-start latency across the selected workload patterns?  
    
- Under the proposed protocol, how does a minimum-replica mitigation configuration compare with the default configuration on Knative with respect to cold-start latency?

## Methodology

This thesis uses Design Science Research (DSR) because its main contribution is a reproducible benchmark protocol for evaluating cold-start latency in Kubernetes-based serverless containers. The artefact is the protocol itself. Knative Serving is used only as a controlled validation case to test whether the protocol can be applied, reported, and reproduced consistently within one bounded platform setting.

| DSR phase | Input | Activity | Output |
| :---- | :---- | :---- | :---- |
| Problem identification | Prior work on cold starts, benchmarking, and reproducibility | Structured literature review and gap analysis | Problem statement and protocol requirements |
| Objective definition | Research gap, thesis scope, research questions | Derivation of design objectives and reporting requirements | Requirements for a reproducible benchmark protocol |
| Artefact design | Protocol requirements and selected scope dimensions | Specification of scenario structure, workload profiles, deployment strategies, latency metrics, run procedure, reporting rules, and documentation requirements | Reproducible benchmark protocol |
| Validation | Protocol and bounded Knative validation case | Application of the protocol to the fixed scenario design in one controlled Knative setting | Evidence that the protocol can be applied consistently in one platform case |
| Evaluation | Request-level latency observations, platform events, and scenario metadata | Scenario-wise analysis and repeated-run summaries | Assessment of protocol utility, reproducibility, and the limits of the Knative validation case |

Empirical validation is conducted through controlled experiments on Knative Serving. The deployment and monitoring setup of this bounded validation case is informed by Hsieh and Chou (2023), who describe a reproducible Knative/Kubernetes-based experimental environment for policy comparison under controlled workloads. In this thesis, this inspiration is reflected in fixing the cluster and platform configuration, using scripted workload execution, distinguishing baseline and mitigation policy conditions explicitly, and combining request-level latency observations with platform-event-based measurements. A scenario is defined as one combination of runtime, deployment strategy, and workload profile. The protocol defines the runtimes as Go and Node.js, the baseline as `autoscaling.knative.dev/min-scale: "0"`, and the mitigation as `autoscaling.knative.dev/min-scale: "1"`. To reduce bias in the Go vs. Node.js comparison, the study uses functionally equivalent minimal HTTP services, aligned deployment settings, and identical input payloads across runtimes. The comparison is intended as a controlled benchmark scenario rather than as a universal claim about language superiority. Any observed differences must therefore be interpreted with caution, since cold-start behavior is also influenced by implementation details, dependency footprint, container image size, and service logic. The repetition logic, statistical reporting, and workflow consistency are additionally informed by Schmid et al. (2025), whose benchmarking approach motivates repeated executions, statistically grounded reporting, and a platform-agnostic workflow design. In this thesis, this is reflected in executing each scenario in repeated runs under unchanged configuration, reporting repeated-run summaries with median-based statistics and 95% confidence intervals, and keeping workload execution and measurement logic identical across the compared scenarios. TTFB, P95, and P99 are computed from request-level latency observations within one scenario, and pod startup time is derived from platform events for the same scenario. Confidence intervals are reported only for summaries across repeated runs of the same scenario. CPU and memory are recorded only as setup metadata, not as protocol outcome metrics.

## Methods Comparison Table

| Study | Methodology | Input | Output \+ Metrics | Target | Experiment setup |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Bermbach et al., 2020 | Controlled experiments | 16-step example processes; JMeter workloads | Choreography middleware; cold-start count/reduction; billed duration (cost metric) | AWS Lambda; OpenWhisk | Three deployment options (AWS Lambda-only, OpenWhisk-only via IBM Cloud Functions, federated); two process types; two workloads; baseline \+ three approaches; 48 setups; 4 repetitions per setup; one randomly selected setup repeated 20 times. |
| Copik et al., 2021 | Controlled experiments | SeBS benchmark input data and payloads (SeBS-data): https://github.com/spcl/serverless-benchmarks-data; | Benchmark/provider/client time; end-to-end latency; memory; cost; cold-start overhead / initialization effects | AWS Lambda; Azure Functions; Google Cloud Functions | Default AWS Lambda plan (us-east-1); standard Linux consumption plan on Azure Functions (WestEurope); Google Cloud Functions (europe-west1); HTTP triggers; Python 3.7 and Node.js 10 benchmarks; 50 invocations per batch; N=200; cold and warm runs |
| Grambow et al., 2021 | Controlled experiments | E-commerce benchmark application; load profile(s); deployment configuration; BeFaaS (https://github.com/Be-FaaS) | BeFaaS framework; fine-grained results; execution duration; computing, network transmission, and database round-trip latency; cold-start identification | AWS Lambda; Azure Functions; Google Cloud Functions | Single-cloud provider setups; e-commerce benchmark with default load profile; one provider at a time; load generator on an overprovisioned VM (2 vCPUs, 4 GB RAM); Redis on an overprovisioned VM in the same provider/region; 18,000 workflows over 15 minutes; no repeated runs |
| Hsieh & Chou, 2023 | Controlled experiments | CPU scaling configurations; idle / stress-ng CPU / stress-ng I/O workloads; k6-driven Python workloads (helloworld, CPU, I/O, video watermarking); SeBS video inputs | In-place scaling duration; average latency / cold-start latency; relative latency (vs. Default) | Knative | Local kind cluster; Kubernetes v1.27.3; Knative 1.12; InPlacePodVerticalScaling enabled; cold, warm, and in-place policies; 6 s scale-down window for cold; min-scale=1 for warm |
| Schmid et al., 2025 | Controlled experiments | Workflow functions; workflow input data; platform-agnostic workflow definition in JSON | Workflow runtime; critical path / orchestration overhead; cost; scalability; cold-start frequency / state transitions | AWS Step Functions; Google Cloud Workflows; Azure Durable Functions | Six application benchmarks \+ four microbenchmarks; AWS us-east-1, Azure europe-west, Google Cloud us-east1; lowest common memory configuration; burst mode with 30 concurrent executions; 180 executions per experiment; same-region Redis VM and platform storage / NoSQL |
| Djemame et al., 2022 | Controlled experiments | Not stated; empty functions and test suite for runtime-overhead measurement; no external dataset URL reported in the paper | Function execution time / execution latency; cold-start latency; warm-start latency; API request latency / overhead | Apache OpenWhisk; Fission | 14-node local private-cloud testbed (OpenNebula 4.10.2); OpenWhisk and Fission local deployments; empty functions; 144 cold-start invocations per language/platform over 24 h; 3 warm-start runs × 120 invocations; API tests repeated for the same cold/warm schedules. |
| This thesis | Controlled experiments | No external dataset; benchmark service inputs / workload profiles | Cold-start latency; warm-start latency; initialization time; memory consumption | Knative | Local Kubernetes/Knative testbed; baseline scale-to-zero and min-scale=1; repeated runs across workload scenarios under fixed configuration |

## Operational Definitions to Use Consistently

- **Scenario.** One combination of runtime, deployment strategy, and workload profile.  
- **Repetition.** One complete execution of one scenario.  
- **Burst workload.** A short high-intensity request phase.  
- **Sporadic workload.** Requests separated by idle periods intended to re-trigger scale-from-zero.  
- **Steady workload.** A sustained arrival pattern without deliberate long idle periods.  
- **TTFB.** The elapsed time from sending the HTTP request to receiving the first byte of the response.  
- **P95 and P99.** Percentiles computed from request-level latency observations within one scenario.  
- **Pod startup time.** The elapsed time from the pod-creation trigger to pod readiness.  
- **Confidence interval rule.** Confidence intervals are reported only for repeated scenario summaries.

## **Data Usage, Artefacts, and Reproducibility**

**Input.** The empirical input combines the protocol artefacts with the implementation materials needed for one bounded Knative validation case. In the current repository, these materials include the two benchmark service implementations, their Dockerfiles, the Knative Service manifests, the `kind` cluster definition, the Kourier ingress manifest, and the deployment script.

**Output and metrics.** The main output is the reproducible benchmark protocol. The current repository already demonstrates deployable benchmark services and inspectable application-level response metadata (`runtime`, `hostname`, `timestamp`, `startup_timestamp`, `uptime_ms`). For the protocol, measurement outputs are request-level latency observations, platform events, and scenario metadata. The protocol outcome metrics are `TTFB`, `P95`, `P99`, and pod startup time. CPU and memory belong to the setup description, not to the outcome metrics.

**Target system.** The target system is Knative Serving on Kubernetes. The object under test is a containerized HTTP service deployed as a Knative Service. Knative is the validation platform for the protocol, not the thesis contribution itself.

**Experiment setup.** The validation environment is a single-node `kind` cluster with Kourier ingress. Its role is to provide one controlled setting for protocol validation, not to become the main thesis contribution. This setup follows the same general logic as Hsieh and Chou (2023) in fixing the Kubernetes/Knative environment, distinguishing policy conditions explicitly, and organizing workload-driven comparisons within one reproducible testbed. Within the thesis protocol, the baseline deployment strategy uses the per-revision Knative annotation `autoscaling.knative.dev/min-scale: "0"`, and the mitigation strategy uses `autoscaling.knative.dev/min-scale: "1"`. This follows Knative’s official scale bounds documentation for the `min-scale` annotation: [https://knative.dev/docs/serving/autoscaling/scale-bounds/](https://knative.dev/docs/serving/autoscaling/scale-bounds/)

**Pilot validation.** The repository demonstrates deployment feasibility and application-level observability. Both benchmark services expose runtime, hostname, timestamp, startup timestamp, and uptime in the `/ping` response. This supports inspection of request context without overclaiming a complete measurement pipeline.

**Repository / artefact source:** [https://github.com/Sham1ko/iu-thesis-exp](https://github.com/Sham1ko/iu-thesis-exp)

## Scope Decisions and Non-goals

The scope of the empirical validation is intentionally narrow. This is a methodological choice rather than a claim of broad platform coverage. Because the thesis aims to validate a reproducible benchmark protocol, the study limits variation in platform, runtime set, and mitigation design in order to reduce confounding factors, preserve internal validity, and keep the experimental design reproducible within a master’s thesis scope. Accordingly, the results should be interpreted as evidence from a controlled Knative validation case, not as an exhaustive account of all serverless platforms, runtimes, or cold-start mitigation approaches.

- **Platform:** Knative only. **Rationale:**  Restricting the validation to one representative open-source platform reduces platform-level confounding factors and allows the benchmark protocol to be evaluated under controlled and reproducible conditions. **Non-goal:** claiming Cross-platform generalizability to Cloud Run, OpenFaaS, OpenWhisk, or other serverless systems.  
- **Languages:** Go vs. Node.js using two functionally equivalent minimal HTTP services. **Rationale:** Limiting the study to two contrasting runtimes enables a controlled comparison of runtime effects while keeping service logic constant and the factorial design manageable. **Non-goal:** Adding more languages, frameworks, or dependency-heavy business services.  
- **Strategies:** Default scale-to-zero vs. one concrete mitigation mechanism in Knative: maintaining a non-zero minimum replica count. **Rationale:** This compares a realistic cold-start baseline with a common operational mitigation under a clear latency trade-off. **Non-goal:** Exhaustive autoscaler tuning or evaluation of many mitigation techniques.  
- **Metrics:** TTFB, P95, P99, and pod startup time. **Rationale:** These metrics capture request-visible latency and startup behaviour within one scenario. CPU and memory are recorded only as environment or setup metadata. **Non-goal:** Full provider pricing in euros, broader SRE/SLA reporting, or treating CPU/RAM as outcome metrics.  
- **Workloads:** Burst, sporadic, and steady profiles. **Rationale:** These patterns represent typical invocation behaviors and trigger cold starts differently. **Non-goal:** Trace-based replay of complex real-world traffic.  
- **Contribution:** A reproducible benchmark protocol and its controlled validation on Knative. **Rationale:** The thesis contribution is the protocol; the Knative study demonstrates that it can be applied in a bounded setting. **Non-goal:** Claiming broad platform generalization from the Knative case alone.

## SMART Timeline (Milestones)

| Week | Milestone | Definition of Done (DoD) |
| :---- | :---- | :---- |
| W1 | Baseline environment | Local/private Kubernetes cluster ready; Knative Serving installed; all versions recorded (K8s, Knative, container runtime, node specs); hello-world service deploys successfully. |
| W2 | Benchmark design frozen | Workload profiles (burst, sporadic, steady) specified; metrics list finalized (TTFB, P95/P99, pod startup time); written run protocol defined (warm-up, repetitions, randomization). |
| W3 | Artefact implementation ready | Functionally equivalent Go and Node.js services built; container images published locally; manifests prepared for both strategies (default scale-to-zero vs. minimum-replica mitigation). |
| W4 | Automation \+ pilot validation | One-command benchmark run available (scripts and configs); data capture verified end-to-end; pilot runs executed; raw outputs produced as CSV/JSON with a consistent schema. |
| W5 | Main experiment campaign | Full-factorial runs completed (runtime × strategy × workload) with predefined repetitions; raw dataset archived; run logs and environment metadata saved. |
| W6 | Analysis \+ write-up | Statistical analysis completed (descriptives, confidence intervals, comparisons); plots/tables generated; threats to validity drafted; final artefact repository and report draft ready. |

## References

Bermbach, D., Pallas, F., Pérez, D. G., Plebani, P., Anderson, M., Kat, R., & Tai, S. (2020). *Serverless in the wild: Characterizing and optimizing the serverless workload at a large cloud provider*. In *2020 USENIX Annual Technical Conference (USENIX ATC 20\)*. USENIX Association.

Copik, M., Kwasniewski, G., Besta, M., Podstawski, M., & Hoefler, T. (2021). SeBS: A serverless benchmark suite for function-as-a-service computing. In *Proceedings of the 22nd International Middleware Conference* (pp. 64–78). Association for Computing Machinery. [https://doi.org/10.1145/3464298.3476133](https://doi.org/10.1145/3464298.3476133)

Djemame, K., Datsev, D., & Kelefouras, V. I. (2022). Evaluation of language runtimes in open-source serverless platforms. In *Proceedings of the 12th International Conference on Cloud Computing and Services Science (CLOSER 2022\)* (pp. 123–132). SciTePress. [https://doi.org/10.5220/0010983000003200](https://doi.org/10.5220/0010983000003200)

Grambow, M., Pfandzelter, T., Burchard, L., Schubert, C., Zhao, M. X., & Bermbach, D. (2021). BeFaaS: An application-centric benchmarking framework for FaaS platforms. In *2021 IEEE International Conference on Cloud Engineering (IC2E)* (pp. 1–8). IEEE. [https://doi.org/10.1109/IC2E52221.2021.00014](https://doi.org/10.1109/IC2E52221.2021.00014)

Hsieh, V., & Chou, J. (2023). *Towards serverless optimization with in-place scaling*. arXiv. [https://doi.org/10.48550/arXiv.2311.09526](https://doi.org/10.48550/arXiv.2311.09526)

Schmid, L., Copik, M., Calotoiu, A., Brandner, L., Koziolek, A., & Hoefler, T. (2025). SeBS-Flow: Benchmarking serverless cloud function workflows. In *Proceedings of the 2025 ACM Symposium on Cloud Computing*. Association for Computing Machinery. [https://doi.org/10.1145/3689031.3717465](https://doi.org/10.1145/3689031.3717465)

## 

