# caps-webgpu

Research prototype for testing whether CapStash Proof-of-Work can run correctly and usefully in modern browsers through WebGPU.

This repository is not a production miner. Correctness and maintainability come before speed.

## Current Status

Completed:

- Canonical 80-byte CapStash header construction.
- Plain WHIRLPOOL-512 CPU reference implementation in browser-compatible JavaScript.
- CapStash XOR fold from 512 bits to 256 bits.
- Deterministic Whirlpool and CapStash PoW vectors.
- Automated tests for serialization, endian handling, mutations, randomized headers, and repeatability.
- Browser benchmark UI with warm-up, average H/s, peak H/s, minimum H/s, elapsed time, browser version, WebGPU adapter, vendor, and selected device limits.
- Explicit execution modes: CPU JavaScript, WASM, WebGPU detected only, and WebGPU compute shader.
- Stage A WebGPU plumbing-only compute shader that proves header buffers, nonce mapping, dispatch, and readback.
- Minimal real WGSL Whirlpool proof for exactly 80-byte headers, verified against the project CPU reference across deterministic fixtures.
- CapStash Core vector workflow: C++ Core-side generator, generated Core vector JSON, CPU comparison harness, and UI status panel.
- Independent CapStash Core vectors generated from `https://github.com/CapStash/CapStash-Core` commit `d5443789469376ca3cad2a892ab99978b88a4471`; Core vs CPU JavaScript passes for 294 vectors.
- WebGPU Whirlpool pipeline diagnostics: shader size, shader generation time, shader module creation time, pipeline creation time, timeout setting, validation error, device limits, and first pipeline error.
- WGSL/Core subset verification mode starts with `1 fixture x 1 nonce` and compares only the exact Core vectors returned by the selected WGSL run.
- Manual normal-browser WGSL/Core verification passed all currently exposed selected presets on `nvidia / blackwell`: `1x1`, `1x2`, `1x4`, `3x1`, `3x2`, and `10x1`, all with `0` mismatches.
- Manual full `294`-vector WGSL/Core verification passed on `nvidia / blackwell`: `294 / 294` selected matches, `0` mismatches.
- Optional WGSL batched dispatch verification mode exists for batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`. Batch size `1` preserves the known-good single-dispatch-per-hash path. Full `294`-vector batched WGSL/Core verification has passed for every exposed batch size through `64`.
- WebGPU timing diagnostics now separate original cold pipeline compile time from this-run cached pipeline status, this-run pipeline creation, dispatch/readback/comparison timing, and this-run total elapsed time.
- WGSL timing is split into shader generation, shader module creation, pipeline creation, buffer setup, dispatch, readback, CPU comparison, cold total time, and verified H/s with and without pipeline creation.
- Controlled synthetic nonce-batch benchmark mode exists as an explicit, non-default browser mode. It uses the verified WGSL Whirlpool batch shader over sequential synthetic nonce ranges, automatically runs a small WGSL correctness gate first, reads GPU results back, and CPU spot-checks selected nonces. It is not live mining, target comparison, pool mining, wallet support, payout logic, or optimized miner performance.
- Synthetic benchmark result export exists for completed browser runs: copy JSON, download JSON, and in-memory session history.
- First manually observed synthetic WGSL nonce-benchmark pass recorded: `256 / 256` hashes, batch size `64`, `4` dispatches, correctness gate passed, `5 / 5` CPU spot checks passed, `0` mismatches, no pipeline error, about `10.8 kH/s` including overhead and about `14.1 kH/s` excluding pipeline and CPU spot-check time. This is one browser run, not stable performance evidence.
- Manual synthetic ladder is now recorded through `8,192` hashes at dispatch batch size `512`. The `8,192`/`512` configuration was repeated five times with all runs passing the correctness gate, `5 / 5` CPU spot checks, `0` mismatches, and no pipeline error. Observed means were about `74.36 kH/s` including browser overhead and about `117.4 kH/s` excluding pipeline and CPU spot-check time. These are local browser observations, not native miner performance.
- Synthetic export now includes separate synthetic benchmark diagnostics and automatic correctness-gate diagnostics, plus an in-memory compatible repeated-run summary with mean/median/min/max/sample standard deviation/coefficient of variation.
- Synthetic profiling mode now exists as an explicit, non-default browser mode. It profiles the verified synthetic WGSL path with browser-observed host-side phases, per-dispatch timing, readback strategy labels, repetitions, JSON exports, and a conservative interpretation panel.
- Matched manual profiling comparison recorded: three valid Variant A repetitions and three valid Variant B repetitions at `8,192` hashes / batch `512`, all correctness-gated with CPU spot checks, zero mismatches, and no pipeline errors.
- Variant B is now the recommended profiling baseline for the tested browser/adapter/shader/fixture/workload: mean total elapsed about `36.5 ms` versus Variant A about `110.0 ms`, about `66.8%` lower total elapsed, about `92.4%` lower queue wait, about `93.1%` lower readback time, and about `3x` higher end-to-end throughput. Variant A remains available as the reference and regression path.
- WGSL workgroup-size experiment actions now exist for compile/device validation, the small `10 fixtures x 1 nonce` gate, explicit full `294`-vector WGSL/Core verification, and correctness-gated performance profiling. Variants `1`, `32`, `64`, `128`, and `256` use separate pipeline keys. The explicit action buttons are independent of the generic `Start Benchmark` button and the Minimal/Core WGSL preset selector. Workgroup size `1` remains the verified reference; alternate sizes are experimental and not performance-accepted until full `294`-vector WGSL/Core verification and a valid profiling run pass for that size.
- The workgroup performance action now invokes the real Variant B profiling engine with the selected workgroup pipeline key, full output readback, CPU spot checks, and telemetry validation. Zero-hash or zero-result performance outputs are invalid and must not be reported as completed profiling.
- Browser-observed WG32 status is now documented: compile, small gate, full `294 / 294` WGSL/Core verification, and valid Variant B profiling all passed with `8,192 / 8,192` hashes and `0` mismatches. Two independent three-repetition WG32 aggregates were observed around `191 kH/s`, but host-side variability was above the current recommendation threshold.
- Matched WG1 vs WG32 comparison support now exists and the first completed six-sample comparison is documented: `3` valid WG1 samples and `3` valid WG32 samples, strict pipeline identity, zero correctness failures, and conservative classification `host-side variability too high for a recommendation`. WG32 showed about `13.4%` higher mean throughput in that local browser comparison, but the apparent advantage was dominated by host-side CPU-validation variation rather than a clear queue-wait improvement.
- Matched comparison exports now include separate WG1 and WG32 executed invocation accounting, separate WG1/WG32/combined profiling totals, exact recommendation blockers, current-session workgroup full-294 identities, and a status model that distinguishes `valid matched comparison` from `no recommendation`.
- Browser UI now defaults to Guided mode with five test workflows: correctness verification, synthetic benchmark, synthetic profiling, workgroup experiment, and matched WG1-vs-WG32 comparison. Advanced mode preserves the existing controls, histories, raw JSON, pipeline diagnostics, device limits, and export tools.
- Guided workgroup flows include ordered prerequisite checklists, a recommended correctness sequence, `Prepare WG1 and WG32`, compact result summaries, visible disabled-action reasons, and an explicit current-session reset. This is UI organization only; hashing, profiling methodology, workgroup behavior, and recommendation thresholds are unchanged.
- `WEBGPU_OPTIMIZATION_PLAN.md` lists future optimization candidates and their required correctness gates. No shader arithmetic optimization has been performed.
- Windows-friendly local setup guide and `npm run doctor` environment check.
- Execution-path proof that benchmark throughput is still CPU JavaScript unless the explicit WebGPU verification mode is selected.
- Documentation for architecture, consensus verification, benchmark methodology, compatibility, limitations, and next steps.

Pending:

- Implement a WASM reference path.
- Re-run manual browser verification to confirm the updated timing labels on cached batched runs.
- Verify the new Guided mode in a normal WebGPU browser: choose `Matched WG1-vs-WG32 comparison`, click `Prepare WG1 and WG32`, run the matched comparison, then switch to Advanced mode and confirm raw diagnostics and exports remain available.
- Re-run the matched WG1 vs WG32 comparison in a normal WebGPU browser only when comparing a fresh browser/session state. Use `3` repetitions and the default alternating order; do not make a workgroup-size recommendation while variability blockers remain.
- Re-run the default Variant B profiling baseline in a normal WebGPU browser with `3` repetitions and export the profiling summary JSON.
- Add richer optional WGSL intermediate-state readback.
- Add measured native CUDA/OpenCL/Vulkan/CPU baselines.

## Goals

1. Construct the exact canonical CapStash mining header.
2. Compute the same PoW hash as CapStash Core.
3. Fail fast on any browser/reference mismatch.
4. Benchmark browser performance honestly.
5. Clearly distinguish Browser WebGPU Performance from native miner performance.

## Non-goals

This project does not implement wallet support, payouts, pool mining, Stratum, `getblocktemplate`, `submitblock`, live network mining, telemetry, analytics, or profitability claims.

## Repository Layout

```text
caps-webgpu/
  README.md
  ARCHITECTURE.md
  CONSENSUS_VERIFICATION.md
  CORE_VECTOR_GENERATION.md
  EXECUTION_PATH.md
  BROWSER_VERIFICATION_RESULTS.md
  WORKGROUP_EXPERIMENT_RUNBOOK.md
  ROADMAP.md
  NEXT_STEPS.md
  package.json
  index.html
  src/
    benchmark/
    cpu/
    ui/
    vectors/
    wasm/
    webgpu/
  tests/
  vectors/
  docs/
  scripts/
