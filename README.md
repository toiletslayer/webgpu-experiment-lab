# CapStash Proof-of-Work Verification & WebGPU Lab

A correctness-first browser laboratory for verifying and profiling CapStash
Proof-of-Work hashing through WebGPU, with shared WebMCP tools for human-agent
workflows.

> **Safety and scope:** This project uses CapStash Proof-of-Work and Whirlpool
> hashing as a deterministic real-world WebGPU compute workload. All computation is local and explicitly user-triggered. It does not connect to a
> blockchain network, pool, wallet, payout system, RPC service, or
> block-submission service.

This is not a production miner. It does not perform target comparison, find or
submit blocks, hold keys, calculate payouts, or run automatic/background
computation. Correctness gates remain authoritative over every profiling result
or recommendation.

## What the project demonstrates

- Exact construction of CapStash's 80-byte mining header.
- Plain WHIRLPOOL-512 followed by CapStash's 512-to-256-bit XOR fold.
- A browser-compatible JavaScript reference implementation.
- A WGSL/WebGPU implementation that matches 294 deterministic CapStash Core
  vectors.
- Correctness-gated synthetic profiling and workgroup-size experiments.
- A conservative matched WG1-vs-WG32 comparison that can refuse to recommend a
  winner when timing variability is too high.
- WebMCP tools that call the same application actions and share the same visible
  state as the human interface.

## OpenAI WebMCP Challenge

The challenge work is an agent-facing extension to an existing WebGPU research
application. It does not replace the verification engine or duplicate its
consensus-sensitive logic.

Authoritative private development milestones are documented in
[PROVENANCE.md](./PROVENANCE.md). The full tool schemas, lifecycle, safety
boundaries, and browser validation are in
[WEBMCP_CHALLENGE.md](./WEBMCP_CHALLENGE.md).

### What existed before the challenge

- CPU reference implementation.
- WGSL/WebGPU correctness implementation.
- Deterministic CapStash Core vectors and comparison tooling.
- Synthetic benchmark and profiling engine.
- Workgroup experiments and matched WG1-vs-WG32 comparison.
- Statistics and conservative recommendation policy.
- Guided and Advanced human UI, diagnostics, and local exports.

### What WebMCP added during the challenge

- Optional `document.modelContext.registerTool()` registration.
- Structured environment inspection.
- Structured correctness invocation and status.
- Shared human-agent experiment state.
- Asynchronous, prerequisite-aware workgroup orchestration.
- Machine-readable recommendation blockers.
- WebMCP-specific tests, documentation, and a visible consent boundary for the
  longer agent-triggered comparison.

### WebMCP tools

| Tool | User goal | Starts computation? |
| --- | --- | --- |
| `inspect_compute_environment` | Inspect WebGPU/browser support and available workflows. | No |
| `verify_correctness` | Run the minimal 1-vector or full 294-vector existing verification. | Yes, explicitly |
| `start_workgroup_comparison` | After visible approval, orchestrate the existing correctness-gated WG1-vs-WG32 comparison. | Yes, explicitly |
| `get_experiment_status` | Read current/most recent shared state and structured evidence. | No |

Example user goal:

> Determine whether WG32 is meaningfully better than WG1 on this GPU. Verify
> both configurations first, run a matched comparison, and recommend a winner
> only if the evidence supports one.

## Architecture

```text
Human control or WebMCP tool
  -> shared UI application action/state
  -> CPU/Core correctness gates
  -> existing WGSL/WebGPU verification or profiling engine
  -> shared visible result and compact agent status
```

There is no second WebMCP-specific hash implementation. The main modules are:

- `src/cpu/`: header serialization, Whirlpool reference, and correctness tests.
- `src/webgpu/`: capability inspection, WGSL verification, profiling, and
  workgroup experiments.
- `src/ui/app.js`: shared state, human controls, consent, and WebMCP adapters.
- `src/webmcp/challenge-tools.js`: narrow schemas and structured response
  builders; it contains no WebGPU engine.
- `vectors/capstash-core-pow-vectors.json`: 294 generated reference vectors.

See [ARCHITECTURE.md](./ARCHITECTURE.md),
[CONSENSUS_VERIFICATION.md](./CONSENSUS_VERIFICATION.md), and
[EXECUTION_PATH.md](./EXECUTION_PATH.md) for the detailed technical record.

## Quick start

Requirements: Node.js 20 or newer, npm, and a normal current Chrome/Edge browser
with WebGPU available.

```powershell
npm run doctor
npm test
npm run compare:core-vectors
npm run dev
```

Open <http://127.0.0.1:8080/>.

The repository has no npm runtime or development dependencies, so package
installation is not required for the committed workflows.

`scripts/dev-server.js` binds only to `127.0.0.1` and denies traversal,
dotfiles, and repository metadata. **It is for localhost development only and
must not be exposed as the public deployment server.**

## Browser and WebMCP requirements

