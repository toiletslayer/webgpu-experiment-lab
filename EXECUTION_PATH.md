# Execution Path

Milestone 11 adds correctness-preserving WGSL batched dispatch infrastructure while preserving the Milestone 10.1 full 294-vector single-dispatch-per-hash verification pass.

## Current Answer

1. `cpu-js` computes real CapStash PoW hashes in CPU JavaScript.
2. `wasm` is not implemented.
3. `webgpu-detect-only` only reads WebGPU adapter/vendor/features/limits.
4. `webgpu-plumbing-only` runs a real WGSL compute shader, but the shader returns deterministic fake 256-bit outputs. It proves buffer layout, nonce mapping, dispatch, and readback. It is not CapStash hashing.
5. `webgpu-whirlpool-minimal` contains a real WGSL Whirlpool proof for exactly 80-byte messages. The fixture suite covers ten deterministic header categories with nonce counts `1`, `2`, `4`, `8`, and safe `16`.
6. `webgpu-compute-real` is still reserved for a broader real compute path and is not implemented as a production-like benchmark.

The UI must continue to state this for modes that do not run the minimal Whirlpool shader:

> WebGPU detected, but hashing is not yet running on the GPU.

Current vector status: `vectors/capstash-core-pow-vectors.json` is generated from public CapStash Core commit `d5443789469376ca3cad2a892ab99978b88a4471`. Core vs CPU JavaScript passes for `294 / 294` vectors.

WGSL/Core browser verification has passed all selected-subset presets and the full `294`-vector preset in normal Edge/Chrome on `nvidia / blackwell`. The full run reported `294 / 294` selected matches, `0` mismatches, `294` hashes/results returned, `294` dispatches, and `1` hash per dispatch. This remains the known-good batch size `1` path.

Optional batched verification supports selecting batch sizes `2`, `4`, `8`, `16`, `32`, and `64`. All exposed batch sizes through `64` have passed full `294`-vector WGSL/Core verification with `0` mismatches. Batch size `64` reduced the full-vector run from `294` dispatches to `5` dispatches.

The UI records shader size, this-run shader generation time, this-run shader module creation time, this-run pipeline creation status, original cold compile observation, timeout setting, validation errors, selected adapter/device limits, device-lost information, first pipeline error details, buffer setup time, dispatch time, readback time, CPU comparison time, this-run total elapsed time, and verified H/s with and without this-run pipeline creation.

The manual results are recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md). The recorded full-vector pass used `1` hash per dispatch, so it is correctness evidence only and not optimized mining performance.

The earlier in-app browser attempt detected WebGPU on `nvidia / blackwell`, loaded Core vectors, confirmed CPU/Core `294 matches / 0 mismatches`, then failed before dispatch with `createComputePipelineAsync timed out after 15000 ms`. Later normal-browser runs on `nvidia / blackwell` completed all exposed selected WGSL/Core presets successfully.

Milestone 8.5 adds `LOCAL_DEV_SETUP.md` and `npm run doctor` so Windows users can install Node.js LTS, verify `node`/`npm` on `PATH`, run tests, start the app, and perform WebGPU verification in normal Chrome or Edge instead of an embedded browser.

## Stage Status

| Stage | Status | Meaning |
| --- | --- | --- |
| Stage A: WebGPU plumbing proof | Complete | Temporary WGSL fake shader receives header/nonce data and returns deterministic 256-bit fake outputs. |
| Stage B: Real Whirlpool WGSL | Minimal fixture proof complete | WGSL computes Whirlpool-512 plus XOR folding for deterministic 80-byte header fixtures and safe tiny nonce counts. |

## Execution Path Diagram

CPU JavaScript real hash path:

```text
Browser UI
  -> cpu-js execution mode
  -> src/benchmark/benchmark-engine.js
  -> patch nonce in JavaScript
  -> src/cpu/capstash-pow.js
  -> src/cpu/whirlpool.js
  -> real CapStash folded PoW hash
  -> benchmark counters and UI metrics
```

WebGPU Stage A plumbing path:

```text
Browser UI
  -> webgpu-plumbing-only execution mode
  -> src/webgpu/plumbing-proof.js
  -> header buffer: 20 little-endian u32 words
  -> params buffer: nonceStart, nonceCount
  -> WGSL temporary fake shader patches nonce word 19
  -> output buffer: nonceCount * 8 u32 fake 256-bit outputs
  -> readback buffer
  -> JavaScript verifies fake outputs against CPU mirror of fake shader
  -> JavaScript also compares outputs to real CPU CapStash hashes and reports expected mismatches
```

