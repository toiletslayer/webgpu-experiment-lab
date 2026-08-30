# Next Steps

1. Treat the exposed manual selected-subset presets as recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md): `1x1`, `1x2`, `1x4`, `3x1`, `3x2`, and `10x1` all passed with `0` mismatches.
2. Treat the full `294`-vector browser run as recorded: `294 / 294` selected matches, `0` mismatches.
3. Treat batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64` as recorded full-vector WGSL/Core correctness passes for the generated `294`-vector Core set.
4. Treat the completed controlled synthetic ladder as recorded: every row through `8,192` hashes at dispatch batch size `512` passed its correctness gate, `5 / 5` CPU spot checks, and `0` mismatches.
5. Treat the five repeated `8,192`/`512` runs as low-variation local browser observations only: mean about `74.36 kH/s` including overhead and about `117.4 kH/s` excluding pipeline and CPU spot-check time.
6. Keep synthetic benchmark output separate from WGSL/Core verification output.
7. Keep batching milestones correctness-first and label them separately from mining performance.
8. Preserve timing diagnostics that distinguish original cold compile time from this-run cached timing.
9. Treat the first matched WG1 vs WG32 comparison as recorded: `3` valid samples per size, strict pipeline identity, `0` correctness failures, and `host-side variability too high for a recommendation`.
10. Clarify any batch-size experiment as `hashes per dispatch`; workgroup size is now an explicit compile-time shader variant, and workgroup size `1` remains the verified reference.
11. Treat Variant B as the preferred profiling baseline only for the current verified browser/adapter/shader/fixture/`8,192`/`512` configuration.
12. Treat workgroup sizes `32`, `64`, `128`, and `256` as experimental until each passes full `294`-vector WGSL/Core verification, synthetic profiling validation, and matched current-session comparison against WG1. The performance profile action uses the real Variant B path with the selected workgroup pipeline override; zero-hash or zero-result telemetry is invalid. Performance is not accepted when observed variability exceeds the documented thresholds.
13. Recommended next milestone: reduce or isolate host-side CPU-validation variability in the workgroup comparison harness before making another workgroup-size recommendation attempt.
14. After the Milestone 15.5.1 render hotfix, re-run the matched WG1 vs WG32 browser comparison once to confirm the completed result no longer trips a formatter exception and does not revert to zero counters or compile-failed status.
15. Verify Milestone 15.6 Guided mode manually: choose `Matched WG1 vs WG32 Comparison`, click `Prepare WG1 and WG32`, run the matched comparison manually, confirm compact summary and matched sample counts, switch to Advanced, and confirm raw JSON, histories, diagnostics, and exports remain available.
16. Add optional one-nonce WGSL debug readback for selected intermediate state if any future WGSL/Core comparison exposes a mismatch.
17. Add CI for `npm test`, `npm run compare:core-vectors`, and `npm run doctor`.
18. Decide whether the WASM path should wrap SPHlib or use a separately auditable implementation.
19. Defer native comparison until synthetic browser runs are profiled and any optimization remains Core-vector verified.

Do not implement pool mining, Stratum, `getblocktemplate`, `submitblock`, wallet support, payout logic, live network submission, profitability claims, or native comparison before the browser synthetic benchmark path is profiled and correctness-preserving optimization targets are documented.