```

## Development

For Windows setup and PATH troubleshooting, start with [LOCAL_DEV_SETUP.md](./LOCAL_DEV_SETUP.md).

```bash
npm install
npm run doctor
npm test
npm run compare:core-vectors
npm run dev
```

The app can also be served by any static file server. The browser entry point is `index.html`.

Beginner checklist:

1. Choose `Matched WG1 vs WG32 Comparison`.
2. Click `Prepare WG1 and WG32`.
3. Wait for both full-294 checks to pass.
4. Confirm repetitions are set to `3`.
5. Click `Run matched comparison`.
6. Read the compact result summary.

## Testing

```bash
npm test
```

The suite covers:

- deterministic vectors
- randomized vectors
- nonce mutation
- timestamp mutation
- bits mutation
- merkle root mutation
- serialization verification
- repeatability
- browser-facing correctness vs CPU reference
- execution mode label accuracy
- proof that WebGPU compute mode cannot claim GPU hashing without a shader
- WebGPU Whirlpool fixture metadata, nonce-count planning, near-overflow rejection, CPU checkpoints, and failure reporting
- WGSL batch-size labels, conservative default batch size, dispatch-count math, batched task ordering, and mismatch batch/dispatch/index metadata
- generated CapStash Core vector JSON loading and CPU comparison behavior
- WGSL/Core selected-subset comparison, pipeline timeout/error reporting, and refusal to claim verification after pre-dispatch failure
- synthetic nonce-batch option labels, default-off status, nonce range math, dispatch count math, deterministic spot-check selection, and mismatch formatting
- synthetic benchmark export schema, JSON serialization, safe filename formatting, boundary flags, workgroup-dispatch labeling, in-memory session history, and repeated-run summary statistics
- synthetic profiling mode labels, phase timing schema, per-dispatch timing schema, no-readback probe boundaries, Variant B logical/physical dispatch accounting, profiling aggregation, bounded history, and export safety
- workgroup experiment action labels, selected-size full `294` verification accounting, real Variant B performance-profile telemetry, matched WG1/WG32 comparison controls, pipeline key separation, partial final workgroup terminology, and export boundaries that keep verification separate from planned profiling

Any mismatch fails the test run immediately.

## Browser WebGPU Manual Tests

Node cannot execute WebGPU adapter tests directly. Use normal Chrome or Edge for WebGPU verification; embedded/in-app browsers may block local URLs or restrict WebGPU. To run the Stage A plumbing browser test:

1. Run `npm run dev`.
2. Open `http://127.0.0.1:8080/`.
3. Select `WebGPU plumbing only`.
4. Leave nonce count at `64`.
5. Click `Start Benchmark`.
6. Confirm:
   - `Compute Shader` is `Present`.
   - `Hashes/Results Returned` is `64`.
   - `Dispatch Count` is `1`.
   - `Fake Shader Verification Mismatches` is `0`.
   - `Mismatches Against CPU Reference` is `64 expected for plumbing-only`.
   - `GPU Used For Hashing` remains `No`.

