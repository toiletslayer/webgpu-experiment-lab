# Workgroup Experiment Runbook

This runbook covers `WGSL workgroup-size experiment`, a correctness-gated browser experiment for compile-time `@workgroup_size(...)` variants of the verified CapStash Whirlpool WGSL shader.

Workgroup size `1` remains the verified reference. Alternate sizes are experimental until they pass their own gates. Larger workgroups are not assumed faster.

The browser UI now defaults to `Guided` mode. Guided mode shows one selected test workflow at a time, keeps raw JSON and deep telemetry collapsed into Advanced mode, and provides ordered workgroup and matched-comparison checklists. Switching between Guided and Advanced preserves session state.

Beginner matched-comparison checklist:

1. Choose `Matched WG1 vs WG32 Comparison`.
2. Click `Prepare WG1 and WG32`.
3. Wait for WG1 compile, WG1 small gate, WG1 full 294, WG32 compile, WG32 small gate, and WG32 full 294 to pass.
4. Confirm repetitions are set to `3`.
5. Click `Run matched comparison`.
6. Read the compact result summary, then switch to Advanced mode only if raw JSON, histories, diagnostics, or exports are needed.

## Candidate Sizes

- `1`
- `32`
- `64`
- `128`
- `256`

Each size uses a separate pipeline key:

- `whirlpool-batched-wg1`
- `whirlpool-batched-wg32`
- `whirlpool-batched-wg64`
- `whirlpool-batched-wg128`
- `whirlpool-batched-wg256`

## Required Gates

1. Compile and device validation
2. Small gate: `10 fixtures x 1 nonce`
3. Full `294`-vector WGSL/Core verification
4. Synthetic profiling validation with full readback and CPU spot checks

Performance comparison is not accepted until all four gates pass for the selected workgroup size.

## UI Actions

Use the buttons in the `WGSL Workgroup-Size Experiment` panel. The main `Start Benchmark` button remains conservative and runs the small gate for the selected workgroup size.

In Guided mode, `Run recommended correctness sequence` executes compile, small gate, and full 294 for the currently selected size and stops on the first failure. It does not run performance profiling. `Prepare WG1 and WG32` performs those same correctness steps for WG1 and WG32, then stops; the matched comparison remains a separate manual action.

Milestone 15.2 fixes the action routing so these buttons call separate direct handlers, prevent default form/submission behavior, stop propagation, and record requested/started/completed action telemetry. The Minimal/Core WGSL preset selector is separate; selecting `Full 294 Core vectors` there does not change which workgroup experiment action runs.

- `Compile selected variant`: creates the selected pipeline only and records device-limit validation.
- `Run small correctness gate`: runs `10 fixtures x 1 nonce` through the selected pipeline.
- `Run full 294-vector verification`: runs the full Core-vector preset through the selected pipeline and compares WGSL output to CapStash Core vectors.
- `Run performance profile`: stays disabled until the selected size has a current-session full `294` pass. When unlocked, it invokes the real Variant B synthetic profiling path with the selected pipeline key, full output readback, CPU spot checks, and telemetry validation. It is still not performance-accepted unless profiling telemetry is valid.

## First Manual Action

1. Select `WGSL workgroup-size experiment`.
2. Choose workgroup size `32`.
3. Click `Compile selected variant`.
4. Confirm device-limit validation is supported.
5. Confirm pipeline creation succeeds.
6. Click `Run small correctness gate`.
7. Confirm small gate matches all selected outputs with `0` mismatches.
8. Confirm full `294` verification remains pending.
9. Export the workgroup experiment JSON.

If the small gate passes, the next manual correctness action is:

1. Keep workgroup size `32` selected.
2. Click `Run full 294-vector verification`.
3. Confirm the pipeline key is `whirlpool-batched-wg32`.
4. Confirm `requestedActionType`, `startedActionType`, and `completedActionType` are all `full-294-vector-verification`.
5. Confirm `actionRoutingConsistency` is `true`.
6. Confirm `294 / 294` matches and `0` mismatches.
7. Confirm executed full-verification accounting shows `294` hashes, `1` logical dispatch, `10` workgroups, `320` launched invocations, `294` active invocations, and `26` padded invocations.
8. Export the workgroup experiment JSON.

If the full `294` verification passes in the current session, the next manual performance action is:

