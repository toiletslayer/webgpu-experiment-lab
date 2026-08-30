# AGENTS.md — caps-webgpu engineering instructions

## Mission

`caps-webgpu` is a correctness-first research project for executing CapStash Proof-of-Work in modern browsers through WebGPU.

The project has already answered the basic feasibility question: the current WGSL Whirlpool path can reproduce CapStash Core PoW hashes. The next phase is to turn the verified hashing laboratory into a correctness-preserving, measurable GPU nonce-search engine without overstating browser performance or weakening consensus verification.

Do not treat this repository as a generic benchmark demo. Hash correctness is consensus-critical.

## Read these first

Before making changes, read:

1. `README.md`
2. `ARCHITECTURE.md`
3. `CONSENSUS_VERIFICATION.md`
4. `NEXT_STEPS.md`
5. `WEBGPU_OPTIMIZATION_PLAN.md`
6. `BROWSER_VERIFICATION_RESULTS.md`
7. `WORKGROUP_EXPERIMENT_RUNBOOK.md` when modifying workgroup experiments

## Consensus invariants

These must not change accidentally:

- CapStash mining headers are exactly 80 bytes.
- Header fields are serialized exactly as documented in `CONSENSUS_VERIFICATION.md`.
- CapStash uses plain WHIRLPOOL-512.
- The 64-byte Whirlpool digest is folded to 32 bytes with `out[i] = digest[i] ^ digest[i + 32]` for `i = 0..31`.
- Internal `uint256` byte order and Core display-hex byte order are different; preserve the documented reversal rules.
- The generated Core-vector set is external truth for browser/JavaScript verification, not merely another copy of the browser implementation.
- A performance optimization is invalid until it remains byte-identical to the Core reference vectors.

The current Core vector provenance is documented against CapStash Core commit `d5443789469376ca3cad2a892ab99978b88a4471`. If updating Core provenance, regenerate vectors intentionally and document the new exact Core commit.

## Current verified state

At the time this file was added:

- Core vs CPU JavaScript passes `294 / 294` generated vectors.
- Browser WGSL vs Core has recorded a full `294 / 294` pass with `0` mismatches.
- Batched WGSL/Core verification has recorded full-vector passes for exposed batch sizes `1`, `2`, `4`, `8`, `16`, `32`, and `64`.
- Synthetic nonce benchmarking and profiling exist and are correctness-gated.
- Variant B (multiple logical dispatches with a single submission/wait/readback) is the preferred profiling baseline for the currently documented tested configuration.
- Workgroup-size experimentation exists, but performance recommendations must remain conservative when host-side variability exceeds documented thresholds.
- This is still not a live miner: no Stratum, `getblocktemplate`, `submitblock`, wallet, payout, or live-network mining path is implemented.

Verify these statements against the current repository before relying on them; later commits may supersede them.

## Mandatory validation before claiming success

For ordinary JavaScript/WGSL changes, run at minimum:

```bash
npm run doctor
npm test
npm run compare:core-vectors
```

For WebGPU arithmetic, dispatch, buffer-layout, workgroup, batching, or nonce-mapping changes, automated Node tests are necessary but not sufficient. Preserve or extend the browser verification workflow and require normal Chrome/Edge WebGPU verification against the Core vectors.

Never report a performance result as valid if:

- correctness gate failed,
- Core/CPU/WGSL mismatches occurred,
- expected hashes/results are zero,
- dispatch/readback telemetry is internally inconsistent,
- pipeline identity is ambiguous,
- nonce overflow/wrap was accepted unintentionally,
- or the run is a no-readback profiling probe rather than a verified benchmark.

## Performance rules

Correctness comes before speed, but the project is now mature enough that optimization work should target the actual GPU path rather than endlessly polishing host-side benchmark UI.

Prefer work that answers one of these questions:

1. How much time is really spent on GPU execution versus JavaScript validation/readback?
2. Which WGSL Whirlpool arithmetic/table strategy is fastest while remaining Core-identical?
3. Which workgroup size is genuinely better after host-side validation noise is isolated?
4. Can target comparison be moved onto the GPU so a future miner returns only candidate nonces instead of reading every 256-bit hash back to JavaScript?
5. What is the stable throughput ceiling across NVIDIA, AMD, and Intel implementations?

Keep cold pipeline compilation, cached pipeline creation, command encoding, queue wait, readback, CPU validation, and end-to-end time separate whenever possible.

Do not compare browser synthetic H/s directly with native CUDA/OpenCL/Vulkan miner H/s unless the workload and measurement boundaries are clearly documented.

## Recommended near-term order

Unless repository state has changed materially, prefer this sequence:

1. Keep CI green for `doctor`, unit tests, and Core-vector comparison.
2. Reduce or isolate host-side CPU-validation variability from GPU timing measurements.
3. Add GPU timing/query instrumentation where WebGPU/browser support permits, with a safe fallback when unavailable.
4. Begin systematic correctness-preserving WGSL Whirlpool optimization.
5. Add GPU-side target comparison as a separate, vector-tested/search-tested milestone.
6. Design a narrow work-provider/result-submission boundary for future live mining.
7. Only then add Stratum or Core RPC integration.

WASM remains useful as an additional auditable reference/fallback path, but it should not block investigation of the already verified WebGPU kernel unless a change specifically needs an independent browser-side reference.

## Security boundaries

The current project has a deliberately small attack surface. Preserve that property.

A future browser hashing engine should not need:

- wallet private keys,
- wallet RPC credentials,
- unrestricted node RPC credentials,
- exchange credentials,
- arbitrary remote script execution,
- or payout custody logic.

Prefer a narrow architecture:

`work provider -> validated mining job -> GPU nonce search -> candidate nonce/hash -> CPU/Core verification -> submission adapter`

If a future local bridge is added for Stratum or Core RPC, keep it small, localhost-bound by default, least-privileged, and separate from the hashing UI.

Treat pool/job data as untrusted input. Validate sizes, numeric ranges, nonce ranges, difficulty/target representation, and buffer allocations before GPU dispatch.

## Development-server note

`scripts/dev-server.js` is a localhost development helper, not a production web server. Do not expose it directly to the public internet or silently turn it into a production deployment path. If modifying path containment, use path-aware containment (`path.relative` or equivalent) rather than a raw textual prefix check.

## Change discipline for optimization work

For each meaningful kernel optimization:

1. State the hypothesis.
2. Keep the previous verified path available when practical.
3. Add or update tests before accepting the optimization.
4. Pass Core-vector verification.
5. Run matched browser measurements with the same adapter/browser/workload.
6. Record raw timing and configuration data.
7. Reject the optimization if correctness regresses, even if it is faster.
8. Document whether the result is a local observation or a broadly reproduced result.

Do not rewrite working consensus code for style alone during performance work.

## What not to do

Do not:

- fabricate Core vectors,
- weaken mismatch failures to make tests pass,
- silently skip overflow cases,
- label plumbing/fake shader output as GPU hashing,
- call synthetic throughput live mining performance,
- add wallet/payout functionality as a shortcut to demonstrating live mining,
- introduce large dependency trees without a concrete need,
- or optimize away independent correctness checks before an equivalent safety mechanism exists.

## Completion standard for future Codex sessions

At the end of a session, leave the repository easier for the next engineer to reason about. Summarize:

- what changed,
- what was measured,
- exact validation performed,
- whether Core-vector equivalence still holds,
- unresolved blockers,
- and the single most useful next experiment.

If browser-only validation is still required, say so explicitly rather than claiming the task is fully verified.