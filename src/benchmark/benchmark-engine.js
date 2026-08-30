import { capstashPoWHashHex, hexToBytes, patchNonce } from "../cpu/capstash-pow.js";
import { CAPSTASH_POW_TEST_VECTORS } from "../vectors/consensus-vectors.js";

export const DURATION_MODES = Object.freeze({
  "10s": { label: "10 seconds", durationMs: 10_000 },
  "60s": { label: "60 seconds", durationMs: 60_000 },
  continuous: { label: "Continuous", durationMs: Infinity },
});

export const EXECUTION_MODES = Object.freeze({
  "cpu-js": {
    id: "cpu-js",
    label: "CPU JavaScript",
    hashingBackend: "CPU JavaScript",
    available: true,
    hashesOnGpu: false,
    hasComputeShader: false,
    hashesPerDispatch: 0,
    note: "Hashes are computed by the JavaScript CPU reference implementation on the browser main thread.",
  },
  wasm: {
    id: "wasm",
    label: "WASM",
    hashingBackend: "Not implemented (no hashing)",
    available: false,
    hashesOnGpu: false,
    hasComputeShader: false,
    hashesPerDispatch: 0,
    note: "WASM hashing is not implemented yet.",
  },
  "webgpu-detect-only": {
    id: "webgpu-detect-only",
    label: "WebGPU detected only",
    hashingBackend: "None (detection only)",
    available: true,
    hashesOnGpu: false,
    hasComputeShader: false,
    hashesPerDispatch: 0,
    note: "WebGPU is detected and adapter limits are read, but no hashes are computed in this mode.",
  },
  "webgpu-plumbing-only": {
    id: "webgpu-plumbing-only",
    label: "WebGPU plumbing only",
    hashingBackend: "Temporary fake shader (not CapStash hashing)",
    available: true,
    hashesOnGpu: false,
    hasComputeShader: true,
    hashesPerDispatch: 64,
    wgslShader: "temporary deterministic fake shader",
    note: "Stage A only: WebGPU runs a fake deterministic shader to prove buffers, nonce mapping, dispatch, and readback. This is not CapStash hashing.",
  },
  "webgpu-whirlpool-minimal": {
    id: "webgpu-whirlpool-minimal",
    label: "WebGPU Whirlpool minimal",
    hashingBackend: "Minimal real WGSL Whirlpool proof",
    available: true,
    hashesOnGpu: false,
    hasComputeShader: true,
    hashesPerDispatch: 1,
    wgslShader: "minimal specialized Whirlpool-512 shader for exactly one 80-byte header",
    note: "Correctness-only Stage B proof: WGSL computes Whirlpool-512 for deterministic 80-byte header fixtures and compares folded hashes against the project CPU reference.",
  },
  "webgpu-synthetic-nonce-benchmark": {
    id: "webgpu-synthetic-nonce-benchmark",
    label: "Controlled synthetic nonce-batch benchmark",
    hashingBackend: "WGSL Whirlpool synthetic nonce batches",
    available: true,
    hashesOnGpu: true,
    hasComputeShader: true,
    hashesPerDispatch: 64,
    wgslShader: "verified WGSL Whirlpool-512 batch shader with synthetic sequential nonces",
    note: "Correctness-gated local browser research mode. It hashes synthetic nonce ranges on the GPU and CPU spot-checks selected results. This is not live mining, pool mining, target comparison, wallet support, payout tracking, or optimized miner performance.",
  },
  "webgpu-synthetic-profiling": {
    id: "webgpu-synthetic-profiling",
    label: "Synthetic profiling run",
    hashingBackend: "WGSL Whirlpool synthetic profiling",
    available: true,
    hashesOnGpu: true,
    hasComputeShader: true,
    hashesPerDispatch: 512,
    wgslShader: "verified WGSL Whirlpool-512 batch shader with browser-observed phase profiling",
    note: "Correctness-gated profiling mode for the verified synthetic WGSL path. Timings are browser-observed wall-clock phases, not GPU hardware counters, native performance, live mining, or optimization results.",
  },
  "webgpu-workgroup-experiment": {
    id: "webgpu-workgroup-experiment",
    label: "WGSL workgroup-size experiment",
    hashingBackend: "Experimental WGSL Whirlpool workgroup-size variant",
    available: true,
    hashesOnGpu: true,
    hasComputeShader: true,
    hashesPerDispatch: 512,
    wgslShader: "compile-time workgroup-size variant of the verified WGSL Whirlpool batch shader",
    note: "Correctness-gated experiment mode. Alternate workgroup sizes are not performance-eligible until their own full 294-vector WGSL/Core verification and synthetic validation pass.",
  },
  "webgpu-compute-real": {
    id: "webgpu-compute-real",
    label: "WebGPU compute real",
    hashingBackend: "Not implemented (no real Whirlpool hashing)",
    available: false,
    hashesOnGpu: false,
    hasComputeShader: false,
    hashesPerDispatch: 0,
    wgslShader: null,
    note: "WebGPU detected, but hashing is not yet running on the GPU.",
  },
});

export function getExecutionMode(modeId) {
  return EXECUTION_MODES[modeId] || EXECUTION_MODES["cpu-js"];
}

// This gate is intentionally strict: selecting or detecting WebGPU is not proof
// that hashing is running on the GPU. Only enable a mode here after its backend
// actually computes CapStash PoW hashes and passes the CPU reference vectors.
export function canRunHashBenchmark(modeId) {
  const mode = getExecutionMode(modeId);
  return mode.available && mode.id === "cpu-js";
}

