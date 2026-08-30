# WebGPU Optimization Plan

This document lists future optimization candidates for the verified synthetic WebGPU Whirlpool path. Milestone 14.1 implements Variant B as a controlled profiling readback/submission variant, Milestone 14.2 promotes Variant B as the scoped profiling baseline for the current verified configuration, Milestone 15 adds correctness-gated workgroup-size experiment scaffolding, Milestone 15.1 adds executable full `294`-vector verification actions for selected workgroup variants, Milestone 15.2 fixes explicit action routing, Milestone 15.3 wires the performance action into the real Variant B profiler with the selected workgroup pipeline override, and Milestone 15.4 adds matched WG1 vs WG32 comparison support. No Whirlpool arithmetic optimization has been performed.

The current authority remains correctness:

- CapStash Core vectors vs CPU JavaScript: `294 / 294`
- documented WGSL/Core full-vector verification: `294 / 294`
- documented batched WGSL/Core verification through batch size `64`
- synthetic profiling must pass the automatic correctness gate before any profiling result is trusted

Profiling is browser-observed wall-clock timing. It does not expose shader instruction counts, occupancy, cache behavior, power, temperature, or true GPU hardware counters.

## Candidate Matrix

| Candidate | Expected affected timing category | Correctness risk | Complexity | Browser compatibility risk | Required verification before acceptance |
| --- | --- | --- | --- | --- | --- |
| Fewer readbacks | readback/map, queue wait, host overhead | medium; result ordering and mismatch reporting can regress | medium | low to medium | CPU spot checks plus selected and full Core-vector WGSL comparison after restructuring |
| Multiple dispatches per command submission | queue submission, command encoding | medium; dispatch/result ordering can regress | medium | medium | deterministic nonce-order test, full output readback, CPU spot checks, full Core-vector verification |
| Larger dispatch batches | queue overhead, readback overhead | low to medium; buffer limits and nonce range boundaries can regress | low | medium | overflow rejection tests, device-limit checks, full synthetic spot checks |
| Different WGSL workgroup sizes | dispatch scheduling, possible shader occupancy | high; invocation indexing and result layout can regress | medium | medium to high | exact CPU/WGSL/Core match for every tested size before any timing comparison |
| Persistent/reused buffers | buffer allocation, buffer upload | medium; stale input/output data risk | medium | low | explicit buffer clearing or overwrite tests, repeated-run correctness tests |
| Reused bind groups | bind-group creation | low to medium; stale bindings risk | low | low | repeated-run correctness and profiling schema validation |
| Reduced result-copying | result decoding, JavaScript allocation | medium; byte order and row ordering can regress | medium | low | internal-order hash tests and mismatch-detail tests |
| Reduced JavaScript allocation | fixture/header preparation, task preparation, result decoding | low to medium | medium | low | deterministic task-order tests and repeated-run telemetry validation |
| Compact output representation | readback size, decode time | high; folded hash byte order can regress | medium | low | CapStash Core vector comparisons and display/internal byte-order tests |
| Table layout changes | shader compile time, shader arithmetic | high; Whirlpool constants or lookup behavior can regress | high | medium | published Whirlpool vectors, CPU/WGSL checkpoints, full Core-vector verification |
| Arithmetic restructuring | shader arithmetic | high | high | medium | one-nonce debug checkpoints, selected subsets, then full Core-vector verification |
| Loop unrolling | shader compile time, shader arithmetic | medium to high | medium | medium | compare compile time and output correctness with current shader |
| Lookup-table placement experiments | shader memory behavior, compile time | high | high | high | exact output checks across all vectors and browsers |
| Workgroup memory experiments | shader memory behavior | high | high | high | exact output checks plus fallback path for browsers/adapters that reject the shader |
| Subgroup operations if supported | shader arithmetic or data movement | high | high | high | feature detection, fallback path, exact full-vector verification per adapter |
| Native comparison implementation | baseline interpretation only | low to medium; risk is comparing unlike workloads | high | not browser-dependent | separately audited native implementation and documented measurement methodology |

## Acceptance Rules

An optimization candidate is not accepted unless:

1. It preserves the CapStash PoW algorithm exactly.
2. It keeps the automatic correctness gate.
3. It passes CPU spot checks for synthetic profiling.
4. It passes the relevant WGSL/Core verification path.
5. It preserves mismatch reporting with fixture, nonce, dispatch, and byte-order details.
6. It does not introduce target comparison, live mining, pool connectivity, wallet support, payout tracking, or remote telemetry.
7. It documents browser compatibility and timing scope.

