# WebGPU Limitations

## Browser Sandbox

WebGPU runs inside browser security and privacy constraints. Pages cannot bypass adapter permissions, background throttling, process isolation, or GPU process validation.

## Adapter Limits

The app queries selected adapter limits, but limits vary by browser, OS, driver, and hardware. Adapter names may be redacted or normalized.

## Dispatch Overhead

Small dispatches are dominated by:

- JavaScript setup,
- command encoding,
- queue submission,
- synchronization,
- readback mapping.

Tiny nonce counts are useful for correctness but not for performance conclusions.

The UI separates cold total time from warm dispatch/readback/comparison timing. Do not use verified H/s including pipeline creation as a mining-performance number.

## Current Whirlpool Scope

`webgpu-whirlpool-minimal` is specialized to exactly 80-byte block headers. It is a correctness harness, not a general Whirlpool implementation and not a production miner.

Core vectors exist and CPU JavaScript matches them for `294 / 294` generated vectors. WGSL/Core verification has passed all selected-subset presets and the full `294`-vector browser run with `0` mismatches for batch size `1`. Batched full-vector WGSL/Core verification has also passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`.

Milestone 9 exposes selectable WGSL/Core verification presets: `1 fixture x 1 nonce`, `1 fixture x 2 nonces`, `1 fixture x 4 nonces`, `3 fixtures x 1 nonce`, `3 fixtures x 2 nonces`, and `10 fixtures x 1 nonce`. The UI reports shader size, shader generation time, shader module creation time, compute pipeline creation time, buffer setup time, dispatch time, readback time, CPU comparison time, timeout setting, validation errors, device-lost information, adapter/device limits, and first pipeline error details.

The earlier embedded-browser attempt failed before dispatch with `createComputePipelineAsync timed out after 15000 ms`. Later normal-browser runs on `nvidia / blackwell` passed all currently exposed selected WGSL/Core presets with `0` mismatches. The first cold run took about `31,112 ms` to create the pipeline; later warm/cache-hit runs reported much smaller pipeline times.

Manual browser runs are recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md). The current recorded full-vector result is correctness evidence and should not be treated as optimization evidence or mining performance. The recorded path uses `1` hash per dispatch.

Milestone 11 exposes a batched dispatch verification path for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`. This path packs multiple 80-byte headers and nonce tasks into storage buffers and returns one folded 256-bit hash per task. It is still correctness-only infrastructure. All exposed batch sizes through `64` are full-vector verified.

Manual runs showed a cold batched pipeline compile around `33,526.7 ms`, while later cached runs completed quickly. Milestone 12 separates the original cold compile observation from this-run cached pipeline status, this-run pipeline creation, dispatch/readback/comparison timing, and this-run total elapsed time. Treat the recorded H/s values as correctness-run telemetry, not optimized mining performance.

Milestone 13 adds a controlled synthetic nonce-batch benchmark mode. It is explicit and non-default. The mode runs an automatic WGSL correctness gate first, then hashes a synthetic sequential nonce range with the verified batched Whirlpool shader, reads every folded result back, and CPU spot-checks selected nonces. Current synthetic hash-count options are `256`, `512`, `1024`, `2048`, `4096`, and `8192`; current dispatch batch sizes are `64`, `128`, `256`, `512`, and `1024`.

Milestone 13.1 adds local result capture: copy JSON, download JSON, and in-memory session history. No telemetry is uploaded or transmitted by the app. Exported JSON intentionally includes boundary flags showing no live mining, target comparison, pool connection, block submission, wallet support, payout tracking, network submission, or remote telemetry upload.

Milestone 13.2 records the first synthetic browser pass: `256 / 256` hashes, batch size `64`, `4` dispatches, correctness gate passed, `5 / 5` CPU spot checks passed, `0` mismatches, no pipeline error. The single observed run reported about `10.8 kH/s` including overhead and about `14.1 kH/s` excluding pipeline and CPU spot-check time. Do not treat one run as stable performance.

Milestone 13.3 records the completed manual synthetic ladder through `8,192` hashes at dispatch batch size `512`. The final `8,192`/`512` configuration was repeated five times with all runs passing the correctness gate, `5 / 5` CPU spot checks, `0` mismatches, and no pipeline error. The repeated-run mean was about `74.36 kH/s` including browser overhead and about `117.4 kH/s` excluding pipeline and CPU spot-check time. These values are local browser observations and remain preliminary.

