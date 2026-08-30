# WebMCP Challenge — Milestone 1

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
4. Use Chrome's Model Context Tool Inspector extension, or another compatible browser agent, to confirm that exactly three challenge tools are registered.
5. Invoke `inspect_compute_environment` and confirm that no workload starts.
6. Invoke `verify_correctness` with `{"verification_level":"minimal"}`. Confirm the application visibly switches to the correctness workflow and reports one selected match with zero mismatches.
7. Invoke `get_experiment_status` and confirm it reports the completed minimal result.
8. Invoke `verify_correctness` with `{"verification_level":"full_294"}`. Confirm the visible UI reports `294 / 294` selected matches and zero mismatches.
9. Repeat with WebMCP disabled and confirm the existing human controls continue to work normally.

Normal Chrome/Edge WebGPU verification is still required because Node tests cannot create the browser WebGPU adapter or validate browser WebMCP registration behavior.

Current WebMCP references: [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp) and the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).