WebGPU requires a compatible browser, GPU/driver, and secure context.
`http://127.0.0.1` is suitable for local browser development.

WebMCP is an experimental progressive enhancement. For local Chrome testing:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Enable the flag and relaunch Chrome.
3. Open the local application directly.
4. Use Chrome's Model Context Tool Inspector or a compatible browser agent.

Browsers without `document.modelContext` keep the full ordinary UI and start no
extra work. A future public hostname will need its exact WebMCP origin-trial
registration while the trial remains required; see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Consent and computation boundaries

- Loading the page runs deterministic CPU correctness checks and inspects the
  WebGPU environment; it does not dispatch a GPU workload.
- Inspection and status tools are read-only.
- Minimal/full verification starts only after a human control or explicit tool
  invocation.
- The longer WebMCP workgroup comparison returns `awaiting_consent`, then displays a page-level modal describing
  its six samples, 49,152 profiled hashes, local-only scope, and interruption
  limitation. Declining starts no prerequisite or profiling work.
- The ordinary human comparison controls remain explicit and visible.
- Already-submitted WebGPU dispatches cannot necessarily be interrupted, so the
  interface does not claim fake cancellation.

## Reproducibility and tests

```powershell
npm run doctor
npm test
npm run compare:core-vectors
```

The Node suite does not require GPU hardware. It covers serialization, known and
randomized vectors, CPU/Core matching, WGSL planning and error reporting,
profiling accounting, recommendation blockers, WebMCP schemas/state, consent
boundaries, harmless WebMCP absence, and localhost-server containment.

Current deterministic result:

- CapStash Core vs CPU JavaScript: `294 / 294`, zero mismatches.
- Recorded normal-browser WGSL vs Core: `294 / 294`, zero mismatches.
- Recorded batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`: full 294-vector
  passes.

Browser evidence remains a local observation, not a universal hardware claim.
See [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md),
[SYNTHETIC_BENCHMARK_RUNBOOK.md](./SYNTHETIC_BENCHMARK_RUNBOOK.md), and
[WORKGROUP_EXPERIMENT_RUNBOOK.md](./WORKGROUP_EXPERIMENT_RUNBOOK.md).

## Latest validated challenge observation

The completed WebMCP browser run reported:

- minimal verification: `1 / 1`, zero mismatches;
- full verification: `294 / 294`, zero mismatches;
- WG1 and WG32 full prerequisites: `294 / 294` each;
- three valid matched samples per size;
- 49,152 requested, completed, and returned profiled hashes;
- 30 CPU spot checks and zero correctness/pipeline/device/order failures;
- observed WG32 mean throughput difference: about `+2.21%`;
- observed WG32 total-time CV: about `13.32%`;
- observed WG32 throughput CV: about `13.87%`.

Because the two CV values exceeded the `10%` limits and the throughput difference
did not establish reliable evidence under the policy, the application correctly
returned `recommendationAllowed: false` and `recommendation: null`. This was one
browser/session observation.

## Known limitations

- WebGPU and WebMCP availability varies by browser, GPU, driver, flag, and trial
  status.
- Browser wall-clock timing is not a precise GPU hardware counter.
- Host-side CPU validation can dominate variability.
- Workgroup size 1 remains the verified reference; no universal WG32 performance
  claim is made.
- The WASM path and native CUDA/OpenCL/Vulkan comparison are not implemented.
- No live mining, networking, target comparison, wallets, payouts, telemetry, or
  analytics exist.

Further limits are documented in [WEBGPU_LIMITATIONS.md](./WEBGPU_LIMITATIONS.md)
and [docs/KNOWN_LIMITATIONS.md](./docs/KNOWN_LIMITATIONS.md).

## Static deployment preparation

The application is static. A root `_headers` file prepares security headers for
Cloudflare Pages without Workers or Functions. Nothing in this repository
deploys automatically, and no origin-trial token is committed. See
[DEPLOYMENT.md](./DEPLOYMENT.md).

## License and attribution

Project code is licensed under the [MIT License](./LICENSE):
`Copyright (c) 2026 Toiletslayer`.

CapStash Core vector provenance and the SPHlib-derived Whirlpool table/constant
notices are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). The exact
Core vector-generation procedure is in
[CORE_VECTOR_GENERATION.md](./CORE_VECTOR_GENERATION.md).

## Additional technical documentation

- [Architecture](./ARCHITECTURE.md)
- [Consensus verification](./CONSENSUS_VERIFICATION.md)
- [Execution path](./EXECUTION_PATH.md)
- [Browser verification results](./BROWSER_VERIFICATION_RESULTS.md)
- [WebGPU Whirlpool notes](./WEBGPU_WHIRLPOOL_NOTES.md)
- [Workgroup experiment runbook](./WORKGROUP_EXPERIMENT_RUNBOOK.md)
- [WebMCP challenge record](./WEBMCP_CHALLENGE.md)
- [Challenge provenance](./PROVENANCE.md)
- [Static deployment preparation](./DEPLOYMENT.md)