The phrase `dispatch batch size` means hashes/tasks submitted in one dispatch. It does not mean WGSL workgroup size. The verified reference batched Whirlpool shader uses `workgroup_size(1)`, so dispatch batch size `512` launches `512` workgroups/invocations. Milestone 15 adds experimental compile-time workgroup-size variants `32`, `64`, `128`, and `256`; Milestone 15.1 makes the full `294`-vector verification action executable for the selected pipeline key. These variants are not accepted performance paths until they pass their own full Core-vector verification and valid synthetic profiling.

Milestone 14 adds `Synthetic profiling run`, an explicit non-default profiling mode for the verified synthetic path. It reports browser-observed phase timing such as buffer allocation, queue submission, queue completion wait, readback/map wait, result decoding, and CPU validation. These timings are not GPU hardware counters and must not be interpreted as shader occupancy, instruction throughput, power, temperature, or native performance.

The profiling-only no-readback probe may estimate dispatch/queue timing after the correctness gate passes, but it sets `outputReadback: false`, `cpuSpotChecked: false`, `validHashBenchmark: false`, and `profilingOnly: true`. It is not a valid hash benchmark.

Milestone 14.1 recorded one local browser comparison: Variant A full readback took about `111.4 ms` for `8,192` hashes at batch size `512`, while the no-readback probe took about `69.6 ms`. The no-readback probe submitted WGSL work but returned `0` output results and did not CPU spot-check output, so it cannot establish hash correctness or valid H/s for that run.

Variant B now reduces browser synchronization points by encoding multiple logical dispatches into one command submission and one combined readback. It is still limited by WebGPU wall-clock observability: the page can report logical dispatch count, physical submission count, queue wait count, readback count, and browser-observed waits, but it cannot report GPU occupancy, shader instruction throughput, cache behavior, power, clock speed, or temperature.

Matched repeated profiling currently supports Variant B only as the preferred baseline for one verified configuration: Edge/Chrome on Windows, NVIDIA Blackwell, the current WGSL shader, the fixed synthetic fixture, `8,192` hashes, dispatch batch size `512`, and `workgroup_size(1)`. It must not be described as universally optimal. Variant A remains available for regression and compatibility comparison.

Workgroup-size experiments validate requested sizes against `maxComputeInvocationsPerWorkgroup` and `maxComputeWorkgroupSizeX`. Unsupported sizes are reported as unsupported by current WebGPU device limits; the app does not silently clamp to another workgroup size.

Executed full-vector verification accounting is separate from planned profiling accounting. For example, workgroup size `32` over the full `294` Core-vector set should report `10` workgroups, `320` launched invocations, `294` active invocations, and `26` padded inactive invocations. That is a correctness run, not a performance benchmark.

Use normal Chrome or Edge for manual verification. Embedded/in-app browsers may block localhost, hide adapter information, or restrict WebGPU. Run `npm run doctor` first to confirm Node.js, npm, required files, and Core vectors are present.

Nonce ranges that would wrap past `0xffffffff` are rejected before dispatch. Silent wraparound is not allowed because it would make the CPU/GPU comparison ambiguous.

## Background Throttling

Browsers may throttle background tabs, minimized windows, battery-powered devices, and long-running scripts. This project must measure under controlled foreground conditions.

## Memory Limits

Large nonce batches need storage buffers for inputs and outputs. WebGPU buffer size and binding limits vary by adapter.

## Native Miner Comparison

Native CUDA/OpenCL/Vulkan miners may outperform WebGPU because they can use:

- lower-level driver access,
- mature compiler optimizations,
- native 64-bit operations where available,
- lower readback overhead,
- persistent kernels or specialized scheduling.

This project should benchmark scientifically instead of assuming GPU superiority.

## Future Benchmark Plan

Real WGSL Whirlpool now matches independent CapStash Core-generated vectors for the documented fixture set. The controlled synthetic ladder has been completed:

- 256 hashes at dispatch batch size 64 - completed and passed once
- 512 hashes at dispatch batch size 64 - completed and passed once
- 1024 hashes at dispatch batch size 64 - completed and passed once
- 1024 hashes at dispatch batch size 128 - completed and passed once
- 2048 hashes at dispatch batch size 128 - completed and passed once
- 4096 hashes at dispatch batch size 256 - completed and passed once
- 8192 hashes at dispatch batch size 512 - completed and passed five times

Only after profiling should later benchmark milestones test larger counts or altered dispatch/workgroup shapes:

- 1K
- 4K
- 16K
- 64K
- 256K
- 1M

Future measurements should include:

- hashes/sec,
- dispatch overhead,
- buffer readback time,
- CPU time versus GPU time,
- performance plateau points,
- WebGPU versus CPU JavaScript,
- WebGPU versus WASM if available.