WebGPU minimal Whirlpool fixture path:

```text
Browser UI
  -> webgpu-whirlpool-minimal execution mode
  -> src/webgpu/whirlpool-fixture-suite.js
  -> selected preset: 1x1, 1x2, 1x4, 3x1, 3x2, 10x1, or explicit Full 294 Core vectors
  -> selected batch size: 1, 2, 4, 8, 16, 32, or 64
  -> deterministic 80-byte fixture header
  -> nonceStart and nonceCount plan
  -> reject unsafe uint32 nonce overflow before dispatch
  -> src/webgpu/whirlpool-minimal.js
  -> generate WGSL and record shader size/timing diagnostics
  -> create shader module and compute pipeline with validation/error scopes
  -> header buffer: 20 little-endian u32 words
  -> params buffer: nonceStart, nonceCount
  -> WGSL shader patches nonce word 19
  -> WGSL computes two-block Whirlpool-512 for the 80-byte header
  -> WGSL XOR folds 512 bits to 256 bits
  -> output buffer: nonceCount * 8 u32 folded internal hash words
  -> JavaScript readback
  -> JavaScript compares every GPU result to the CPU reference
  -> JavaScript compares exact executed WGSL rows to matching generated Core vectors
  -> UI reports subset, fixture status, total results, mismatches, pipeline diagnostics, and first mismatch/error
```

For batch size `1`, the fixture suite keeps the known-good single-dispatch-per-hash path. For batch sizes greater than `1`, JavaScript packs a chunk of selected Core-vector tasks into one dispatch:

```text
selected Core-vector tasks
  -> header storage buffer: 20 little-endian u32 words per 80-byte header
  -> task storage buffer: [headerWordBase, nonce, 0, 0] per task
  -> params uniform buffer: task count plus padding
  -> WGSL invocation per task
  -> output storage buffer: 8 u32 folded internal-order words per task
  -> readback preserves task order
  -> CPU reference comparison
  -> CapStash Core vector comparison
```

The batched path changes dispatch grouping only. It must preserve nonce patching, Whirlpool-512, XOR folding, byte order, result ordering, and mismatch reporting.

Available WGSL/Core presets:

- `1 fixture x 1 nonce`
- `1 fixture x 2 nonces`
- `1 fixture x 4 nonces`
- `3 fixtures x 1 nonce`
- `3 fixtures x 2 nonces`
- `10 fixtures x 1 nonce`
- `Full 294 Core vectors`

Core vector comparison path:

```text
CapStash Core checkout
  -> scripts/core_pow_vector_generator.cpp
  -> CBlockHeader::GetPoWHash()
  -> vectors/capstash-core-pow-vectors.json
  -> src/vectors/core-vector-compare.js
  -> compare Core folded hash with CPU JavaScript folded hash
  -> optional browser comparison of Core folded hash with WGSL folded hash
  -> UI Core Vector Verification panel
```

WebGPU detection path:

```text
Browser UI
  -> src/webgpu/capabilities.js
  -> navigator.gpu.requestAdapter()
  -> adapter info, features, selected limits
  -> UI capability fields
```

## Execution Modes

| Mode | UI label | Outputs returned? | GPU work | Real CapStash GPU hashing? |
| --- | --- | ---: | --- | --- |
| `cpu-js` | CPU JavaScript | Yes | None | No |
| `wasm` | WASM | No | None | No |
| `webgpu-detect-only` | WebGPU detected only | No | Adapter detection only | No |
| `webgpu-plumbing-only` | WebGPU plumbing only | Yes | Temporary fake WGSL shader | No |
| `webgpu-whirlpool-minimal` | WebGPU Whirlpool minimal | Yes | Minimal WGSL Whirlpool proof | Yes, for deterministic 80-byte fixtures only |
| `webgpu-synthetic-nonce-benchmark` | Synthetic nonce benchmark | Yes | Batched WGSL Whirlpool over local synthetic nonce ranges | Yes, controlled local synthetic benchmark only |
| `webgpu-synthetic-profiling` | Synthetic profiling run | Yes | Batched WGSL Whirlpool over local synthetic nonce ranges with browser-observed phase timing | Yes only when full readback and CPU spot checks are enabled; no-readback probe is profiling-only |
| `webgpu-compute-real` | WebGPU compute real | No | Not implemented | No |

## WGSL Shader Status