## Profiling Baseline

Matched manual profiling comparison:

- Variant A, three valid repetitions, `8,192` hashes / batch `512`: mean total `110.0 ms`, queue wait `59.2 ms`, readback `5.8 ms`, CPU validation `24.8 ms`, about `75.9 kH/s`.
- Variant B, three valid repetitions, same configuration: mean total `36.5 ms`, queue wait `4.5 ms`, readback `0.4 ms`, CPU validation `24.8 ms`, about `227 kH/s`.
- No-readback probe, same size: about `69.6 ms` total, `52.9 ms` queue wait, `0.0 ms` readback, output results returned `0`, profiling-only and not a valid hash benchmark.

Using repeated means, Variant B was about `66.8%` lower in total elapsed time, about `92.4%` lower in queue wait, about `93.1%` lower in readback time, and about `3x` higher end-to-end throughput. CPU validation was essentially unchanged. For this browser, adapter, shader, fixture, `8,192`-hash workload, and batch size `512`, Variant B is the repeatability-backed preferred profiling baseline.

Do not claim universal optimality. Variant A remains the reference and regression path.

## Milestone 15 Workgroup-Size Experiment

Current controlled experiment: `Milestone 15 - Correctness-gated WGSL workgroup-size experiment`.

Candidate workgroup sizes may include:

- `1`
- `32`
- `64`
- `128`
- `256`

The project now has compile-time shader variants, separate pipeline keys, and explicit browser actions for compile/device validation, the small gate, full `294`-vector verification, and performance profiling through the real Variant B control path. Required gates before any performance acceptance:

- separate pipeline key per workgroup size
- compile-time WGSL workgroup-size variant
- full CPU/Core fixture verification
- full `294`-vector WGSL/Core verification
- synthetic correctness gate
- deterministic result ordering
- CPU spot checks
- device-limit validation
- no performance recommendation from a single run

Do not assume larger workgroups will be faster. Workgroup size `1` remains the verified reference until a later milestone records enough correctness-gated matched evidence to promote another size.

Before profiling an alternate workgroup size, run:

- `WGSL workgroup-size experiment`
- workgroup size `32`
- `Compile selected variant`
- small `10 fixtures x 1 nonce` gate
- explicit full `294`-vector WGSL/Core verification
- performance profile only after the full `294` pass unlocks it
- JSON export
- action telemetry showing requested, started, and completed action types match

Then inspect:

- device-limit validation
- pipeline key
- shader code size
- `8,192 / 8,192` hashes completed and `8,192` results returned
- small-gate matches/mismatches
- real Variant B accounting: `16` logical dispatches, `1` submission, `1` queue wait, and `1` readback
- CPU spot checks
- zero mismatches
- workgroups per `512`-hash logical chunk
- active and padded invocation counts
- executed full-verification accounting, which is separate from planned future `8,192`/`512` profiling accounting

Only after full `294`-vector WGSL/Core verification passes for a size should synthetic profiling data for that size be considered performance-eligible. Zero-hash or zero-result performance-profile outputs are invalid and must not be used as evidence.

Matched WG1 vs WG32 comparison acceptance requires:

- current-session full `294` verification for both sizes
- `3` or more valid repetitions per size
- strict pipeline identity: `whirlpool-batched-wg1` and `whirlpool-batched-wg32`
- identical `8,192`/`512` Variant B conditions
- full output readback and CPU spot checks
- maximum total-time CV `10%`
- maximum throughput CV `10%`
- minimum practical throughput difference `5%`

If either size exceeds the variability threshold, report `Observed variability is too high for a workgroup-size recommendation.` WG32 observations around `191 kH/s` are browser-observed local evidence only and are not a promotion.

The first completed matched WG1 vs WG32 comparison produced `3` valid samples per size with strict pipeline identity and no correctness failures. WG32 was about `13.4%` higher in mean throughput and about `13.7%` lower in mean total elapsed, but queue wait did not show a clear improvement and CPU-validation variation dominated the apparent end-to-end advantage. The comparison is valid, but recommendation eligibility is false. Exports now carry separate WG1/WG32 executed accounting, combined six-sample totals, and exact variability blockers so future work can distinguish invalid telemetry from inconclusive evidence.