To run the minimal real WGSL Whirlpool Core-vector subset verification:

1. Run `npm run dev`.
2. Open `http://127.0.0.1:8080/`.
3. Select `WebGPU Whirlpool minimal`.
4. Click `Start Benchmark`.
5. Confirm:
   - `Active Mode Status` is `Real WebGPU Whirlpool hashing: Passed selected subset`.
   - `WGSL Verification Subset` is `1 fixture x 1 nonce` for the default first pass.
   - `Nonce Counts` is `1`.
   - `Fixture Cases` reports `1 executed / 0 rejected overflow cases`.
   - `Mismatches Against CPU Reference` is `0`.
   - The warning says whether the loaded Core vectors matched the CPU reference.
   - `Core Vector Status` is `CapStash Core vectors: generated`.
   - `CPU/Core Matches` reports `294 / 294`.
   - `WGSL Against Core` reports `WGSL/Core verification: Passed selected subset; 1 / 1 selected matches, 0 mismatches`.
   - Pipeline diagnostics show shader size, pipeline creation time, timeout setting, cold total time, warm dispatch time, and verified H/s with and without pipeline creation.

Manual normal-browser result observed for this preset:

- Browser/GPU: normal Edge or Chrome on `nvidia / blackwell`
- Core vectors loaded: `294`
- CPU/Core: `294 matches / 0 mismatches`
- WGSL/Core: `1 / 1 selected matches`, `0 mismatches`
- Shader size: `13,763 bytes / 13,763 code units`
- Pipeline creation time: about `31,112 ms`
- Pipeline timeout setting: `60,000 ms`
- Cold total time: about `31.29 s`
- Actual hashes completed: `1`