`src/webgpu/plumbing-proof.js` contains `WEBGPU_PLUMBING_SHADER`.

The shader:

- receives an 80-byte header as 20 little-endian `u32` words,
- receives `nonceStart` and `nonceCount`,
- maps `global_invocation_id.x` to nonce index,
- patches nonce word 19 inside the shader,
- returns eight `u32` words per nonce,
- does not implement Whirlpool-512,
- does not implement CapStash XOR folding.

For Stage A:

- Hashes per dispatch field means fake results per dispatch.
- Data sent to GPU for fake proof: header words and nonce parameters.
- Data returned from GPU: `nonceCount * 8` `u32` fake output words.
- CPU-reference mismatches are expected because fake outputs are not CapStash hashes.

`src/webgpu/whirlpool-minimal.js` generates the minimal real WGSL Whirlpool shader.

The shader:

- receives an 80-byte header as 20 little-endian `u32` words,
- receives `nonceStart` and `nonceCount`,
- rejects no data internally, because JavaScript validates nonce overflow before dispatch,
- maps `global_invocation_id.x` to nonce index,
- patches the nonce into the second Whirlpool block,
- computes Whirlpool-512 for exactly an 80-byte message,
- applies CapStash XOR folding,
- returns eight `u32` internal-order folded result words per nonce.

`src/webgpu/synthetic-benchmark.js` drives the controlled synthetic nonce benchmark.

The synthetic path:

- uses the fixed `realistic-fields` 80-byte header fixture,
- generates a local sequential uint32 nonce range,
- rejects nonce ranges that would overflow past `0xffffffff`,
- runs the automatic `10 fixtures x 1 nonce` WGSL correctness gate at batch size `64`,
- packs synthetic tasks into dispatch batches,
- calls the same batched WGSL Whirlpool runner used by fixture verification,
- reads all folded 256-bit internal-order hashes back,
- CPU spot-checks selected nonces after GPU readback,
- records separate synthetic benchmark diagnostics and automatic correctness-gate diagnostics,
- exports local JSON with boundary flags showing no live mining, target comparison, pool connection, block submission, wallet support, payout tracking, network submission, or remote telemetry upload.

Current dispatch terminology:

```text
dispatch batch size = number of hashes/tasks submitted in one dispatch
WGSL workgroup size = @compute @workgroup_size(1) in the current batched Whirlpool shader
workgroups dispatched = dispatch batch size / 1 for full synthetic batches
```

For example, the recorded `8,192` hash run at dispatch batch size `512` used `16` dispatches. Each full dispatch launched `512` workgroups/invocations, one active hash per invocation. It did not use a 512-thread workgroup.

Milestone 15 adds compile-time workgroup-size variants for `1`, `32`, `64`, `128`, and `256`. The shader still uses `global_invocation_id.x` as the nonce/result index and retains the bounds check `index >= taskCount`, so padded invocations return without reading task data or writing output. The only intended shader declaration change is the literal `@workgroup_size(...)` value.

`src/webgpu/synthetic-profiling.js` drives the explicit synthetic profiling mode.

The profiling path:

- uses the same fixed synthetic fixture and automatic correctness gate,
- defaults to `8,192` hashes at dispatch batch size `512`,
- supports conservative presets `1,024/128`, `2,048/128`, `4,096/256`, and `8,192/512`,
- records browser-observed host-side phases,
- records per-dispatch timing and nonce ranges,
- supports repetitions `1`, `3`, `5`, and `10`,
- exports profiling result JSON and profiling summary JSON,
- keeps Variant A as the implemented current per-dispatch readback strategy,
- implements Variant B as multiple logical dispatches encoded into one command submission with one queue wait and one combined readback,
- documents Variant C as not implemented,
- provides a no-readback dispatch timing probe that is explicitly `profilingOnly: true`, `outputReadback: false`, `cpuSpotChecked: false`, and `validHashBenchmark: false`.

Profiling phases include fixture/header preparation, nonce-range planning, output-size calculation, buffer allocation, buffer population/upload, bind-group creation, command encoder creation, compute-pass encoding, queue submission, queue completion wait, map/readback wait, result decoding, CPU spot-check selection, CPU reference hashing / CPU-GPU comparison, result-object construction, UI-rendering scope, and total benchmark elapsed.

Profiling interpretation uses browser-observed timing only. It can classify a run as `dispatch-dominated`, `readback-dominated`, `CPU-validation-dominated`, `setup-dominated`, or `mixed`, but it cannot identify shader-internal arithmetic, memory, occupancy, power, or hardware-counter bottlenecks.

