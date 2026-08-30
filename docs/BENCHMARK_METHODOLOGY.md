# Benchmark Methodology

## Current Measurement

The current benchmark measures the browser JavaScript CPU reference path while collecting WebGPU capability information. It is displayed under Browser WebGPU Performance because the research target is WebGPU, but the UI states that the current hash path is the correctness-checked JavaScript reference.

## Metrics

- Warm-up duration and hashes.
- Average H/s over measured time.
- Peak H/s from sample windows.
- Minimum H/s from sample windows.
- Total hashes completed.
- Measured elapsed time.
- Browser version.
- WebGPU adapter, vendor, features, and selected device limits.

## Native Estimate Formula

Native estimates are ranges, not measurements:

- Browser efficiency low: 27%
- Browser efficiency high: 60%
- Estimated native low: `browser_hashes_per_second / 0.60`
- Estimated native high: `browser_hashes_per_second / 0.27`

These assumptions must be replaced with measured CUDA/OpenCL/Vulkan/CPU baselines when available.
