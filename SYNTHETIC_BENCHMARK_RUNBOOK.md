# Synthetic Benchmark Runbook

This runbook covers `webgpu-synthetic-nonce-benchmark`, a controlled local browser research mode. It is not live mining, pool mining, Stratum, target comparison, block submission, wallet support, payout tracking, or profitability measurement.

The manual browser synthetic ladder has passed through `8,192` hashes at dispatch batch size `512`. The final `8,192`/`512` configuration was repeated five times with low observed variation. Do not treat these rows as live mining or stable cross-system performance.

## Preconditions

Run these from the repository first:

```bash
cmd /c npm run doctor
cmd /c npm test
cmd /c npm run compare:core-vectors
cmd /c npm run dev
```

Open `http://127.0.0.1:8080/` in normal Chrome or Edge. Embedded browsers may block WebGPU or local URLs.

## Required Sequence

Run in order and stop on the first failure:

| Step | Hashes | Batch | Status |
| ---: | ---: | ---: | --- |
| 1 | 256 | 64 | completed and passed |
| 2 | 512 | 64 | completed and passed |
| 3 | 1,024 | 64 | completed and passed |
| 4 | 1,024 | 128 | completed and passed |
| 5 | 2,048 | 128 | completed and passed |
| 6 | 4,096 | 256 | completed and passed |
| 7 | 8,192 | 512 | completed and passed five times |

For each row:

1. Select `Synthetic nonce benchmark`.
2. Select the hash count.
3. Select the dispatch batch size.
4. Click `Start Benchmark`.
5. Confirm the automatic correctness gate passed.
6. Confirm all CPU spot checks passed.
7. Confirm hashes completed equals hashes requested.
8. Confirm dispatch count equals `ceil(hash count / batch size)`.
9. Confirm no pipeline error.
10. Confirm no mismatch.
11. Click `Download benchmark result JSON`.
12. Keep the JSON file with the manual test notes.

## Recorded Ladder

Every completed ladder row recorded:

- correctness gate: passed
- CPU spot checks: `5 / 5` passed
- first mismatch: none
- pipeline error: none
- hashes completed: hashes requested
- dispatch count: `ceil(hash count / batch size)`

| Hashes | Batch | Dispatches | H/s including overhead | H/s excluding pipeline and CPU spot-check time |
| ---: | ---: | ---: | ---: | ---: |
| 256 | 64 | 4 | about `10.8 kH/s` | about `14.1 kH/s` |
| 512 | 64 | 8 | about `12.0 kH/s` | about `14.7 kH/s` |
| 1,024 | 64 | 16 | about `11.4 kH/s` | about `13.4 kH/s` |
| 1,024 | 128 | 8 | about `25.9 kH/s` | about `33.6 kH/s` |
| 2,048 | 128 | 16 | about `21.6 kH/s` | about `27.0 kH/s` |
| 4,096 | 256 | 16 | about `38.7 kH/s` | about `50.1 kH/s` |
| 8,192 | 512 | 16 | mean about `74.36 kH/s` across five runs | mean about `117.4 kH/s` across five runs |

For `256` hashes at batch size `64`, the first observed browser run also recorded:

- buffer setup: about `0.8 ms`
- dispatch: about `13.6 ms`
- readback: about `3.7 ms`
- CPU spot checks: about `2.9 ms`
- total elapsed: about `23.6 ms`
- observed H/s: about `10.8 kH/s` including overhead and about `14.1 kH/s` excluding pipeline and CPU spot-check time
- historical cold compile observation: about `26,462.9 ms`, did not apply to the cached current run
- exported JSON: saved

For the five repeated `8,192`/`512` runs:

- H/s including overhead: mean `74.36 kH/s`, median `74.7 kH/s`, min `72.1 kH/s`, max `75.3 kH/s`, coefficient of variation `1.76%`
- H/s excluding pipeline and CPU spot-check time: mean `117.4 kH/s`, median `117 kH/s`, min `113 kH/s`, max `121 kH/s`, coefficient of variation `2.73%`
- dispatch time: mean `58.94 ms`, median `58.1 ms`, min `57.9 ms`, max `61.6 ms`, coefficient of variation `2.62%`
- total elapsed: mean `110.18 ms`, median `109.7 ms`, min `108.8 ms`, max `113.6 ms`, coefficient of variation `1.79%`