Manual profiling comparison recorded in Milestone 14.1:

- Variant A full readback: `8,192 / 8,192` hashes, batch size `512`, `16` logical dispatches, `16` physical submissions, `16` queue waits, `16` readbacks, total elapsed about `111.4 ms`, queue wait about `58.4 ms`, readback about `8.6 ms`, CPU validation about `26.2 ms`, about `73.9 kH/s`.
- No-readback probe: `8,192` WGSL invocations submitted, `0` output results returned, `16` logical dispatches, `16` physical submissions, `16` queue waits, `0` readbacks, total elapsed about `69.6 ms`, queue wait about `52.9 ms`, readback `0.0 ms`, CPU validation about `0.1 ms`, about `118 kH/s` timing rate.
- The no-readback probe reduced total elapsed by about `37.5%`, but it is profiling-only and not a valid hash benchmark.
- Queue wait remained the dominant browser-observed phase; shader-internal bottleneck remains unknown.

Variant B expected accounting for `8,192` hashes at batch size `512` is `16` logical dispatches, `1` physical submission, `1` queue wait, `1` command buffer, and `1` combined readback. Output index equals global task index so decoded results remain in ascending synthetic nonce order. Combined submission timing is reported once in the aggregate host-phase timing. Logical dispatch rows show nonce ranges, output offsets, byte lengths, workgroup counts, and active invocations; they are marked `timingScope: combined-submission`, `timingOwner: aggregate`, and `logicalDispatchTimingIndividuallyMeasured: false`.

Milestone 14.2 fixes A/B comparison counting so internal repetitions are counted as individual valid samples. Compatible samples must match execution mode, fixture/header, algorithm id, shader/pipeline key, shader size when available, hash count, dispatch batch size, WGSL workgroup size, correctness-gate settings, output-readback status, CPU spot-check status, browser user agent, adapter/vendor identity, device limits, and pipeline timing scope. No-readback probes, invalid runs, mismatches, pipeline errors, different browsers/adapters, different shaders, different hash counts, or different batch/workgroup sizes are excluded.

Matched repeated profiling results for the verified `8,192`/`512` configuration show `3` valid Variant A samples and `3` valid Variant B samples. Variant B is the repeatability-backed preferred profiling baseline for this browser, adapter, shader, fixture, workload, and batch size: about `66.8%` lower total elapsed, `92.4%` lower queue wait, `93.1%` lower readback time, CPU validation unchanged, and about `3x` higher end-to-end throughput. Variant A remains the reference and regression path.

Workgroup-size experiment accounting uses separate pipeline keys: `whirlpool-batched-wg1`, `whirlpool-batched-wg32`, `whirlpool-batched-wg64`, `whirlpool-batched-wg128`, and `whirlpool-batched-wg256`. For a logical chunk, `workgroupCount = ceil(hashesSubmitted / workgroupSize)`. The workgroup experiment panel exposes explicit actions for compile/device validation, the small correctness gate, full `294`-vector WGSL/Core verification, performance profiling, and matched WG1 vs WG32 comparison. Milestone 15.2 routes those buttons through direct handlers, cancels default/bubbling behavior, and records requested/started/completed action telemetry plus a run ID so stale actions cannot overwrite current results. Milestone 15.3 wires the performance action into the real Variant B synthetic profiling engine with the selected workgroup pipeline override. Milestone 15.4 adds matched comparison support that requires current-session full `294` passes for both WG1 and WG32, records alternating execution order, validates strict pipeline identity, stores samples separately by size, and blocks recommendations when variability is too high. Milestone 15.5 clarifies matched-comparison reporting: the top-level GPU status identifies the matched WebGPU comparison after a valid six-sample run, matched exports include separate WG1 and WG32 executed invocation/profiling accounting plus combined totals, and the status model keeps `valid matched comparison` separate from `no recommendation`. The full `294` action runs through the selected workgroup pipeline key; for workgroup size `32`, a single `294`-vector batch should launch `10` workgroups, `320` invocations, `294` active invocations, and `26` padded inactive invocations. A valid workgroup-32 performance profile should use `whirlpool-batched-wg32`, complete and return `8,192` results, use `16` logical dispatches, `1` submission, `1` queue wait, `1` readback, and `256` total workgroups. Zero-hash performance results are invalid. Workgroup size `1` remains the verified reference. Alternate sizes are not performance-accepted until device validation, small gate, full `294`-vector WGSL/Core verification, and synthetic profiling validation pass for that size.

