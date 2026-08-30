# WebMCP Challenge — Milestones 1 and 2

## Baseline

The authoritative pre-challenge baseline is:

```text
bbb0405142c6bd61f996179e949e6ad2ff755413
```

## What Already Existed

Before this branch, `caps-webgpu` already provided:

- browser WebGPU capability, adapter, feature, and limit inspection;
- a minimal WGSL Whirlpool correctness proof;
- full comparison of 294 WGSL results with generated CapStash Core vectors;
- shared browser-session state and visible result rendering;
- correctness gates that reject unavailable Core vectors, pipeline failures, CPU mismatches, Core mismatches, and incomplete runs.

The WebMCP integration does not implement a second WebGPU verifier. It calls the existing `runWhirlpoolMinimalProof()` application workflow, which calls `runWebGPUWhirlpoolFixtureSuite()`, compares the result with Core vectors, updates shared state, and renders the same UI used for human-triggered runs.

## What This Branch Adds

Milestone 1 adds optional imperative WebMCP tools through `document.modelContext.registerTool()`. Registration is feature-detected; browsers without WebMCP continue to use the existing application normally.

No tool runs automatically. Inspecting the environment or reading status never begins computation. Only an explicit `verify_correctness` invocation starts the existing correctness workflow.

### `inspect_compute_environment`

Goal: report existing browser/WebGPU capability state, adapter information, relevant limits and features, supported verification/workgroup options, and whether an experiment is running.

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

### `verify_correctness`

Goal: run either the minimal one-vector proof or the existing full 294-vector WGSL/Core verification, update the visible UI, and return a structured result. The WebMCP path fixes the run to the verified batch-size-1 and workgroup-size-1 reference configuration rather than exposing low-level tuning controls.

```json
{
  "type": "object",
  "properties": {
    "verification_level": {
      "type": "string",
      "enum": ["minimal", "full_294"],
      "description": "Run the minimal one-vector proof or the full 294-vector WGSL/Core verification."
    }
  },
  "required": ["verification_level"],
  "additionalProperties": false
}
```

### `get_experiment_status`

Goal: report the current or most recent shared correctness experiment and its structured result without starting computation.

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## Safety Boundaries

This milestone remains a correctness-only local browser proof. It does not add or expose:

- live or network mining;
- target comparison or block submission;
- pool or Stratum support;
- wallet, private-key, payout, or custody functionality;
- external services, telemetry, analytics, deployment, or background work;
- profiling, performance comparison, export, or raw low-level GPU controls through WebMCP;
- an LLM or OpenAI API call in the page.

Existing CapStash Core-vector and CPU-reference checks remain authoritative. A WebMCP result is successful only when the selected WGSL results are nonzero, every selected result matches Core, no CPU mismatch exists, no pipeline failure exists, and a full run selects exactly 294 vectors.

## Manual Browser Test

1. Run `npm run doctor`, `npm test`, and `npm run compare:core-vectors`.
2. Run `npm run dev` and open `http://127.0.0.1:8080/` in a normal WebGPU-capable Chrome browser.
3. In Chrome 149 or later, enable `chrome://flags/#enable-webmcp-testing` for local development and relaunch Chrome. WebMCP is experimental and may also require current origin-trial configuration outside local testing.
4. Use Chrome's Model Context Tool Inspector extension, or another compatible browser agent, to confirm that the three Milestone 1 tools plus `start_workgroup_comparison` are registered.
5. Invoke `inspect_compute_environment` and confirm that no workload starts.
6. Invoke `verify_correctness` with `{"verification_level":"minimal"}`. Confirm the application visibly switches to the correctness workflow and reports one selected match with zero mismatches.
7. Invoke `get_experiment_status` and confirm it reports the completed minimal result.
8. Invoke `verify_correctness` with `{"verification_level":"full_294"}`. Confirm the visible UI reports `294 / 294` selected matches and zero mismatches.
9. Repeat with WebMCP disabled and confirm the existing human controls continue to work normally.

Normal Chrome/Edge WebGPU verification is still required because Node tests cannot create the browser WebGPU adapter or validate browser WebMCP registration behavior.

## Milestone 2 — Agent-Orchestrated Workgroup Comparison