Interpretation: the repeated `8,192`/`512` browser runs show low observed variation on the tested Windows/Edge/NVIDIA setup. They do not establish cross-browser stability, native performance, live mining viability, or profitability.

## Export Review

Each exported JSON must include:

- `resultType: "synthetic-browser-research"`
- browser user agent
- WebGPU vendor and adapter description when available
- fixture id/name and header hex
- start nonce and end nonce
- hashes requested/completed
- dispatch batch size and dispatch count
- correctness gate status
- CPU spot-check counts
- timing fields
- separate synthetic benchmark diagnostics and automatic correctness-gate diagnostics
- WGSL workgroup size and workgroups launched per representative dispatch
- explicit boundary flags showing no live mining, target comparison, pool connection, block submission, wallet support, payout tracking, network submission, or remote telemetry upload

## Repeated-Run Export Review

When multiple compatible runs are collected in one browser session, click `Download repeated-run summary JSON`. The summary groups only compatible runs with the same mode, fixture, hash count, dispatch batch size, correctness-gate preset, adapter description, pipeline key, algorithm id, and WGSL workgroup size.

The repeated-run summary must exclude invalid telemetry from performance statistics, count invalid compatible runs separately, and preserve boundary flags showing no live mining, target comparison, pool connection, block submission, wallet support, payout tracking, network submission, or remote telemetry upload.

Do not edit exported JSON to make a failed run appear valid.

## Profiling Runbook

Milestone 14 adds `Synthetic profiling run`, a separate mode for browser-observed timing of the verified synthetic path.

Completed manual profiling comparison:

- `Variant A - current per-dispatch readback`: `8,192 / 8,192` hashes, batch `512`, `16` logical dispatches, `16` physical submissions, `16` queue waits, `16` readbacks, correctness gate passed, CPU spot checks passed, zero mismatches, no pipeline error, about `111.4 ms` total and about `73.9 kH/s`.
- `Dispatch timing probe - no output readback`: same hash count and batch size, correctness gate passed, `16` logical dispatches, `16` physical submissions, `16` queue waits, `0` readbacks, output correctness not established by this run, about `69.6 ms` total and about `118 kH/s` timing rate.

The no-readback probe is diagnostic-only. It must report `outputReadback: false`, `cpuSpotChecked: false`, `validHashBenchmark: false`, and `profilingOnly: true`.

Variant B repeated profiling is now the recommended baseline for the tested configuration. The comparison panel should count internal repetition samples, not only top-level session rows. The recorded evidence is `3` valid Variant A samples and `3` valid Variant B samples.

Recommended baseline profiling run:

1. Select `Synthetic profiling run`.
2. Select `8,192 hashes / batch 512`.
3. Keep the default `Variant B - multiple dispatches, one submission, one readback`.
4. Select `3` repetitions.
5. Click `Start Benchmark`.
6. Confirm the automatic correctness gate passed.
7. Confirm `8,192 / 8,192` hashes completed.
8. Confirm `16` logical dispatches.
9. Confirm `1` physical queue submission.
10. Confirm `1` queue wait.
11. Confirm `1` combined readback.
12. Confirm CPU spot checks passed.
13. Confirm zero mismatches.
14. Confirm no pipeline error.
15. Confirm deterministic output order and valid telemetry.
16. Download profiling result JSON.
17. Download profiling summary JSON.

The expected comparison panel status after compatible Variant A and Variant B summaries are present:

- Variant A samples: `3`
- Variant B samples: `3`
- repeatability-backed recommendation available: yes
- recommendation: Variant B preferred for this browser, adapter, shader, fixture, `8,192`-hash workload, and batch size `512`

Do not generalize that recommendation to other browsers, GPUs, hash counts, workgroup sizes, or future shader variants without repeating the same correctness-gated comparison.

Workgroup-size experiments are tracked separately in [WORKGROUP_EXPERIMENT_RUNBOOK.md](./WORKGROUP_EXPERIMENT_RUNBOOK.md). Do not mix workgroup-size experiment results into synthetic profiling recommendations until the selected workgroup size has passed full `294`-vector WGSL/Core verification.