Expanded manual preset results are now recorded through `10 fixtures x 1 nonce`, with `10 / 10` selected matches and `0` mismatches. The full `294`-vector browser run also passed with `294 / 294` selected matches and `0` mismatches. This proves the current minimal WGSL Whirlpool path can match the generated CapStash Core vectors for this fixture set. It is still correctness evidence, not optimized mining performance.

See [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md) for the manual browser verification log. The recorded full-vector pass used batch size `1`, meaning the known-good single-dispatch-per-hash path. Batched full-vector WGSL/Core verification has now passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`, all with `294 / 294` selected matches and `0` mismatches. Batch size `64` reduced the full-vector verification from `294` dispatches to `5`. This remains correctness-only evidence and must not be treated as optimized mining performance.

Recorded synthetic ladder:

| Hashes | Dispatch batch | Dispatches | Status | Observed H/s including overhead | Observed H/s excluding pipeline and CPU spot-check time |
| ---: | ---: | ---: | --- | ---: | ---: |
| 256 | 64 | 4 | passed once | about `10.8 kH/s` | about `14.1 kH/s` |
| 512 | 64 | 8 | passed once | about `12.0 kH/s` | about `14.7 kH/s` |
| 1,024 | 64 | 16 | passed once | about `11.4 kH/s` | about `13.4 kH/s` |
| 1,024 | 128 | 8 | passed once | about `25.9 kH/s` | about `33.6 kH/s` |
| 2,048 | 128 | 16 | passed once | about `21.6 kH/s` | about `27.0 kH/s` |
| 4,096 | 256 | 16 | passed once | about `38.7 kH/s` | about `50.1 kH/s` |
| 8,192 | 512 | 16 | passed five times | mean about `74.36 kH/s` | mean about `117.4 kH/s` |

For the five repeated `8,192`/`512` runs, including-overhead H/s had mean `74.36 kH/s`, median `74.7 kH/s`, min `72.1 kH/s`, max `75.3 kH/s`, and coefficient of variation about `1.76%`. Excluding-pipeline-and-CPU-spot-check H/s had mean `117.4 kH/s`, median `117 kH/s`, min `113 kH/s`, max `121 kH/s`, and coefficient of variation about `2.73%`. This indicates low observed variation for that local browser setup, but it is still not optimized mining performance.

Recommended next diagnostic work:

1. Preserve the current correctness-gated ladder as baseline evidence.
2. Profile where synthetic time is spent before changing shader or dispatch behavior.
3. Keep synthetic benchmark labels separate from WGSL/Core verification and from any mining-performance wording.

## Execution Modes

The browser UI exposes these execution modes:

- `CPU JavaScript`: available now; hashes run on the browser main thread using the CPU reference implementation.
- `WASM`: not implemented yet.
- `WebGPU detected only`: available for adapter and limits inspection; computes zero hashes.
- `WebGPU plumbing only`: available now; runs a temporary fake WGSL shader to prove GPU plumbing, not CapStash hashing.
- `WebGPU Whirlpool minimal`: first real WGSL Whirlpool proof for exactly 80-byte headers; verifies deterministic fixtures at nonce counts `1`, `2`, `4`, `8`, and safe `16`.
- `Synthetic nonce benchmark`: available now; runs controlled synthetic sequential nonce batches through the verified WGSL Whirlpool batch shader after an automatic correctness gate, then CPU spot-checks selected nonces. It is local browser research only.
- `Synthetic profiling run`: available now; profiles browser-observed host phases around the verified synthetic WGSL path. It is correctness-gated, supports Variant A per-dispatch readback, Variant B multi-dispatch single-submission readback, and a profiling-only no-readback probe that is not a valid hash benchmark.
- `WebGPU compute real`: not implemented yet; computes zero real hashes and must not claim GPU hashing.

Current answer: real CapStash hashing exists in CPU JavaScript, in the WGSL verification path for deterministic 80-byte fixtures, and in the controlled synthetic WGSL nonce-batch mode. The WGSL verification path is correctness-only, and the synthetic path is a local browser research benchmark, not a production miner. Batch size `1` is the verified single-dispatch-per-hash path; batch sizes `2`, `4`, `8`, `16`, `32`, and `64` are verified for the full `294`-vector Core set.

Fixture verification status: CapStash Core vectors were generated from public Core commit `d5443789469376ca3cad2a892ab99978b88a4471`, and Core vs CPU JavaScript matches for 294 vectors. Browser WGSL vs Core passed the full `294`-vector manual run with `294 / 294` selected matches and `0` mismatches.

## CapStash Core Vectors

`vectors/capstash-core-pow-vectors.json` is generated from CapStash Core `CBlockHeader::GetPoWHash()` using:

- Repository: `https://github.com/CapStash/CapStash-Core`
- Branch: `main`
- Commit: `d5443789469376ca3cad2a892ab99978b88a4471`
- Vector count: `294`
- Core vs CPU JavaScript comparison: `294 / 294` matches, `0` mismatches
- Full Whirlpool-512 pre-fold output: not emitted in this run; folded PoW vectors come from Core consensus `GetPoWHash()`.