1. Keep workgroup size `32` selected.
2. Click `Run performance profile`.
3. Confirm `requestedActionType`, `startedActionType`, and `completedActionType` are all `performance-profile`.
4. Confirm `actionRoutingConsistency` is `true`.
5. Confirm the pipeline key is `whirlpool-batched-wg32`.
6. Confirm `profilingExecuted` is `true`.
7. Confirm `8,192 / 8,192` hashes completed and `8,192` results returned.
8. Confirm `16` logical dispatches, `1` physical submission, `1` queue wait, `1` readback, and `1` command buffer.
9. Confirm `256` total workgroups, `8,192` active invocations, and `0` padded invocations.
10. Confirm CPU spot checks passed, mismatches are `0`, no pipeline error is present, and `validProfilingRun` is `true`.
11. Export the workgroup experiment JSON.

A performance action that reports `0` hashes or `0` returned results is invalid telemetry. Do not treat it as completed profiling.

## Matched WG1 vs WG32 Comparison

The `Run matched WG1 vs WG32 comparison` button is locked until both workgroup sizes have current-session compile/device validation, small gate, and full `294`-vector WGSL/Core verification passes. It does not run missing gates automatically.

Matched comparison conditions:

- `8,192` hashes
- logical batch size `512`
- Variant B: `16` logical dispatches, `1` submission, `1` queue wait, `1` readback
- full output readback enabled
- CPU spot checks enabled
- same browser session, adapter, fixture, shader revision, and pipeline-cache scope
- at least `3` repetitions per size

The default order alternates to reduce simple time-order bias:

1. WG1 repetition 1
2. WG32 repetition 1
3. WG32 repetition 2
4. WG1 repetition 2
5. WG1 repetition 3
6. WG32 repetition 3

This does not eliminate browser or host-side bias. Browser queue wait is not precise GPU kernel timing.

Recommendation thresholds:

- maximum total-time CV: `10%`
- maximum throughput CV: `10%`
- minimum practical throughput difference: `5%`

If either size exceeds the variability threshold, the result must say:

`Observed variability is too high for a workgroup-size recommendation.`

Workgroup size `1` remains the reference until a later milestone records sufficient matched evidence and explicitly promotes another size.

Milestone 15.5 records the first completed matched comparison as valid but inconclusive: WG1 had `3 / 3` valid samples, WG32 had `3 / 3` valid samples, both pipelines used strict identities, all samples had `0` mismatches, and recommendation eligibility was blocked by variability. A valid comparison is not the same thing as a recommendation.

The matched comparison export must include:

- `matchedComparisonStatus.valid: true`
- `matchedComparisonStatus.recommendationEligible: false` when variability blockers remain
- `recommendationBlockers` with exact exceeded thresholds
- separate `executedInvocationAccounting.wg1` and `executedInvocationAccounting.wg32`
- separate `executedProfilingAccounting.wg1`, `executedProfilingAccounting.wg32`, and `executedProfilingAccounting.combined`
- reconstructable execution order for all six repetitions

For three valid repetitions per size, combined profiling totals should be `49,152` completed hashes, `49,152` returned results, `96` logical dispatches, `6` submissions, `6` queue waits, `6` readbacks, and `6` command buffers.

Milestone 15.5.1 separates execution failure from display failure. If a matched comparison completes but a noncritical summary field cannot be formatted, the raw matched result and export remain available, the render error is reported as display status, and compile/small/full gates must not be rewritten as failed unless those stages actually failed. Optional numeric fields should display `Not available` instead of throwing.

## Accounting Checks

For the default `8,192` hashes / batch `512` setup:

| Workgroup size | Workgroups per 512-hash chunk | Active invocations | Padded invocations |
| ---: | ---: | ---: | ---: |
| `1` | `512` | `512` | `0` |
| `32` | `16` | `512` | `0` |
| `64` | `8` | `512` | `0` |
| `128` | `4` | `512` | `0` |
| `256` | `2` | `512` | `0` |

Non-divisible task counts must use the shader bounds check so padded invocations return before reading task data or writing output.

For the explicit full `294` verification at workgroup size `32`, the expected single-batch accounting is:

- workgroups: `10`
- launched invocations: `320`
- active invocations: `294`
- padded inactive invocations: `26`
- final workgroup active invocations: `6`
- partial final workgroup: `true`

## Boundaries

This experiment does not implement live mining, target comparison, block finding, pool connectivity, Stratum, wallet support, payout tracking, `getblocktemplate`, `submitblock`, native CUDA/OpenCL/Vulkan code, or remote telemetry.

No Whirlpool arithmetic, lookup-table layout, loop structure, subgroup operation, or workgroup-shared-memory optimization is part of this milestone.