Milestone 2 adds agent access to the pre-existing WG1-vs-WG32 experiment without replacing its engine. The WebMCP orchestration calls the same application action runner used by Guided and Advanced UI controls. That runner still owns pipeline compilation, device validation, the small correctness gate, full 294-vector verification, Variant B profiling, alternating execution order, sample validation, statistics, and recommendation thresholds.

The challenge-period addition is the asynchronous, prerequisite-aware controller and its machine-readable status. The WebGPU hashing code, workgroup variants, matched comparison, profiling/statistics, recommendation rules, and human UI all pre-date the challenge branch.

### `start_workgroup_comparison`

Goal: start the existing conservative three-repetition-per-size WG1-vs-WG32 workflow and return immediately.

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

The tool refuses conflicting experiments, selects the existing matched-comparison UI, reuses any current-session prerequisite that already passed, and runs missing steps in this order:

1. WG1 compile/device validation
2. WG1 small correctness gate
3. WG1 full 294-vector verification
4. WG32 compile/device validation
5. WG32 small correctness gate
6. WG32 full 294-vector verification
7. Existing matched WG1-vs-WG32 comparison with three repetitions per size

The start result contains an experiment ID, `running` state, `queued` stage, and the planned repetition count. It does not hold the tool call open during cold pipeline creation or profiling. Computation begins only after an explicit start invocation.

### Extended `get_experiment_status`

The original empty input schema is unchanged. Its result now also includes `workgroupComparison` with:

- experiment ID, source, lifecycle state, stage, and timestamps;
- WG1 and WG32 compile/small/full-294 prerequisite status;
- current authoritative workgroup action;
- completed and planned matched repetitions;
- WG1 and WG32 aggregate measurements;
- existing comparison differences, thresholds, execution order, and profiling accounting;
- correctness failures and errors;
- the existing recommendation classification, exact blockers, and whether a recommendation is allowed.

When blockers prohibit a recommendation, `recommendationAllowed` is `false` and `recommendation` is `null`. The existing classification, explanatory message, and blocker objects remain available so an agent can explain why no winner is justified.

### Asynchronous lifecycle

Stages are `queued`, `wg1_compile`, `wg1_small_gate`, `wg1_full_294`, `wg32_compile`, `wg32_small_gate`, `wg32_full_294`, `matched_comparison`, `completed`, or `failed`.

The controller schedules the existing workflow in a promise continuation and immediately returns its start acknowledgement. It does not use timers, fake progress, page-load work, or a second GPU engine. During the run, conflicting human and agent actions and session reset are locked. Guided and Advanced rendering continues to use the same shared application state.

### Recommendation integrity

Milestone 2 passes through `buildMatchedWorkgroupComparison()` output. It does not recalculate or reinterpret the existing `10%` total-time CV threshold, `10%` throughput CV threshold, `5%` practical-difference threshold, correctness eligibility, or pipeline/sample validation. A valid comparison may complete while still producing no recommendation.

### Cancellation limitation

Milestone 2 does not expose `cancel_experiment`. The existing browser workflow cannot honestly interrupt already-submitted GPU work at an arbitrary point. Adding a cancellation tool would require explicit safe-boundary cancellation throughout prerequisite and profiling execution, so it is deferred rather than overstated.

### Milestone 2 manual browser test

1. Run `npm run dev` and open `http://127.0.0.1:8080/` in a WebGPU/WebMCP-capable browser.
2. Confirm `document.modelContext.getTools()` includes `start_workgroup_comparison` in addition to the Milestone 1 tools.
3. Invoke `start_workgroup_comparison` with `{}` and confirm it promptly returns `accepted: true`, a non-empty experiment ID, `state: "running"`, and `stage: "queued"`.
4. Poll `get_experiment_status` with `{}`. Confirm stages advance through missing WG1/WG32 prerequisites and then `matched_comparison` without holding the start call open.
5. Watch the existing Matched WG1-vs-WG32 UI. Confirm compile, small-gate, and full-294 checks become satisfied for both sizes and matched repetition progress is visible.
6. Confirm the final status is `completed`, both sizes have three valid samples, all correctness failures are absent, and the structured measurements match the visible UI.
7. If variability or another existing blocker applies, confirm `recommendationAllowed` is `false`, `recommendation` is `null`, and the exact existing blockers are returned.
8. Switch between Guided and Advanced after completion and confirm the result, raw diagnostics, and normal human controls remain usable.
9. Reload with WebMCP disabled and confirm no computation starts and the existing human UI still works.

Current WebMCP references: [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) and the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