Run:

```bash
npm run compare:core-vectors
npm test
```

The CPU reference is now Core-vector verified against this Core commit. The minimal WGSL browser path is full-vector verified for the generated fixture set at batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`, while remaining correctness-only.

See [EXECUTION_PATH.md](./EXECUTION_PATH.md) for the full proof.
See [WEBGPU_WHIRLPOOL_NOTES.md](./WEBGPU_WHIRLPOOL_NOTES.md) for the Whirlpool-specific WGSL status.
See [WEBGPU_LIMITATIONS.md](./WEBGPU_LIMITATIONS.md) for browser/WebGPU limits and the future benchmark plan.
See [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md) for manual WGSL/Core browser results.
See [SYNTHETIC_BENCHMARK_RUNBOOK.md](./SYNTHETIC_BENCHMARK_RUNBOOK.md) for the manual synthetic benchmark ladder and export checklist.
See [WEBGPU_OPTIMIZATION_PLAN.md](./WEBGPU_OPTIMIZATION_PLAN.md) for future optimization candidates that remain unimplemented.

## Benchmark Language

The UI labels benchmark output as:

**Browser WebGPU Performance**

The WGSL verification panel reports correctness timings separately from benchmark throughput. Treat `Verified H/s including pipeline creation` as a cold correctness-run number, not miner performance. The synthetic benchmark reports local Browser WebGPU observations only. Native CUDA/OpenCL/Vulkan projections are intentionally disabled until a measured native baseline exists.

## Source Audit

The implementation and vector generator were audited against public CapStash-Core:

`https://github.com/CapStash/CapStash-Core` at commit `d5443789469376ca3cad2a892ab99978b88a4471`

Primary files reviewed:

- `src/primitives/block.cpp`
- `src/primitives/block.h`
- `src/rpc/mining.cpp`
- `src/pow.cpp`
- `src/crypto/whirlpool.h`
- `src/crypto/whirlpool.cpp`
- `src/crypto/whirlpool/whirlpool.c`

See [CONSENSUS_VERIFICATION.md](./CONSENSUS_VERIFICATION.md) for the consensus-critical details.
