# WebMCP Challenge — Milestones 1 and 2 with Browser Validation

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

Milestone 1 remains a correctness-only local browser proof. It does not add or expose:

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

Goal: request visible user approval and immediately return an
`awaiting_consent` acknowledgement. The page then starts the existing
conservative three-repetition-per-size WG1-vs-WG32 workflow only after approval,
while the workflow continues asynchronously.

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

The first result reports `requestAccepted: true`, `workloadStarted: false`, and
`state: "awaiting_consent"`. It does not hold the tool call open while the user
reads the disclosure, during cold pipeline creation, or during profiling. After
approval, `get_experiment_status` reports the experiment ID, `running` state,
`queued` stage, and subsequent progress. Computation begins only after an
explicit start invocation and explicit approval in the visible page modal.

### Long-workload consent

Chrome's currently implemented imperative callback supplies cancellation through
an `AbortSignal`, but does not provide a dependable standardized
`requestUserInteraction()` confirmation method in the API surface used here.
The integration therefore uses an ordinary, accessible page-level modal instead
of inventing a WebMCP API. It does not depend on native `<dialog>` support.

The modal appears before any prerequisite verification or profiling dispatch.
It discloses three matched repetitions per size, six profiling samples, 49,152
profiled hashes, local-only execution, the absence of network/pool/wallet/RPC or
submission activity, and that already-submitted GPU dispatches cannot
necessarily be interrupted. Approval starts the existing asynchronous workflow.
Declining returns `accepted: false`, `state: "declined"`, and starts no GPU work.

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
3. Invoke `start_workgroup_comparison` with `{}`. Confirm it promptly returns
   `requestAccepted: true`, `workloadStarted: false`, and
   `state: "awaiting_consent"`; confirm the visible consent modal appears and no
   prerequisite changes before approval.
4. Approve the modal, then call `get_experiment_status` and confirm a non-empty
   experiment ID, `running` state, and `queued` or later stage.
5. Poll `get_experiment_status` with `{}`. Confirm stages advance through missing WG1/WG32 prerequisites and then `matched_comparison` without holding the start call open.
6. Watch the existing Matched WG1-vs-WG32 UI. Confirm compile, small-gate, and full-294 checks become satisfied for both sizes and matched repetition progress is visible.
7. Confirm the final status is `completed`, both sizes have three valid samples, all correctness failures are absent, and the structured measurements match the visible UI.
8. If variability or another existing blocker applies, confirm `recommendationAllowed` is `false`, `recommendation` is `null`, and the exact existing blockers are returned.
9. Invoke again and decline the dialog; confirm no prerequisite or profiling work starts.
10. Switch between Guided and Advanced after completion and confirm the result, raw diagnostics, and normal human controls remain usable.
11. Reload with WebMCP disabled and confirm no computation starts and the existing human UI still works.

## Completed Real-Browser Validation

Milestone 1 and Milestone 2 were validated end-to-end in one normal Chrome
WebGPU/WebMCP session before release hardening.

Milestone 1 evidence:

- four tools were registered after Milestone 2;
- environment inspection started no workload;
- minimal correctness returned `1 / 1` selected matches and `0` mismatches;
- full correctness returned `294 / 294` selected matches and `0` mismatches;
- status reflected the same shared result shown by the page.

Milestone 2 evidence from that session:

- the asynchronous start acknowledgement returned immediately;
- completion took approximately `46.7` seconds;
- WG1 full verification passed `294 / 294`;
- WG32 full verification passed `294 / 294`;
- WG1 produced `3` valid samples and WG32 produced `3` valid samples;
- `49,152` hashes were requested, completed, and returned;
- `30` CPU spot checks passed;
- mismatches, pipeline errors, device losses, and deterministic ordering failures
  were all `0`;
- WG32's observed mean throughput difference was approximately `+2.21%`;
- WG32 total elapsed CV was approximately `13.32%`;
- WG32 throughput CV was approximately `13.87%`;
- policy thresholds were `10%` maximum total-time CV, `10%` maximum throughput
  CV, and `5%` minimum practical throughput difference;
- final classification was `host-side variability too high for a recommendation`;
- `recommendationAllowed` was `false` and `recommendation` was `null`.

This is one browser/session observation. It is correctness and workflow evidence,
not a universal GPU-performance claim or a claim that WG32 is faster generally.

## Release-Hardening Status Output

`get_experiment_status` retains the evidence an agent needs—lifecycle, stages,
prerequisites, sample counts, headline timing/throughput statistics, relative
differences, thresholds, failures, classification, recommendation permission,
blockers, and errors—while omitting per-sample low-level arrays and detailed
invocation rows. Those remain visible and exportable in the human Advanced UI.

Current WebMCP references: [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) and the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