Milestone 15.6 changes only browser UI organization. Guided mode chooses among correctness verification, synthetic benchmark, synthetic profiling, workgroup experiment, and matched WG1-vs-WG32 comparison. It hides unrelated controls for the selected workflow, shows one recommended next action, adds ordered correctness checklists, and provides `Run recommended correctness sequence` plus `Prepare WG1 and WG32`. Advanced mode keeps all existing controls, raw JSON, histories, diagnostics, and exports. Switching UI modes does not reset execution state.

## GPU Buffer Layout

Header storage buffer, binding 0:

| Word | Byte offset | Meaning |
| ---: | ---: | --- |
| 0 | 0 | `nVersion`, little-endian |
| 1..8 | 4..35 | `hashPrevBlock` internal `uint256` bytes as little-endian `u32` words |
| 9..16 | 36..67 | `hashMerkleRoot` internal `uint256` bytes as little-endian `u32` words |
| 17 | 68 | `nTime`, little-endian |
| 18 | 72 | `nBits`, little-endian |
| 19 | 76 | `nNonce`, overwritten in shader for each invocation |

Params uniform buffer, binding 1:

| Word | Meaning |
| ---: | --- |
| 0 | `nonceStart` |
| 1 | `nonceCount` |
| 2 | padding |
| 3 | padding |

Stage A output storage buffer, binding 2:

| Offset | Meaning |
| ---: | --- |
| `index * 8 + 0..7` | eight `u32` words forming one fake 256-bit output |

Minimal Whirlpool output storage buffer, binding 2:

| Offset | Meaning |
| ---: | --- |
| `index * 8 + 0..7` | eight `u32` words forming one real folded 256-bit internal hash |

## What Still Executes On CPU

- Real CapStash CPU reference hashing.
- CPU mirror of the fake Stage A shader for deterministic verification.
- CPU comparison between fake outputs and real CapStash hashes.
- CPU comparison between minimal WGSL Whirlpool outputs and project CPU reference hashes.
- CPU checkpoint generation for padded block words, round constants, final Whirlpool-512 bytes, and folded output.
- UI rendering and benchmark bookkeeping.

## Browser Manual Test

Node tests cover the deterministic fake shader algorithm, buffer layout model, fixture metadata, nonce overflow planning, CPU checkpoint model, and CPU/GPU summary formatting. Real WebGPU dispatch must be verified in a browser:

1. Run `npm run dev`.
2. Open `http://127.0.0.1:8080/`.
3. Select `WebGPU plumbing only`.
4. Run with nonce count `64`.
5. Confirm 64 results, 1 dispatch, 0 fake-shader verification mismatches, and 64 expected CPU-reference mismatches.

For the minimal real Whirlpool fixture proof:

1. Run `npm run dev`.
2. Open `http://127.0.0.1:8080/`.
3. Select `WebGPU Whirlpool minimal`.
4. Click `Start Benchmark`.
5. Confirm `Real WebGPU Whirlpool hashing: Passed selected subset`, 0 CPU/GPU mismatches, `CPU/Core Matches` as `294 / 294`, the selected `WGSL Verification Subset`, and `WGSL/Core verification: Passed selected subset`.
6. Record shader size, pipeline creation time, cold total time, warm dispatch time, timeout setting, adapter/vendor, and any validation or device-lost messages.
7. The selected-subset presets and `Full 294 Core vectors` have all passed on the documented browser/GPU combination.
8. Append each successful manual run to [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md).

Browser verification is hardware- and browser-dependent. If browser automation or a local URL is blocked in a given environment, rerun the fixture suite manually on a WebGPU-capable browser before treating the milestone as hardware-observed on that adapter.

When generated Core vectors are present, the same browser run also reports:

- Core vector count
- CPU reference matches/mismatches against Core
- WGSL selected-subset matches/mismatches against Core
- first Core mismatch details
- first pipeline error details and pipeline diagnostics

When generated Core vectors are absent, the UI must say `CapStash Core vectors: pending`.

## Synthetic Nonce Benchmark Path

`webgpu-synthetic-nonce-benchmark` is an explicit, non-default browser mode. It is separate from WGSL/Core verification.

Execution path:

