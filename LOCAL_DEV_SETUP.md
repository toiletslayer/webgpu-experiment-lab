# Local Development Setup

This guide is for running `caps-webgpu` locally on Windows.

Use a normal Chrome or Edge browser for WebGPU verification. Embedded or in-app browsers may block local pages, hide adapter details, or disable WebGPU features.

## Install Node.js LTS

1. Download Node.js LTS from `https://nodejs.org/`.
2. Run the installer.
3. Keep the option that adds Node.js to `PATH` enabled.
4. Close every open PowerShell window.
5. Open a new PowerShell window.

Verify:

```powershell
node --version
npm --version
```

If either command says it is not recognized, Node.js is not on your current `PATH`. Close and reopen PowerShell first. If that does not help, rerun the Node.js installer and confirm the `PATH` option is enabled.

If PowerShell says `npm.ps1 cannot be loaded because running scripts is disabled`, use the command shim directly:

```powershell
npm.cmd --version
npm.cmd install
npm.cmd test
npm.cmd run dev
```

You can also run project scripts directly with `node`, for example `node --test tests/run-tests.js`.

## Clone And Install

```powershell
git clone https://github.com/toiletslayer/caps-webgpu.git
cd caps-webgpu
npm install
```

This project currently has no heavy runtime dependency stack, but `npm install` is still the normal setup command and prepares the project if package metadata changes later.

## Run The Environment Check

```powershell
npm run doctor
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run doctor
```

The doctor command reports:

- Node.js version
- npm availability/version
- operating system
- required project files
- Core vector JSON presence
- dependency state
- next commands to run

## Run Tests

```powershell
npm test
npm run compare:core-vectors
```

PowerShell execution-policy alternative:

```powershell
npm.cmd test
npm.cmd run compare:core-vectors
```

Expected current status:

- Core vectors loaded: `294`
- Core vs CPU JavaScript: `294 / 294` matches
- Node tests: passing

## Start The Local App

```powershell
npm run dev
```

The bundled server binds only to `127.0.0.1`, rejects traversal and dotfiles,
and is intended only for local development. **This server is for localhost
development only and must not be exposed as the public deployment server.**

PowerShell execution-policy alternative:

```powershell
npm.cmd run dev
```

Open the printed local URL in normal Chrome or Edge, usually:

```text
http://127.0.0.1:8080/
```

Do not use an embedded Codex browser for final WebGPU verification. The embedded browser can block local URLs or restrict WebGPU behavior.

## Browser WebGPU Verification

In Chrome or Edge:

1. Open the local app URL.
2. Confirm `WebGPU Supported` is `Yes`.
3. Confirm `Core Vector Status` is `CapStash Core vectors: generated`.
4. Confirm `CPU Reference Against Core` is `294 matches / 0 mismatches`.
5. Select `WebGPU Whirlpool minimal`.
6. Leave `WGSL batch size` at `1` for the known-good single-dispatch-per-hash verification path.
7. Click `Start Benchmark`.
8. Confirm the default subset is `1 fixture x 1 nonce`.
9. Confirm `WGSL Against Core` reports `WGSL/Core verification: Passed selected subset`.
10. Confirm selected matches are `1 / 1` with `0` mismatches.
11. Record shader size, pipeline creation time, adapter/vendor, dispatch count, hashes per dispatch, and first error details if any.

Observed normal-browser result for the first subset:

- Adapter: `nvidia / blackwell`
- Core vectors loaded: `294`
- CPU/Core: `294 matches / 0 mismatches`
- WGSL/Core: `1 / 1 selected matches`, `0 mismatches`
- Shader size: `13,763 bytes / 13,763 code units`
- Pipeline creation: about `31,112 ms`
- Cold total time: about `31.29 s`

Expanded selected-preset runs through `10 fixtures x 1 nonce` and the full `294`-vector run are recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md).

Use the UI preset selector in this order for manual selected-subset checks:

