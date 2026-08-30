# Architecture

## Modules

- `src/cpu/whirlpool.js`: browser-compatible plain WHIRLPOOL-512 reference implementation.
- `src/cpu/capstash-pow.js`: CapStash header serialization, mutation helpers, XOR folding, and Core-style hash display.
- `src/cpu/correctness.js`: browser-facing correctness gate.
- `src/vectors/consensus-vectors.js`: deterministic vectors.
- `src/vectors/whirlpool-fixtures.js`: deterministic 80-byte WebGPU Whirlpool verification fixtures and nonce-count plan.
- `src/vectors/core-vector-compare.js`: comparison helpers for pending/generated CapStash Core PoW vectors.
- `src/benchmark/benchmark-engine.js`: execution-mode definitions, benchmark loop state, warm-up, samples, runtime split, and native estimate ranges.
- `src/webgpu/capabilities.js`: WebGPU support, adapter, feature, and limit detection.
- `src/webgpu/plumbing-proof.js`: Stage A WebGPU compute plumbing proof with a temporary fake WGSL shader.
- `src/webgpu/whirlpool-minimal.js`: Stage B minimal real WGSL Whirlpool kernel for exactly one 80-byte message per fixture case, with shader/pipeline diagnostics.
- `src/webgpu/whirlpool-fixture-suite.js`: browser fixture-suite runner, selected subset planning, overflow rejection, progress reporting, pre-dispatch failure reporting, and CPU/GPU summary formatting.
- `src/webgpu/synthetic-benchmark.js`: correctness-gated local synthetic nonce benchmark control path, export schema, history, and repeated-run statistics.
- `src/webgpu/synthetic-profiling.js`: correctness-gated profiling control path with Variant A per-dispatch readback, Variant B multi-dispatch single-submission readback, no-readback probe boundaries, phase timing, exports, and Variant A/B comparison helpers.
- `src/webgpu/workgroup-experiment.js`: compile-time WGSL workgroup-size experiment helpers, explicit compile/small-gate/full-294/profile actions, per-size status isolation, invocation accounting, device-limit validation, exports, and performance-eligibility rules.
- `src/ui/app.js`: DOM binding and benchmark UI.
- `tests/run-tests.js`: automated test suite.
- `vectors/capstash-core-pow-vectors.json`: generated CapStash Core PoW vector data.
- `scripts/core_pow_vector_generator.cpp`: Core-side generator for Milestone 6 fixture vectors.
- `scripts/compare-core-vectors.js`: Node comparison CLI for Core vectors versus CPU JavaScript.
- `scripts/doctor.js`: local environment check for Node.js, npm, required project files, Core vectors, and dependency state.

## Consensus Hash Flow

```text
CBlockHeader fields
  -> canonical 80-byte header
  -> WHIRLPOOL-512
  -> XOR digest[0..31] with digest[32..63]
  -> internal uint256 bytes
  -> Core display hex reverses those bytes
```

## WebGPU Investigation Direction

Whirlpool is table-heavy and operates on eight 64-bit words. Portable WGSL does not currently provide the same native 64-bit integer arithmetic baseline as C++ or CUDA. A faithful WebGPU implementation probably needs:

- `u64` emulation with pairs of `u32`.
- Whirlpool tables in constants or storage buffers.
- One invocation per nonce.
- Header prefix in a uniform/storage buffer.
- Separate correctness output path before any high-throughput benchmark path.

The project should stop rather than force a shader if the faithful WGSL implementation becomes fragile or misleading.

## Current Execution Path

```text
UI start button
  -> selected execution mode
  -> cpu-js mode gate
  -> JavaScript CPU reference hash loop
  -> CapStash PoW hash
  -> benchmark counters and UI metrics
```

`cpu-js` does not dispatch a WGSL compute shader. `webgpu-plumbing-only` does dispatch a WGSL shader, but that shader is a temporary fake-output plumbing proof and not CapStash hashing. `webgpu-whirlpool-minimal` dispatches a real WGSL Whirlpool shader, but only as a correctness proof over deterministic fixture cases.

Execution modes:

- `cpu-js`: enabled; hashes run in JavaScript on the CPU.
- `wasm`: disabled; no WASM module exists yet.
- `webgpu-detect-only`: enabled for capability reporting; computes zero hashes.
- `webgpu-plumbing-only`: enabled; runs fake deterministic WGSL output to prove buffer layout, nonce mapping, dispatch, and readback.
- `webgpu-whirlpool-minimal`: enabled; real WGSL Whirlpool proof defaults to a `1 fixture x 1 nonce` Core-vector subset before broader fixture expansion.
- `webgpu-synthetic-nonce-benchmark`: enabled; runs the real WGSL Whirlpool batch shader on a fixed local synthetic fixture after an automatic correctness gate and CPU spot checks.
- `webgpu-synthetic-profiling`: enabled; profiles the verified synthetic WGSL path with browser-observed phase timing. It is not selected by default and does not expose GPU hardware counters.
- `webgpu-workgroup-experiment`: enabled; compiles selected `@workgroup_size(...)` variants, runs the small correctness gate, and can explicitly run full `294`-vector WGSL/Core verification through the selected pipeline key. Workgroup size `1` remains the verified reference, and alternate sizes are experimental until full `294`-vector WGSL/Core verification and valid profiling pass for that size.
- `webgpu-compute-real`: disabled as a benchmark/mining backend; the real WGSL hash paths remain correctness-gated research modes.

## Stage A GPU Buffer Layout

- Binding 0: storage buffer with 20 little-endian `u32` words representing the 80-byte header.
- Binding 1: uniform buffer with `nonceStart`, `nonceCount`, and two padding words.
- Binding 2: storage output buffer with eight `u32` fake result words per nonce.