```text
UI selects Synthetic nonce benchmark
  -> automatic correctness gate: 10 fixtures x 1 nonce, batch size 64
  -> fixed realistic-fields 80-byte fixture header
  -> sequential synthetic nonce range generated locally
  -> WGSL batched Whirlpool shader computes one folded hash per invocation
  -> browser reads every folded 256-bit result back for accounting
  -> JavaScript CPU reference spot-checks selected nonces only
  -> UI marks the run valid only if the gate passes and all spot checks match
  -> completed run creates a structured local JSON export object
  -> user may copy JSON, download JSON, or view in-memory session history
```

This path sends packed 80-byte headers as twenty little-endian `u32` words per task plus task words containing the header base and nonce. It returns eight `u32` folded hash words per nonce. It does not compare proof targets, connect to pools, submit blocks, use wallets, track payouts, or claim profitability.

Current exposed synthetic hash counts are `256`, `512`, `1024`, `2048`, `4096`, and `8192`; the default is `1024`. Current dispatch batch sizes are `64`, `128`, `256`, `512`, and `1024`; the default is `64`. Manual normal-browser runs are recorded through `8,192` hashes at dispatch batch size `512`, including five repeated `8,192`/`512` runs. These controls remain research instrumentation, not optimized performance claims.

Milestone 13.1 audit result: no live network dependency, target comparison, pool behavior, wallet behavior, or hidden CPU fallback was found in the synthetic path. One accounting issue was corrected: synthetic H/s excluding pipeline now excludes CPU spot-check time, which is reported separately as CPU spot-check timing. The export object includes explicit boundary flags such as `liveMining: false`, `targetComparison: false`, `poolConnection: false`, `blockSubmission: false`, and `resultType: synthetic-browser-research`.

## Current Bottlenecks

- CPU reference hashing still uses JavaScript `BigInt` 64-bit operations.
- Minimal WGSL dispatches small nonce counts, so readback and command overhead dominate timing.
- Synthetic nonce benchmarking now has correctness-gated browser observations through `8,192`/`512`, and repeated A/B profiling identifies Variant B as the scoped profiling baseline for that verified configuration. All measurements remain local browser research telemetry.

## Known Risks

- Endian handling must remain exact when Stage B ports Whirlpool.
- `uint256` display order differs from internal bytes.
- WGSL lacks broadly portable native 64-bit integer arithmetic.
- GPU readback may dominate small nonce counts.
- The minimal shader is specialized to exactly 80-byte headers.
- Browser WGSL/Core verification passed the generated full `294`-vector fixture set on the documented normal-browser run.
- The first cold pipeline creation was about `31,112 ms` on the observed `nvidia / blackwell` run, while later warm/cached preset runs reported much smaller pipeline times. Those setup costs must remain separated from dispatch/readback timing.
- The recorded full-vector verification path uses `1` hash per dispatch, so timing is not representative of optimized mining.
- The optional batched path is full-vector verified for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`.
- Milestone 12 separates the original cold batched compile observation around `33,526.7 ms` from cached this-run timing fields.
- Synthetic nonce-batch runs CPU spot-check selected nonces rather than CPU-checking every result, so any mismatch invalidates the run and should be investigated before increasing counts or batch sizes.

## Recommended Next Milestone

Run or re-run the matched WG1 vs WG32 comparison before accepting any alternate workgroup performance result:

1. Select `WGSL workgroup-size experiment`.
2. Choose workgroup size `32`.
3. Click `Compile selected variant`.
4. Run the small `10 fixtures x 1 nonce` gate.
5. If the small gate passes, run the explicit full `294` verification action.
6. Confirm the selected pipeline key is `whirlpool-batched-wg32`.
7. Confirm requested, started, and completed action types are all `full-294-vector-verification`.
8. Confirm `294 / 294` matches, `0` mismatches, and the expected padded-invocation accounting.
9. Repeat the current-session compile, small gate, and full `294` sequence for WG1 if needed.
10. Set matched comparison repetitions to `3`.
11. Run `Run matched WG1 vs WG32 comparison`.
12. Confirm WG1 uses `whirlpool-batched-wg1`, WG32 uses `whirlpool-batched-wg32`, alternating order is recorded, each size has `3` valid repetitions, each repetition completes and returns `8,192` hashes, CPU spot checks pass, mismatches are `0`, the top-level status says a matched WebGPU comparison ran, and interpretation remains conservative.
13. Export the matched comparison JSON result.

For a completed `3 + 3` matched run, combined accounting should report `49,152` completed hashes, `49,152` returned results, `96` logical dispatches, `6` physical submissions, `6` queue waits, `6` readbacks, and `6` command buffers. Recommendation blockers should list exact exceeded variability thresholds when no workgroup-size recommendation is made.
