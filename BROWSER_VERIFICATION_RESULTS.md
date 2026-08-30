# Browser Verification Results

This file records manual browser WGSL/Core verification runs. These results are correctness evidence only. They are not production miner results, profitability claims, or benchmark-ready performance data.

## Current Interpretation

- The CPU JavaScript reference matches generated CapStash Core vectors for `294 / 294` vectors.
- The minimal WGSL Whirlpool path has matched CapStash Core for all selected-subset presets and the full `294`-vector preset.
- Full 294-vector WGSL/Core browser verification passed with `294 / 294` selected matches and `0` mismatches.
- That full pass used the known-good single-dispatch-per-hash path with batch size `1`.
- Correctness-preserving batched WGSL/Core subset verification passed for batch sizes `2`, `4`, and `8`.
- Full `294`-vector batched WGSL/Core verification passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`, all with `294 / 294` selected matches and `0` mismatches.
- Batch size `64` reduced the full-vector verification from `294` dispatches to `5` dispatches.
- The project is not optimized.
- The recorded timings are not representative of optimized mining.
- Verified H/s values from these tiny correctness runs must not be treated as mining performance.

## Results

| Date / label | Browser | Adapter | Preset | Core vectors loaded | CPU/Core result | WGSL/Core result | Mismatches | Shader size | Pipeline creation | Total elapsed | Notes |
| --- | --- | --- | --- | ---: | --- | --- | ---: | --- | ---: | ---: | --- |
| 2026-06-28 manual 1x1 | Edge/Chrome on Windows | `nvidia / blackwell` | `1 fixture x 1 nonce` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 1 / 1 selected matches` | 0 | `13,763 bytes / 13,763 code units` | about `31,112.4 ms` | about `31.29 s` | Fixture `All-zero header except nonce`; tested nonce `zero-header:0..0`; pipeline timeout `60,000 ms`; pipeline error `none`; hashes completed `1`; dispatch count `1`; hashes per dispatch `1`. |
| 2026-06-28 manual 1x2 | Edge/Chrome on Windows | `nvidia / blackwell` | `1 fixture x 2 nonces` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 2 / 2 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.5 ms` | `0.05 s` | Fixture `All-zero header except nonce`; tested nonce `zero-header:0..1`; shader generation `0.3 ms`; shader module creation `0.1 ms`; pipeline reuse `cold pipeline / cache miss`; warm dispatch `4.0 ms`; buffer setup `0.3 ms`; CPU comparison `0.8 ms`; verified H/s excluding pipeline `385`; including pipeline `37.8`; hashes completed `2`; dispatch count `2`; hashes per dispatch `1`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |
| 2026-06-28 manual 1x4 | Edge/Chrome on Windows | `nvidia / blackwell` | `1 fixture x 4 nonces` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 4 / 4 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.5 ms` | `0.01 s` | Fixture `All-zero header except nonce`; tested nonce `zero-header:0..3`; shader generation `0.3 ms`; shader module creation `0.1 ms`; pipeline reuse `warm pipeline / cache hit`; warm dispatch `3.2 ms`; buffer setup `0.1 ms`; CPU comparison `1.6 ms`; verified H/s excluding pipeline `784`; including pipeline `784`; hashes completed `4`; dispatch count `4`; hashes per dispatch `1`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |
| 2026-06-28 manual 3x1 | Edge/Chrome on Windows | `nvidia / blackwell` | `3 fixtures x 1 nonce` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 3 / 3 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.5 ms` | `0.01 s` | Tested nonces `zero-header:0..0`, `incrementing-bytes:0..0`, `high-bit-bytes:0..0`; shader generation `0.3 ms`; shader module creation `0.1 ms`; pipeline reuse `warm pipeline / cache hit`; warm dispatch `11.6 ms`; buffer setup `0.1 ms`; CPU comparison `1.1 ms`; verified H/s excluding pipeline `226`; including pipeline `224`; hashes completed `3`; dispatch count `3`; hashes per dispatch `1`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |
| 2026-06-28 manual 3x2 | Edge/Chrome on Windows | `nvidia / blackwell` | `3 fixtures x 2 nonces` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 6 / 6 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.5 ms` | `0.01 s` | Tested nonces `zero-header:0..1`, `incrementing-bytes:0..1`, `high-bit-bytes:0..1`; shader generation `0.3 ms`; shader module creation `0.1 ms`; pipeline reuse `warm pipeline / cache hit`; warm dispatch `10.6 ms`; buffer setup `0.3 ms`; CPU comparison `1.7 ms`; verified H/s excluding pipeline `458`; including pipeline `451`; hashes completed `6`; dispatch count `6`; hashes per dispatch `1`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |
| 2026-06-28 manual 10x1 | Edge/Chrome on Windows | `nvidia / blackwell` | `10 fixtures x 1 nonce` | 294 | `294 matches / 0 mismatches` | `Passed selected subset; 10 / 10 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.5 ms` | `0.04 s` | Tested nonces `zero-header:0..0`, `incrementing-bytes:0..0`, `high-bit-bytes:0..0`, `deterministic-random:0..0`, `realistic-fields:5..5`, `time-mutated:0..0`, `bits-mutated:0..0`, `merkle-mutated:0..0`, `near-overflow-nonce:4294967280..4294967280`, `overflow-rejected:4294967288..4294967288`; shader generation `0.3 ms`; shader module creation `0.1 ms`; pipeline reuse `warm pipeline / cache hit`; warm dispatch `34.1 ms`; buffer setup `0.4 ms`; CPU comparison `3.0 ms`; verified H/s excluding pipeline `251`; including pipeline `248`; hashes completed `10`; dispatch count `10`; hashes per dispatch `1`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |
| 2026-06-28 manual full 294 | Edge/Chrome on Windows | `nvidia / blackwell` | `Full 294 Core vectors` | 294 | `294 matches / 0 mismatches` | `Full 294-vector pass; 294 / 294 selected matches` | 0 | `13,763 bytes / 13,763 code units` | `5.6 ms` | `0.35 s` | Browser string `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0`; WebGPU vendor `nvidia`; fixture cases `49 executed / 1 rejected overflow cases`; nonce counts `1, 2, 4, 8, 16`; hashes/results returned `294`; total hashes completed `294`; dispatch count `294`; hashes per dispatch `1`; warm dispatch `185.6 ms`; buffer setup `2.8 ms`; readback `0.01 s`; CPU comparison `70.8 ms`; shader generation `0.2 ms`; shader module creation `0.1 ms`; pipeline timeout `60,000 ms`; pipeline reuse `mixed pipeline / cache mixed`; pipeline diagnostics reported `pipelineCacheStatus: miss`, `pipelineCacheHit: false`, `pipelineReused: false`; average/results rate `849 H/s`; verified H/s excluding pipeline `1.07 kH/s`; verified H/s including pipeline `849 H/s`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`. |

Browser string for the expanded manual runs:

```text
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0
```

## Required Manual Preset Order

Run presets manually in this order. Do not automatically run all presets and do not run all `294` Core vectors by default.

1. `1 fixture x 1 nonce`
2. `1 fixture x 2 nonces`
3. `1 fixture x 4 nonces`
4. `3 fixtures x 1 nonce`
5. `3 fixtures x 2 nonces`
6. `10 fixtures x 1 nonce`
7. `Full 294 Core vectors`

All exposed manual selected-subset presets and the full `294`-vector preset have passed for batch size `1`. Batched subset verification has passed for batch sizes `2`, `4`, and `8`. Batched full-vector verification has passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`.