1. `1 fixture x 1 nonce`
2. `1 fixture x 2 nonces`
3. `1 fixture x 4 nonces`
4. `3 fixtures x 1 nonce`
5. `3 fixtures x 2 nonces`
6. `10 fixtures x 1 nonce`
7. `Full 294 Core vectors` - manual full-vector correctness run, not default

Do not treat WebGPU as verified for all Core vectors until the UI says `WGSL/Core verification: Full 294-vector pass`. Do not treat cold verified H/s including pipeline creation as mining performance.

The full `294`-vector verification mode must be selected manually. Do not run all Core vectors by default.

## Batched WGSL Verification

Batch size `1` is the recorded full-vector verified path. Batch sizes `2`, `4`, `8`, `16`, `32`, and `64` have also passed full-vector WGSL/Core verification in normal Edge/Chrome on Windows with `0` mismatches.

Previously recorded batched sequence:

1. `10 fixtures x 1 nonce` passed for batch sizes `2`, `4`, and `8`.
2. `Full 294 Core vectors` passed for batch sizes `2`, `4`, `8`, `16`, `32`, and `64`.
3. Batch size `64` returned `294 / 294` matches with `0` mismatches using `5` dispatches.
4. Timing diagnostics preserved the original cold batched compile display around `33,526.7 ms`, so do not treat that stale compile value as this-run hashing time.
5. Milestone 12 separates that original cold compile observation from `This Run Pipeline`, `This Run Pipeline Creation`, and `This Run Total Elapsed`.

Do not treat the verified batch-size ladder as optimized mining performance; these are correctness-preserving verification runs.

## Synthetic Benchmark Export

Manual synthetic browser telemetry is pending. When running it later, follow [SYNTHETIC_BENCHMARK_RUNBOOK.md](./SYNTHETIC_BENCHMARK_RUNBOOK.md).

The first synthetic run has been recorded as passed. The next run should be:

- execution mode: `Synthetic nonce benchmark`
- hash count: `512`
- dispatch batch size: `64`

After it completes, use `Download benchmark result JSON`. The file should confirm:

- correctness gate passed
- hashes completed: `512 / 512`
- dispatch count: `8`
- CPU spot checks passed
- first mismatch: none
- pipeline error: none
- boundary flags such as `liveMining: false`, `targetComparison: false`, `poolConnection: false`, and `blockSubmission: false`

The app stores synthetic session history only in memory and does not upload telemetry.

## WebGPU Browser Troubleshooting

If WebGPU is unavailable:

- Use current Chrome or Edge.
- Make sure hardware acceleration is enabled.
- Avoid remote desktop sessions if they hide the GPU adapter.
- Try `chrome://gpu` or `edge://gpu` and check whether WebGPU is enabled.
- Update GPU drivers.
- Try another browser profile with fewer extensions.

If pipeline creation fails:

- Copy the `Pipeline Diagnostics` panel.
- Record `WGSL Shader Size`, `This Run Pipeline Creation`, `Original Cold Compile Observed`, `Pipeline Timeout Setting`, adapter/vendor, and `Pipeline Error`.
- Do not increase the timeout and call the issue fixed unless the diagnostics show the browser eventually succeeds reliably.

## PATH Troubleshooting

If PowerShell cannot find `node` or `npm`:

1. Close and reopen PowerShell.
2. Run:

```powershell
where.exe node
where.exe npm
```

3. If nothing is found, reinstall Node.js LTS and enable the `PATH` option.
4. If commands work in a new PowerShell but not an old one, the old window has stale environment variables.

If `npm --version` fails only because `npm.ps1` is blocked, `npm.cmd --version` is enough for this project. You do not need to change system execution policy just to run these commands.

## Current Verification Boundary

The CPU JavaScript reference is Core-vector verified against generated CapStash Core vectors.

WGSL/Core verification has passed the generated full `294`-vector fixture set in the documented browser run for batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`. Do not claim production mining performance, optimized performance, or full browser miner readiness from the current correctness harness.

After the timing diagnostics update, rerun `Full 294 Core vectors` at batch size `16` and confirm cached runs clearly show the original cold compile time separately from this-run dispatch and total elapsed timing.
