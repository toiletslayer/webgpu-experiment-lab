# WebGPU Whirlpool Notes

## This Is Whirlpool, Not SHA-256

CapStash Proof-of-Work is not SHA-256 and not double SHA-256.

The consensus path is:

1. Canonical 80-byte block header.
2. Plain WHIRLPOOL-512 over that header.
3. XOR fold the Whirlpool output:
   `out32[i] = wh[i] ^ wh[i + 32]`, for `i = 0..31`.

No SHA-256 mining assumptions belong in this project.

## Current Whirlpool Status

`webgpu-whirlpool-minimal` exists as a first real WGSL Whirlpool proof. The verification harness now covers deterministic 80-byte fixtures instead of one fixed header.

Fixture coverage:

- all-zero header except nonce
- incrementing byte pattern
- high-bit byte pattern
- deterministic random fixture bytes
- realistic-looking CapStash fields
- only `nTime` changes
- only `nBits` changes
- only merkle root changes
- nonce starts near `0xffffffff`
- explicit nonce-overflow rejection

Nonce counts are `1`, `2`, `4`, `8`, and `16` where safe. The overflow fixture starts at `0xfffffff8`; count `8` is safe and count `16` is rejected before dispatch.

Verification statement: CPU JavaScript is verified against independent CapStash Core vectors generated from `https://github.com/CapStash/CapStash-Core` commit `d5443789469376ca3cad2a892ab99978b88a4471`. The comparison covers `294` vectors with `0` mismatches.

The WGSL fixture proof is verified against the project CPU reference in the browser harness. WGSL/Core verification has passed for all selected-subset presets and for the full generated Core vector file: `294 / 294` selected matches, `0` mismatches.

Observed browser attempt on this run: the in-app Chrome browser detected WebGPU on `nvidia / blackwell`, loaded the generated Core vectors, and showed CPU/Core `294 matches / 0 mismatches`. The `webgpu-whirlpool-minimal` run failed before dispatch with `createComputePipelineAsync timed out after 15000 ms`, so no WGSL/Core hash comparison was completed.

Milestone 8 adds diagnostics and selected-subset verification for the next browser run:

- default subset: `1 fixture x 1 nonce`
- shader generation time
- WGSL source size in UTF-8 bytes and JavaScript code units
- shader module creation time
- compute pipeline creation time
- pipeline timeout setting
- WebGPU validation error message, if any
- selected adapter/device limits
- device-lost reason/message, if any
- first pipeline error details

The updated browser run could not be completed in this Codex environment because the in-app browser blocked the local verification URL by policy.

Milestone 8.5 adds `LOCAL_DEV_SETUP.md` and `npm run doctor` to make normal Windows Chrome/Edge verification easier. Use a standard browser for WGSL/Core verification; embedded browsers may block localhost or restrict WebGPU.

Manual normal-browser verification later passed:

- Adapter: `nvidia / blackwell`
- Core vectors loaded: `294`
- CPU/Core: `294 matches / 0 mismatches`
- WGSL/Core preset: `1 fixture x 1 nonce`
- WGSL/Core: `1 / 1 selected matches`, `0 mismatches`
- Shader size: `13,763 bytes / 13,763 code units`
- Pipeline creation: about `31,112 ms`
- Pipeline timeout: `60,000 ms`
- Cold total time: about `31.29 s`
- Actual hashes completed: `1`