## Batched Verification Matrix

These rows were run manually in normal Edge/Chrome on Windows with adapter `nvidia / blackwell`. The app should still not run all presets automatically; select one preset and one batch size, click Start, then record the result.

| Date / label | Preset | Batch size | Vectors selected | Dispatch count | Hashes per dispatch | WGSL/Core result | Mismatches | Warm dispatch | Verified H/s excluding pipeline | Verified H/s including pipeline | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| 2026-06-29 manual batched 10x1 b2 | `10 fixtures x 1 nonce` | 2 | 10 | 5 | 2.00 | `10 / 10 matches` | 0 | `18.1 ms` | `370 H/s` | `0.30 H/s` | First batched run; pipeline error `none`; first mismatch `none`; cold batched pipeline creation displayed about `33.5 s`. |
| 2026-06-29 manual batched 10x1 b4 | `10 fixtures x 1 nonce` | 4 | 10 | 3 | 3.33 | `10 / 10 matches` | 0 | `11.6 ms` | `641 H/s` | `629 H/s` | Pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched 10x1 b8 | `10 fixtures x 1 nonce` | 8 | 10 | 2 | 5.00 | `10 / 10 matches` | 0 | `7.2 ms` | `862 H/s` | `862 H/s` | Pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched full b2 | `Full 294 Core vectors` | 2 | 294 | 147 | 2.00 | `294 / 294 matches` | 0 | `566.0 ms` | `393 H/s` | `389 H/s` | Total elapsed `0.76 s`; buffer setup `9.5 ms`; readback `0.09 s`; CPU comparison `87.1 ms`; pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched full b4 | `Full 294 Core vectors` | 4 | 294 | 74 | 3.97 | `294 / 294 matches` | 0 | `293.6 ms` | `709 H/s` | `703 H/s` | Total elapsed `0.42 s`; buffer setup `4.1 ms`; readback `0.04 s`; CPU comparison `81.6 ms`; pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched full b8 | `Full 294 Core vectors` | 8 | 294 | 37 | 7.95 | `294 / 294 matches` | 0 | `139.3 ms` | `1.22 kH/s` | `1.21 kH/s` | Total elapsed `0.24 s`; buffer setup `1.6 ms`; readback `0.02 s`; CPU comparison `84.1 ms`; pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched full b16 | `Full 294 Core vectors` | 16 | 294 | 19 | 15.47 | `294 / 294 matches` | 0 | `67.3 ms` | `1.76 kH/s` | `1.74 kH/s` | Total elapsed `0.17 s`; buffer setup `1.7 ms`; readback `0.00 s`; CPU comparison `94.7 ms`; pipeline error `none`; first mismatch `none`. |
| 2026-06-29 manual batched full b32 | `Full 294 Core vectors` | 32 | 294 | 10 | 29.40 | `294 / 294 matches` | 0 | `34.9 ms` | `2.57 kH/s` | `2.56 kH/s` | Total elapsed `0.11 s`; buffer setup `0.9 ms`; readback `0.00 s`; CPU comparison `76.6 ms`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`; this-run pipeline creation `0.0 ms / not recreated`; original cold compile `11.6 ms observed 2026-06-29T23:43:44.227Z`, does not apply to cached run; this-run pipeline reused cached pipeline; this-run total diagnostics `12.7 ms`. |
| 2026-06-29 manual batched full b64 | `Full 294 Core vectors` | 64 | 294 | 5 | 58.80 | `294 / 294 matches` | 0 | `15.5 ms` | `3.22 kH/s` | `3.21 kH/s` | Total elapsed `0.09 s`; buffer setup `0.5 ms`; readback `0.00 s`; CPU comparison `74.5 ms`; pipeline error `none`; first Core mismatch `none`; first CPU/GPU mismatch `none`; this-run pipeline creation `0.0 ms / not recreated`; original cold compile `11.6 ms observed 2026-06-29T23:43:44.227Z`, does not apply to cached run; this-run pipeline reused cached pipeline; this-run total diagnostics `19.8 ms`. |

Full verified batching ladder:

| Batch size | Dispatches | WGSL/Core result | Mismatches |
| ---------: | ---------: | ---------------: | ---------: |
| 1 | 294 | 294 / 294 | 0 |
| 2 | 147 | 294 / 294 | 0 |
| 4 | 74 | 294 / 294 | 0 |
| 8 | 37 | 294 / 294 | 0 |
| 16 | 19 | 294 / 294 | 0 |
| 32 | 10 | 294 / 294 | 0 |
| 64 | 5 | 294 / 294 | 0 |

## Batched Timing Note

During the batched browser runs, the UI repeatedly displayed pipeline creation time around `33,526.7 ms`, pipeline reuse as `mixed pipeline / cache mixed`, and diagnostics with `pipelineCacheHit: true` and `pipelineReused: true`. This appears to preserve the original cold batched shader compile time even when later cached runs completed quickly.

Interpretation:

- The cold batched pipeline compile was expensive.
- Later cached runs completed quickly.
- The stale cold compile display must not be treated as this-run hashing time.
- A future timing milestone should separate original cold compile time, this-run pipeline creation/reuse status, and this-run elapsed time.

Milestone 12 updates the diagnostics model and UI labels so future browser runs report:

- `Original Cold Compile Observed`
- `This Run Pipeline`
- `This Run Pipeline Creation`
- `This Run Total Elapsed`

This timing cleanup does not change any recorded WGSL/Core correctness result.

Milestone 12.1 fixes a diagnostics-only regression where `totalElapsedMs` could be referenced before initialization and cause a pre-dispatch failure. That bug did not indicate a Whirlpool/Core mismatch; prior recorded verification results remain valid.

## Synthetic Nonce-Batch Benchmark Results

Milestone 13 adds an explicit synthetic nonce-batch benchmark mode. This mode is separate from WGSL/Core verification and must remain labeled as local browser research.

Milestone 13.1 adds local result export controls and in-memory session history. These controls do not imply that synthetic telemetry has been run.

First observed synthetic run:

| Date / label | Browser / OS | Adapter | Hashes | Batch | Dispatches | Gate | Spot checks | Mismatches | Pipeline error | Current-run timing | Observed H/s | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- |
| 2026-07-18 manual synthetic 256 b64 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 256 / 256 | 64 | 4 | passed, `10 fixtures x 1 nonce`, batch 64 | 5 / 5 passed | 0 | none | buffer `0.8 ms`, dispatch `13.6 ms`, readback `3.7 ms`, CPU spot-check `2.9 ms`, total `23.6 ms` | about `10.8 kH/s` including overhead; about `14.1 kH/s` excluding pipeline and CPU spot-check time | Cached pipeline reused; current-run pipeline creation `0.0 ms`; historical page-session cold compile observation about `26,462.9 ms`; historical cold compile did not apply to this cached run. |

Expanded manual synthetic ladder:

| Date / label | Browser / OS | Adapter | Hashes | Batch | Dispatches | Gate | Spot checks | Mismatches | Pipeline error | Observed H/s including overhead | Observed H/s excluding pipeline and CPU spot-check time | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | --- |
| 2026-07-18 manual synthetic 512 b64 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 512 / 512 | 64 | 8 | passed | 5 / 5 passed | 0 | none | about `12.0 kH/s` | about `14.7 kH/s` | Controlled local synthetic browser run only. |
| 2026-07-18 manual synthetic 1024 b64 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 1,024 / 1,024 | 64 | 16 | passed | 5 / 5 passed | 0 | none | about `11.4 kH/s` | about `13.4 kH/s` | Controlled local synthetic browser run only. |
| 2026-07-18 manual synthetic 1024 b128 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 1,024 / 1,024 | 128 | 8 | passed | 5 / 5 passed | 0 | none | about `25.9 kH/s` | about `33.6 kH/s` | Controlled local synthetic browser run only. |
| 2026-07-18 manual synthetic 2048 b128 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 2,048 / 2,048 | 128 | 16 | passed | 5 / 5 passed | 0 | none | about `21.6 kH/s` | about `27.0 kH/s` | Controlled local synthetic browser run only. |
| 2026-07-18 manual synthetic 4096 b256 | Microsoft Edge 150 / Chromium 150 on Windows 10 | NVIDIA Blackwell / vendor NVIDIA | 4,096 / 4,096 | 256 | 16 | passed | 5 / 5 passed | 0 | none | about `38.7 kH/s` | about `50.1 kH/s` | Controlled local synthetic browser run only. |

Repeated `8,192` hashes at dispatch batch size `512`:

| Run | Hashes | Batch | Dispatches | Gate | Spot checks | Mismatches | Pipeline error | Dispatch time | Total elapsed | Observed H/s including overhead | Observed H/s excluding pipeline and CPU spot-check time |
| ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 8,192 / 8,192 | 512 | 16 | passed | 5 / 5 passed | 0 | none | `57.9 ms` | `108.8 ms` | `75.3 kH/s` | `121 kH/s` |
| 2 | 8,192 / 8,192 | 512 | 16 | passed | 5 / 5 passed | 0 | none | `61.6 ms` | `109.9 ms` | `74.5 kH/s` | `113 kH/s` |
| 3 | 8,192 / 8,192 | 512 | 16 | passed | 5 / 5 passed | 0 | none | `58.1 ms` | `108.9 ms` | `75.2 kH/s` | `120 kH/s` |
| 4 | 8,192 / 8,192 | 512 | 16 | passed | 5 / 5 passed | 0 | none | `58.1 ms` | `113.6 ms` | `72.1 kH/s` | `116 kH/s` |
| 5 | 8,192 / 8,192 | 512 | 16 | passed | 5 / 5 passed | 0 | none | `59.0 ms` | `109.7 ms` | `74.7 kH/s` | `117 kH/s` |

Repeated-run summary for `8,192` hashes at dispatch batch size `512`:

| Metric | Mean | Median | Min | Max | Coefficient of variation |
| --- | ---: | ---: | ---: | ---: | ---: |
| H/s including overhead | `74.36 kH/s` | `74.7 kH/s` | `72.1 kH/s` | `75.3 kH/s` | `1.76%` |
| H/s excluding pipeline and CPU spot-check time | `117.4 kH/s` | `117 kH/s` | `113 kH/s` | `121 kH/s` | `2.73%` |
| Dispatch time | `58.94 ms` | `58.1 ms` | `57.9 ms` | `61.6 ms` | `2.62%` |
| Total elapsed | `110.18 ms` | `109.7 ms` | `108.8 ms` | `113.6 ms` | `1.79%` |

These are observed local browser results, not live mining, target comparison, block finding, pool mining, profitability evidence, native performance, or optimized shader performance.

## Synthetic Profiling Results

Milestone 14 adds profiling instrumentation, exports, and UI for the verified synthetic path. Milestone 14.1 records the first manual full-readback versus no-readback profiling comparison and adds Variant B as a new manual profiling option.

| Date / label | Browser / OS | Adapter | Strategy | Hashes | Batch | Logical dispatches | Physical submissions | Queue waits | Readbacks | Gate | Spot checks | Mismatches | Pipeline error | Total elapsed | Queue wait | Readback | CPU validation | H/s / timing rate | Status |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-07-19 manual profiling Variant A | Edge/Chrome on Windows | NVIDIA Blackwell | `Variant A - current per-dispatch readback` | 8,192 / 8,192 | 512 | 16 | 16 | 16 | 16 | passed | enabled and passed | 0 | none | `111.4 ms` | `58.4 ms` | `8.6 ms` | `26.2 ms` | about `73.9 kH/s` | Valid browser-observed synthetic profiling benchmark. |
| 2026-07-19 manual no-readback probe | Edge/Chrome on Windows | NVIDIA Blackwell | `Dispatch timing probe - no output readback` | 8,192 submitted | 512 | 16 | 16 | 16 | 0 | passed | disabled | 0 reported | none | `69.6 ms` | `52.9 ms` | `0.0 ms` | `0.1 ms` | about `118 kH/s` timing rate | Profiling-only; not a valid hash benchmark because output was not read back or spot-checked. |

The no-readback probe was about `37.5%` lower in total elapsed time, but queue completion wait remained only modestly lower (`58.4 ms` to `52.9 ms`). Readback and CPU validation are meaningful costs; the dominant browser-observed cost in this local run remained dispatch/queue execution. This is not GPU occupancy, arithmetic intensity, memory bandwidth, instruction-level, native miner, or profitability evidence.

Matched repeated Variant A/B profiling evidence:

| Strategy | Valid samples | Total elapsed mean / median / min / max / CV | Queue wait mean | Readback mean | CPU validation mean | Throughput | Accounting |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Variant A - current per-dispatch submission and readback | 3 | `110.0 ms` / `110.8 ms` / `108.2 ms` / `111.1 ms` / `1.45%` | `59.2 ms` | `5.8 ms` | `24.8 ms` | about `75.9 kH/s` | `16` logical dispatches, `16` submissions, `16` waits, `16` readbacks, `16` command buffers |
| Variant B - multiple dispatches, one submission, one readback | 3 | `36.5 ms` / `36.4 ms` / `36.4 ms` / `36.6 ms` / `0.32%` | `4.5 ms` | `0.4 ms` | `24.8 ms` | about `227 kH/s` | `16` logical dispatches, `1` submission, `1` wait, `1` readback, `1` command buffer |

Using the repeated means, Variant B was about `66.8%` lower in total elapsed time, about `92.4%` lower in queue wait, about `93.1%` lower in readback time, and about `3x` higher in end-to-end throughput. CPU validation was essentially unchanged. For this browser, adapter, shader, fixture, `8,192`-hash workload, and batch size `512`, Variant B is the repeatability-backed preferred profiling baseline. This is local browser-observed profiling evidence only, not native GPU performance, universal optimality, live mining, target comparison, block finding, pool mining, or profitability evidence.

Variant A is retained as the reference and regression path. The no-readback probe remains profiling-only and is not a valid hash benchmark.

Latest default Variant B browser spot-check after Milestone 14.2 cleanup:

| Date / label | Strategy | Hashes | Logical dispatches | Physical submissions | Queue waits | Readbacks | Gate | Spot checks | Mismatches | Pipeline error | Total elapsed | Queue wait | Readback | CPU validation | H/s | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| post-14.2 manual default run | Variant B default | `8,192 / 8,192` | `16` | `1` | `1` | `1` | passed | passed | `0` | none | `38.9 ms` | `3.7 ms` | `0.4 ms` | `26.0 ms` | about `214 kH/s` | Valid local browser profiling run; not additional persisted A/B evidence in a fresh page session |

Milestone 15 adds the workgroup-size experiment harness. Milestone 15.1 adds executable browser actions for compile/device validation, small gate, full `294`-vector verification, and later profiling. Milestone 15.2 fixes action routing so explicit workgroup buttons are independent of `Start Benchmark` and the Minimal/Core preset selector, and each run records requested/started/completed action telemetry. Milestone 15.3 wires the performance action into the real Variant B profiling engine with the selected workgroup pipeline override, full output readback, CPU spot checks, and telemetry validation. A zero-hash performance result is now invalid and must not be recorded as a completed profile. WG32 has been manually correctness-gated and profiled, but it is not promoted because matched-comparison variability blocks a recommendation. Workgroup size `1` remains the verified reference.

Workgroup-size verification results should be recorded here only after a normal browser run completes. WG32 has now passed compile/device validation, small gate, full `294 / 294` WGSL/Core verification with `0` mismatches, and valid Variant B profiling. Full-verification accounting for `wg32` was `294` results, `10` workgroups, `320` launched invocations, `294` active invocations, and `26` padded inactive invocations. Valid performance-profile accounting was pipeline key `whirlpool-batched-wg32`, `8,192 / 8,192` hashes, `8,192` returned results, `16` logical dispatches, `1` submission, `1` queue wait, `1` readback, `256` total workgroups, CPU spot checks passed, `0` mismatches, no pipeline error, and `validProfilingRun: true`.

Two independent WG32 three-repetition aggregates were observed:

| Label | Total mean | Total median | Total range | Total CV | Queue-wait mean | CPU-validation mean | Throughput mean | Throughput median | Throughput range | Throughput CV |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| WG32 aggregate A | about `43.90 ms` | about `41.80 ms` | about `38.0-51.9 ms` | about `16.4%` | about `5.93 ms` | about `29.10 ms` | about `191.29 kH/s` | about `196.92 kH/s` | about `159.07-217.87 kH/s` | about `15.6%` |
| WG32 aggregate B | about `43.87 ms` | about `41.50 ms` | about `37.6-52.5 ms` | about `17.6%` | about `4.10 ms` | about `30.03 ms` | about `191.38 kH/s` | about `197.87 kH/s` | about `157.24-219.04 kH/s` | about `16.4%` |

These are local browser observations only. They suggest stable aggregate behavior around `191 kH/s`, but the observed total-time and throughput CV exceed the current `10%` recommendation threshold. Host-side CPU validation contributes substantial variability. WG32 is not promoted.

First completed matched current-session WG1 vs WG32 comparison:

| Metric | WG1 | WG32 | WG32 relative to WG1 |
| --- | ---: | ---: | ---: |
| Valid repetitions | `3` | `3` | same sample count |
| Full-294 prerequisite | passed, current session | passed, current session | both eligible |
| Pipeline key | `whirlpool-batched-wg1` | `whirlpool-batched-wg32` | strict identity enforced |
| Mean total elapsed | observed baseline | about `13.73%` lower | negative elapsed means WG32 took less time |
| Median total elapsed | observed baseline | about `7.93%` lower | negative elapsed means WG32 took less time |
| Mean queue wait | observed baseline | about `4.05%` higher | no clear queue-wait advantage |
| Mean CPU validation | observed baseline | about `18.99%` lower | host-side variation dominated the apparent gain |
| Mean throughput | observed baseline | about `13.40%` higher | positive throughput means WG32 was faster |
| Median throughput | observed baseline | about `8.36%` higher | local browser-observed only |

The matched comparison was valid but inconclusive: all six samples used real WGSL Whirlpool pipelines, completed output readback, passed CPU spot checks, reported `0` mismatches, and had no pipeline errors or device losses. Recommendation eligibility remained false because observed variability exceeded thresholds. The UI and JSON export now report exact recommendation blockers instead of collapsing high variability into invalid telemetry.

Executed accounting is separated by workgroup size. For three valid repetitions each, WG1 records `24,576` completed hashes, `24,576` returned results, `48` logical dispatches, `3` submissions, `3` queue waits, `3` readbacks, and `3` command buffers; WG32 records the same profiling totals with `256` total workgroups per repetition instead of `8,192`. Combined six-sample totals are `49,152` completed hashes, `49,152` returned results, `96` logical dispatches, `6` submissions, `6` queue waits, `6` readbacks, and `6` command buffers.

Milestone 15.5.1 hotfix note: manual verification of the Milestone 15.5 UI exposed a formatter crash after the matched comparison appeared to complete. The failure was in reporting/result formatting, not in Whirlpool arithmetic, WebGPU execution, Core-vector comparison, or workgroup correctness. The exact regression was a schema mismatch: the matched comparison now stores `executedInvocationAccounting` as per-size objects (`wg1` and `wg32`), while the generic workgroup panel still tried to format flat fields such as `activeInvocations`. Optional numeric display now uses safe formatting, and completed matched results are preserved separately from render/display status.

Milestone 15.6 reorganizes the browser page into Guided and Advanced interface modes. Guided mode gives testers five top-level workflows, ordered workgroup prerequisite steps, `Run recommended correctness sequence`, `Prepare WG1 and WG32`, a dedicated matched-comparison panel, compact result summaries, and a clear reset for browser-session test state. Advanced mode keeps the existing raw JSON, histories, device limits, pipeline diagnostics, and export controls. This UI simplification does not change Whirlpool arithmetic, shader behavior, timing methodology, workgroup sizes, or recommendation thresholds.

The manual ladder status is now:

1. `256` hashes, dispatch batch size `64` - completed and passed.
2. `512` hashes, dispatch batch size `64` - completed and passed.
3. `1024` hashes, dispatch batch size `64` - completed and passed.
4. `1024` hashes, dispatch batch size `128` - completed and passed.
5. `2048` hashes, dispatch batch size `128` - completed and passed.
6. `4096` hashes, dispatch batch size `256` - completed and passed.
7. `8192` hashes, dispatch batch size `512` - completed and passed five times.

Each run must pass the automatic `10 fixtures x 1 nonce` correctness gate and CPU spot checks before its H/s values are treated as valid synthetic telemetry. Do not record the result as live mining, pool mining, target comparison, wallet functionality, payout logic, or production miner performance.

## Status Boundaries

Allowed status language:

- `WGSL/Core verification: Passed selected subset`
- `Full 294-vector WGSL/Core verification passed`
- `294 / 294 selected matches, 0 mismatches`
- `Correctness-only proof`
- `1 hash per dispatch`
- `Correctness-only batched verification; not optimized mining performance`
- `Full 294-vector batched WGSL/Core pass`
- `Batch size 64 verified`
- `Synthetic benchmark valid after correctness gate and CPU spot checks`

Do not claim production mining, profitable mining, mining-ready status, benchmark-ready performance, or an optimized WebGPU miner from the current result.
