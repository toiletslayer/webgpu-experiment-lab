# Roadmap

## Phase 1: Correctness

- Maintain CPU reference implementation.
- Keep deterministic and randomized tests green.
- Regenerate vectors from latest CapStash-Core.
- Add CI once repository permissions and runtime are confirmed.

## Phase 2: CPU/WASM Reference

- Add WASM implementation using the same vectors.
- Compare JavaScript CPU, WASM, and browser correctness outputs.
- Keep WASM strictly reference-oriented until verified.

## Phase 3: WebGPU Compute

- Prototype WGSL `u64` emulation.
- Port one-header Whirlpool path.
- Validate shader output against every vector.
- Benchmark only after correctness is exact.

## Phase 4: Benchmark UI

- Preserve clear Browser WebGPU Performance labels.
- Export benchmark JSON.
- Record browser, adapter, vendor, limits, and sample windows.

## Phase 5: Feasibility Research

- Document pool mining, Stratum, `getblocktemplate`, and `submitblock` feasibility.
- Do not implement those protocols without explicit instruction.