The Stage A shader patches word 19 with `nonceStart + global_invocation_id.x`.

## Minimal Whirlpool GPU Buffer Layout

`webgpu-whirlpool-minimal` uses the same header and params bindings as Stage A, but binding 2 contains real folded CapStash PoW output words:

- Binding 0: storage buffer with 20 little-endian `u32` words representing one 80-byte header.
- Binding 1: uniform buffer with `nonceStart`, `nonceCount`, and two padding words.
- Binding 2: storage output buffer with `nonceCount * 8` `u32` words.

The shader patches the nonce from `nonceStart + global_invocation_id.x`, computes two Whirlpool blocks specialized to the 80-byte header length, folds the upper and lower 256-bit halves, and returns eight `u32` internal-order result words per nonce.

The full fixture suite covers ten fixture categories:

- all-zero header except nonce
- incrementing bytes
- high-bit bytes
- deterministic random bytes
- realistic-looking CapStash fields
- only `nTime` changed
- only `nBits` changed
- only merkle root changed
- nonce starts near `0xffffffff`
- explicit overflow rejection

Nonce counts are `1`, `2`, `4`, `8`, and `16` when safe. The overflow fixture rejects count `16` before dispatch to avoid uint32 nonce wrap.

Current verification statement: Core vs CPU JavaScript matches for `294 / 294` generated CapStash Core vectors. Browser WGSL vs Core verification has passed all selected-subset presets and the full `294`-vector preset in a normal browser on `nvidia / blackwell`, with `0` mismatches. That recorded full pass used batch size `1`, the known-good single-dispatch-per-hash path.

Milestone 9 exposes explicit WGSL/Core verification presets:

- `1 fixture x 1 nonce`
- `1 fixture x 2 nonces`
- `1 fixture x 4 nonces`
- `3 fixtures x 1 nonce`
- `3 fixtures x 2 nonces`
- `10 fixtures x 1 nonce`

The UI separates cold setup from hash-dispatch work. It reports original cold compile observation, this-run shader generation, this-run shader module creation, this-run pipeline creation/reuse status, buffer setup, dispatch, readback, CPU comparison, this-run total elapsed time, pipeline reuse/cache status, and verified H/s both including and excluding this-run pipeline creation. These are correctness-run rates, not native miner or production benchmark claims.

Milestone 11 adds an optional WGSL batched dispatch path. Batch size `1` preserves the existing verified path. Batch sizes `2`, `4`, `8`, `16`, `32`, and `64` pack multiple Core-vector tasks into one dispatch call:

- header buffer: `20` little-endian `u32` words per 80-byte header
- task buffer: four `u32` words per task, currently `[headerWordBase, nonce, 0, 0]`
- params buffer: task count, task offset, output offset, and padding
- output buffer: eight `u32` folded internal-order hash words per task

Each invocation computes exactly one CapStash PoW hash using the same Whirlpool-512 plus XOR-fold logic. JavaScript then compares WGSL output against both the CPU reference and loaded CapStash Core vectors. Batch sizes greater than `1` are exposed for manual correctness verification and must not be called full-vector verified until recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md).

## Core Vector Workflow

Milestone 7 adds independent Core vectors without fabricating data:

```text
CapStash Core checkout
  -> scripts/core_pow_vector_generator.cpp
  -> CBlockHeader::GetPoWHash()
  -> vectors/capstash-core-pow-vectors.json
  -> src/vectors/core-vector-compare.js
  -> CPU JavaScript comparison
  -> optional browser WGSL comparison
```

Current repository state:

- `vectors/capstash-core-pow-vectors.json` is generated from `https://github.com/CapStash/CapStash-Core` commit `d5443789469376ca3cad2a892ab99978b88a4471`.
- Node tests verify generated-vector metadata, nonce ranges, overflow rejection, and Core vs CPU comparison behavior.
- The UI displays the generated Core vector count and CPU/Core match count when the JSON is loaded.
- The UI displays WGSL/Core status as pending, failed before dispatch, failed hash comparison, passed selected subset, or passed all Core vectors.
- The CPU reference is Core-vector verified for this fixture set; WGSL/Core is full-vector verified for the batch size `1` single-dispatch-per-hash path.
- The batched WGSL path is full-vector verified for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`.
- Local verification should use `npm run doctor`, `npm run dev`, and normal Chrome or Edge; embedded browsers may block localhost or restrict WebGPU.

## Synthetic Profiling Variants

The synthetic profiling path uses the same fixed local fixture and the same WGSL Whirlpool batch shader as the synthetic benchmark. Every normal profiling run first runs the automatic `10 fixtures x 1 nonce` correctness gate at batch size `64`.

Variant A is the known current behavior: each logical synthetic dispatch is encoded, submitted, waited on, read back, decoded, and spot-checked before the next logical dispatch.

Variant B keeps the same Whirlpool arithmetic and `@workgroup_size(1)` shader model, but encodes multiple logical dispatch chunks into one command encoder, submits one command buffer, waits once, and reads back one combined output buffer. For `8,192` hashes at batch size `512`, Variant B should report:

- `16` logical dispatches
- `1` physical queue submission
- `1` queue wait
- `1` command buffer
- `1` combined readback
- `8,192` returned output hashes

The batched WGSL params include task and output offsets so each logical dispatch writes to a non-overlapping section of the combined output buffer. Output index equals global task index, preserving ascending synthetic nonce order.

The no-readback probe executes WGSL after the correctness gate but returns `0` output results and disables CPU spot checks. It is profiling-only and must not be treated as a valid hash benchmark.