Expanded manual preset verification later passed through `10 fixtures x 1 nonce`, with `10 / 10` selected matches and `0` mismatches. Full 294-vector manual verification also passed with `294 / 294` selected matches and `0` mismatches. This proves the minimal WGSL Whirlpool path can match the generated CapStash Core fixture set for the batch size `1` single-dispatch-per-hash path. Batched full-vector verification later passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`, all with `294 / 294` selected matches and `0` mismatches. It does not prove optimized performance.

This is not a production miner and is not a performance result.

The manual browser runs are recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md). Batch size `16` reduced the full-vector verification from `294` dispatches to `19` dispatches while preserving Core agreement.

## Header Representation

The 80-byte CapStash header is represented on GPU as 20 little-endian `u32` words:

- words `0..15`: first 64 bytes of the header,
- word `16`: last word of `hashMerkleRoot`,
- word `17`: `nTime`,
- word `18`: `nBits`,
- word `19`: `nNonce`.

The WGSL path patches word `19` with `nonceStart + global_invocation_id.x`.

## Endian Assumptions

CapStash Core copies internal `uint256` bytes directly into the header. Display hex is reversed relative to those internal bytes.

Whirlpool's SPHlib implementation reads message blocks as little-endian 64-bit words. The WGSL attempt represents each 64-bit word as `vec2<u32>`:

- `.x`: low 32 bits,
- `.y`: high 32 bits.

Folded output words are returned as internal little-endian bytes so they can be compared directly with `capstashPoWInternalHex()`.

## Padding For 80-Byte Input

An 80-byte header always requires two Whirlpool blocks:

- Block 0: bytes `0..63`.
- Block 1:
  - bytes `64..79` from the header,
  - `0x80` padding byte,
  - zero padding,
  - 256-bit big-endian bit length field.

For 80 bytes, bit length is `640` (`0x0280`). Because the compression function reads little-endian 64-bit words, the final length word is represented as:

```text
vec2u(0x00000000u, 0x80020000u)
```

## Constants And Tables

The WGSL source is generated from the same Core-derived `PLAIN_T0` and `PLAIN_RC` constants used by the JavaScript CPU reference.

To keep the first implementation small, WGSL stores only `T0` and rotates entries by byte multiples to derive the equivalent of `T1..T7`.

## What Executes On GPU

The current WGSL attempt includes:

- table lookup,
- 64-bit XOR using `vec2<u32>`,
- byte extraction,
- 64-bit rotation by multiples of 8,
- two-block Whirlpool compression specialized to exactly 80-byte input,
- XOR folding to eight `u32` output words.

The fixture harness expects zero CPU/GPU mismatches across all executed fixture cases. Any mismatch is reported with fixture id, fixture name, nonce count, nonce, CPU internal hash, and GPU internal hash.

Core/WGSL mismatch output also includes the patched 80-byte header hex, Core display hash, Core internal folded hash, CPU JavaScript internal folded hash, WGSL internal folded hash, and byte-order notes.

Browser verification is hardware- and browser-dependent. If browser automation or a local URL is blocked in a given environment, run the documented manual fixture-suite check on the target browser/adapter.

## Intermediate Verification

The CPU reference now exposes `buildWhirlpool80CpuCheckpoints()` for one patched 80-byte header and nonce. It records:

- 20 serialized header `u32` words,
- first Whirlpool block words,
- padded second Whirlpool block words,
- all-zero initial state,
- ten Core-derived round constants,
- final 512-bit Whirlpool output before folding,
- folded 256-bit internal output.

The current WGSL shader returns only the final folded 256-bit output because Milestone 6 keeps the GPU output layout simple: eight `u32` words per nonce. Returning intermediate round state would require a separate debug output buffer or a wider per-result structure, and that would change the harness surface before independent Core vectors exist.

Practical checkpoint comparison added now:

- Node tests verify the CPU checkpoint padding words for 80-byte input, including the `0x80` padding word and final `0x80020000` length word used by the WGSL shader.
- Node tests verify the round-constant count and final digest/fold lengths.
- Browser fixture verification compares final folded WGSL output against the CPU reference for every executed nonce.
- When generated Core vectors are present, the browser can also compare final folded WGSL output against Core vector values.

Recommended future debug step: add an optional `webgpu-whirlpool-debug` mode that returns selected block states for one nonce only, separate from the folded-output verification path.

## Synthetic Nonce-Batch Benchmark

`webgpu-synthetic-nonce-benchmark` reuses the verified batched WGSL Whirlpool shader but does not expand consensus verification. It is a separate local browser research mode:

- fixed fixture: `realistic-fields`
- nonce sequence: local sequential uint32 range
- hash counts: `256`, `512`, `1024`, `2048`, `4096`, `8192`
- dispatch batch sizes: `64`, `128`, `256`, `512`, `1024`
- correctness gate: automatic `10 fixtures x 1 nonce` WGSL check at batch size `64`
- CPU comparison: selected spot-check nonces only after GPU readback

The shader still computes the same 80-byte-header Whirlpool-512 plus XOR fold. The synthetic mode must not be described as Core-vector verification, full-vector verification, pool mining, target comparison, live mining, wallet support, payout logic, or optimized miner performance. A failed gate or failed spot check invalidates the run.

Milestone 13.1 adds structured export and in-memory session history for completed synthetic runs. Exported JSON is local only and includes environment, mode, correctness, timing, and explicit boundary fields.

First manual synthetic browser pass: `256 / 256` hashes at batch size `64`, `4` dispatches, correctness gate passed, `5 / 5` CPU spot checks passed, `0` mismatches, no pipeline error, about `10.8 kH/s` including overhead and about `14.1 kH/s` excluding pipeline and CPU spot-check time. The cached current run had `0.0 ms` pipeline creation; a historical page-session cold compile observation around `26,462.9 ms` did not apply to that cached run. This is a single controlled local browser run, not stable performance evidence.

The manual synthetic ladder is now recorded through `8,192` hashes at dispatch batch size `512`. The `8,192`/`512` configuration was repeated five times; every run completed `8,192 / 8,192` hashes, used `16` dispatches, passed the automatic correctness gate, passed `5 / 5` CPU spot checks, reported `0` mismatches, and had no pipeline error. The repeated-run means were about `74.36 kH/s` including browser overhead and about `117.4 kH/s` excluding pipeline and CPU spot-check time, with low observed variation on that local browser setup.

Dispatch batch size is not the same as WGSL workgroup size. The current batched Whirlpool shader uses `workgroup_size(1)`. A synthetic dispatch batch size of `512` launches `512` workgroups/invocations, one active hash per invocation. This keeps result ordering and correctness simple before any workgroup-shape optimization is attempted.

Milestone 14 adds an explicit `Synthetic profiling run` mode. It does not change Whirlpool arithmetic, constants, folding, nonce patching, byte order, or the Core-vector verification path. It wraps the verified synthetic path with browser-observed phase timers and optional repetitions.

The implemented readback strategies are now:

- Variant A: read back after every synthetic dispatch.
- Variant B: encode multiple logical dispatches into one command submission, wait once, and read back one combined output buffer.
- No-readback probe: diagnostic-only dispatch timing after the correctness gate; not a valid hash benchmark.

Variant C, a single large dispatch where permitted, remains a documented future candidate. Variant B preserves the existing verified shader model: `@workgroup_size(1)`, one nonce per invocation, unchanged Whirlpool rounds, unchanged XOR folding, and unchanged internal byte order.

Milestone 14.1 recorded Variant A versus no-readback profiling on `8,192` hashes at batch size `512`. Variant A completed with `8,192 / 8,192` hashes returned, CPU spot checks, zero mismatches, and about `111.4 ms` total elapsed. The no-readback probe submitted the same `8,192` WGSL invocations but returned `0` output results and completed in about `69.6 ms`; it is profiling-only, not correctness evidence for that run. Queue wait remained the largest browser-observed phase, and shader-internal bottleneck remains unknown.

Milestone 14.2 records matched repeated Variant A and Variant B profiling results. Each strategy has `3` valid internal repetition samples for `8,192` hashes at batch size `512`. Variant B is the preferred profiling baseline for that tested browser/adapter/shader/fixture/workload because it lowered mean total elapsed from about `110.0 ms` to about `36.5 ms` while preserving correctness, full readback, CPU spot checks, deterministic ordering, zero mismatches, and the existing `workgroup_size(1)` shader. This does not change Whirlpool arithmetic and does not prove universal performance across other adapters or future shader variants.

Milestone 15 adds compile-time workgroup-size variants for `1`, `32`, `64`, `128`, and `256`. The generated shader still uses `global_invocation_id.x` for the nonce/result index and keeps the bounds check for padded invocations. Each size has a distinct pipeline key. Milestone 15.1 adds explicit browser actions for compile/device validation, the small gate, and full `294`-vector WGSL/Core verification through the selected pipeline. No alternate size is performance-accepted until full `294`-vector WGSL/Core verification and valid synthetic profiling pass for that size.

## What Still Executes On CPU

- CPU reference hashing.
- CPU/GPU comparison and synthetic spot checks after GPU readback.
- Error reporting and mismatch display.
- Browser UI and timing.

There is no hidden CPU fallback inside `webgpu-whirlpool-minimal`. CPU code is used only to build reference rows, checkpoints, and mismatch reports after the GPU returns folded result words.

## Known Risks

- Generated WGSL with large constant arrays is expensive for browser pipeline compilation; the observed successful run still took about `31,112 ms` to create the pipeline.
- Passing fixed arrays through multiple WGSL functions may stress the shader compiler.
- Any endian mistake can create plausible but invalid hashes.
- `uint256` display order can hide byte-order mistakes.
- CPU/Core fixture verification now passes against generated Core vectors. WGSL/Core verification passed the full `294`-vector browser run for batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`.
- Optional batched WGSL dispatches pack multiple headers/tasks per dispatch. Batch size `64` reduced the full-vector verification from `294` dispatches to `5`.
- Timing diagnostics now separate the original cold batched pipeline compile time around `33,526.7 ms` from cached this-run pipeline status and this-run elapsed timing.
- The WGSL kernel is specialized to exactly 80-byte headers.
- Nonce overflow must remain rejected before dispatch; silent uint32 wrap would invalidate comparisons.
- Real performance timing remains preliminary until the synthetic control path is profiled and any optimization remains Core-vector verified.

## Next Steps Before Performance Work

1. Run `WGSL workgroup-size experiment` for workgroup size `32`, compile the selected variant, and complete the small `10 fixtures x 1 nonce` gate.
2. If that passes, run the explicit full `294`-vector verification action for workgroup size `32` and confirm the `whirlpool-batched-wg32` pipeline key.
3. Keep alternate workgroup sizes experimental until each passes full `294`-vector WGSL/Core verification.
4. Keep batching correctness-only and separate from benchmark or mining labels.
5. Keep synthetic benchmark output clearly separate from full-vector WGSL/Core verification.
5. Add optional debug readback for selected intermediate WGSL state if WGSL/Core comparison exposes a mismatch.
5. Add CI coverage for the Core vector comparison and Node tests.
6. Only after profiling identifies bottlenecks should correctness-preserving optimization experiments begin.