export function createBenchmarkState({ durationMode = "10s", executionMode = "cpu-js", warmupMs = 750 } = {}) {
  return {
    durationMode,
    executionMode,
    warmupMs,
    running: false,
    startTime: 0,
    measuredStartTime: 0,
    warmupHashes: 0,
    hashes: 0,
    hashWorkMs: 0,
    overheadMs: 0,
    samples: [],
    peakHashPerSecond: 0,
    minHashPerSecond: Infinity,
    lastSampleTime: 0,
    lastSampleHashes: 0,
    header: hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex),
  };
}

export function resetBenchmarkState(state, durationMode, executionMode = state.executionMode) {
  state.durationMode = durationMode;
  state.executionMode = executionMode;
  state.running = true;
  state.startTime = performance.now();
  state.measuredStartTime = 0;
  state.warmupHashes = 0;
  state.hashes = 0;
  state.hashWorkMs = 0;
  state.overheadMs = 0;
  state.samples = [];
  state.peakHashPerSecond = 0;
  state.minHashPerSecond = Infinity;
  state.lastSampleTime = 0;
  state.lastSampleHashes = 0;
  state.header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
}

export function runBenchmarkSlice(state, sliceMs = 18) {
  if (!canRunHashBenchmark(state.executionMode)) {
    return benchmarkSnapshot(state);
  }

  // Current milestone: this loop is CPU JavaScript. There is no WGSL shader
  // dispatch in this path, and no data is sent to the GPU for hashing.
  const sliceStart = performance.now();
  let localHashes = 0;

  while (performance.now() - sliceStart < sliceMs) {
    const totalNonce = (state.warmupHashes + state.hashes + localHashes) >>> 0;
    patchNonce(state.header, totalNonce);
    capstashPoWHashHex(state.header);
    localHashes += 1;
  }

  const now = performance.now();
  const hashWorkMs = now - sliceStart;
  if (now - state.startTime < state.warmupMs) {
    state.warmupHashes += localHashes;
    state.hashWorkMs += hashWorkMs;
    return benchmarkSnapshot(state, now);
  }

  if (state.measuredStartTime === 0) {
    state.measuredStartTime = now;
    state.lastSampleTime = now;
    state.lastSampleHashes = 0;
  }

  state.hashes += localHashes;
  state.hashWorkMs += hashWorkMs;
  state.overheadMs = Math.max(0, now - state.startTime - state.hashWorkMs);

  if (now - state.lastSampleTime >= 500) {
    const elapsed = now - state.lastSampleTime;
    const delta = state.hashes - state.lastSampleHashes;
    const rate = elapsed > 0 ? (delta * 1000) / elapsed : 0;
    state.samples.push({ elapsedMs: now - state.measuredStartTime, hashPerSecond: rate });
    state.peakHashPerSecond = Math.max(state.peakHashPerSecond, rate);
    state.minHashPerSecond = Math.min(state.minHashPerSecond, rate);
    state.lastSampleTime = now;
    state.lastSampleHashes = state.hashes;
  }

  return benchmarkSnapshot(state, now);
}

export function benchmarkSnapshot(state, now = performance.now()) {
  const measuredElapsedMs = state.measuredStartTime > 0 ? now - state.measuredStartTime : 0;
  const averageHashPerSecond = measuredElapsedMs > 0 ? (state.hashes * 1000) / measuredElapsedMs : 0;
  const totalRuntimeMs = Math.max(0, now - state.startTime);
  const hashWorkPercent = totalRuntimeMs > 0 ? (state.hashWorkMs / totalRuntimeMs) * 100 : 0;
  const overheadPercent = totalRuntimeMs > 0 ? (state.overheadMs / totalRuntimeMs) * 100 : 0;
  const execution = getExecutionMode(state.executionMode);
  return {
    durationMode: state.durationMode,
    executionMode: state.executionMode,
    execution,
    running: state.running,
    warmupMs: Math.min(Math.max(now - state.startTime, 0), state.warmupMs),
    warmupHashes: state.warmupHashes,
    hashes: state.hashes,
    hashWorkMs: state.hashWorkMs,
    overheadMs: state.overheadMs,
    hashWorkPercent,
    overheadPercent,
    elapsedMs: measuredElapsedMs,
    averageHashPerSecond,
    peakHashPerSecond: state.peakHashPerSecond,
    minHashPerSecond: Number.isFinite(state.minHashPerSecond) ? state.minHashPerSecond : 0,
    samples: state.samples.slice(),
    hashesOnGpu: execution.hashesOnGpu,
    hasComputeShader: execution.hasComputeShader,
    hashesPerDispatch: execution.hashesPerDispatch,
    complete: measuredElapsedMs >= DURATION_MODES[state.durationMode].durationMs,
  };
}

export function estimateNativeRange(browserHashPerSecond) {
  if (!Number.isFinite(browserHashPerSecond) || browserHashPerSecond <= 0) {
    return { nativeLow: 0, nativeHigh: 0, efficiencyLow: 0.27, efficiencyHigh: 0.6 };
  }
  const efficiencyLow = 0.27;
  const efficiencyHigh = 0.6;
  return {
    nativeLow: browserHashPerSecond / efficiencyHigh,
    nativeHigh: browserHashPerSecond / efficiencyLow,
    efficiencyLow,
    efficiencyHigh,
  };
}
