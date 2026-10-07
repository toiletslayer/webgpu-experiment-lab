# Hardware Testing

The most useful outside contribution to this project right now is **hardware
diversity**.

The existing correctness work is heavily validated on NVIDIA/Windows. Results
from AMD, Intel, Apple, other NVIDIA architectures, different drivers, and
different current browsers help determine which observations are general and
which are machine-specific.

## What this test is

This is a local browser compute test.

It does **not**:

- connect to a mining pool;
- connect to a wallet;
- submit blocks;
- send CAP;
- run hidden/background mining.

GPU work starts only when the tester explicitly starts a verification or
profiling action.

## Easiest test

Open the deployed lab:

<https://webgpu-experiment-lab.pages.dev>

Use a current browser with WebGPU enabled.

Run the full Core-vector correctness verification.

The important result is:

```text
294 / 294
0 mismatches
```

A failure is useful evidence too. Do not retry repeatedly until it disappears;
record the first reproducible failure and the environment.

## What to record

Please record:

- operating system and version;
- browser and version;
- GPU/adapter name;
- GPU vendor;
- driver version when easily available;
- whether WebGPU was available normally or required an experimental flag;
- full Core-vector result;
- mismatch count;
- pipeline/device error text, if any;
- optional exported result JSON.

Do not include account credentials, wallet data, browser profiles, or unrelated
system logs.

## Optional performance test

Only after correctness passes, a tester may run the synthetic profiling or
workgroup comparison workflows.

Performance is secondary.

Browser timing can vary because of:

- browser scheduling;
- CPU validation time;
- driver behavior;
- thermal/power state;
- background system load.

A high-variance result is valid evidence. Do not turn a noisy result into a
claimed recommendation.

## Result template

```text
Result: PASS / FAIL / INCOMPLETE
OS:
Browser:
GPU:
Vendor:
Driver:
WebGPU available without special flag: yes / no

Core vectors:
  matched:
  total: 294
  mismatches:

Pipeline/device error:

Optional profiling:
  workflow:
  samples:
  mean throughput:
  variability/CV:
  recommendation produced by app: yes / no

Notes:
```

## Priority hardware

Especially useful environments include:

1. AMD Radeon on Windows or Linux;
2. Intel Arc / Intel integrated graphics;
3. Apple Silicon / Safari or another WebGPU-capable browser;
4. NVIDIA architecture other than the currently recorded Blackwell result;
5. Linux on any supported discrete GPU.

One clean correctness result from a new hardware/browser family is more useful
than many repeated performance runs on the already-tested machine.

## Pass meaning

A 294/294 pass means the tested browser/GPU stack produced outputs identical to
the committed CapStash Core vectors for this verification workload.

It does **not** prove profitable mining performance, universal browser support,
production mining safety, or compatibility with every driver version.
