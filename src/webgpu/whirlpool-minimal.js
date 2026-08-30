import { bytesToHex, capstashPoWInternalHex, hexToBytes, patchNonce } from "../cpu/capstash-pow.js";
import { whirlpool512, xorFold512To256 } from "../cpu/whirlpool.js";
import { CAPSTASH_POW_TEST_VECTORS } from "../vectors/consensus-vectors.js";
import { PLAIN_RC, PLAIN_T0 } from "../cpu/whirlpool-tables.js";
import { headerBytesToWords, wordsToInternalHashHex } from "./plumbing-proof.js";

export const WGSL_WORKGROUP_SIZE = 1;
export const WORKGROUP_SIZE_OPTIONS = Object.freeze([1, 32, 64, 128, 256]);
export const WEBGPU_PIPELINE_TIMEOUT_MS = 60_000;
const WEBGPU_OPERATION_TIMEOUT_MS = 15_000;
export const MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT = 16;
export const MAX_WHIRLPOOL_BATCH_TASKS = 1024;
export const MAX_UINT32 = 0xffffffff;

let cachedContext = null;
const cachedBatchContexts = new Map();

export function normalizeWorkgroupSize(workgroupSize = WGSL_WORKGROUP_SIZE) {
  const parsed = Number.parseInt(workgroupSize, 10);
  if (!WORKGROUP_SIZE_OPTIONS.includes(parsed)) {
    throw new Error(`unsupported WGSL workgroup size ${workgroupSize}; allowed sizes are ${WORKGROUP_SIZE_OPTIONS.join(", ")}`);
  }
  return parsed;
}

export function whirlpoolPipelineKey(workgroupSize = WGSL_WORKGROUP_SIZE) {
  return `whirlpool-batched-wg${normalizeWorkgroupSize(workgroupSize)}`;
}

export function validateWebGPUWorkgroupSize(workgroupSize = WGSL_WORKGROUP_SIZE, deviceLimits = {}) {
  const selected = Number.parseInt(workgroupSize, 10);
  if (!WORKGROUP_SIZE_OPTIONS.includes(selected)) {
    return {
      valid: false,
      workgroupSize: Number.isFinite(selected) ? selected : null,
      maxComputeInvocationsPerWorkgroup: null,
      maxComputeWorkgroupSizeX: null,
      reason: `unsupported WGSL workgroup size ${workgroupSize}; allowed sizes are ${WORKGROUP_SIZE_OPTIONS.join(", ")}`,
    };
  }
  const maxInvocations = deviceLimits?.maxComputeInvocationsPerWorkgroup;
  const maxSizeX = deviceLimits?.maxComputeWorkgroupSizeX;
  const invocationOk = !Number.isFinite(maxInvocations) || selected <= maxInvocations;
  const sizeXOk = !Number.isFinite(maxSizeX) || selected <= maxSizeX;
  return {
    valid: invocationOk && sizeXOk,
    workgroupSize: selected,
    maxComputeInvocationsPerWorkgroup: Number.isFinite(maxInvocations) ? maxInvocations : null,
    maxComputeWorkgroupSizeX: Number.isFinite(maxSizeX) ? maxSizeX : null,
    reason: invocationOk && sizeXOk ? null : "Unsupported by current WebGPU device limits",
  };
}

export function workgroupInvocationPlan(hashesSubmitted, workgroupSize = WGSL_WORKGROUP_SIZE) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  if (!Number.isInteger(hashesSubmitted) || hashesSubmitted <= 0) {
    throw new Error(`hashesSubmitted must be a positive integer, got ${hashesSubmitted}`);
  }
  const workgroupCount = Math.ceil(hashesSubmitted / selected);
  const totalLaunchedInvocations = workgroupCount * selected;
  const paddedInactiveInvocations = totalLaunchedInvocations - hashesSubmitted;
  const remainder = hashesSubmitted % selected;
  return {
    wgslWorkgroupSize: selected,
    hashesSubmitted,
    workgroupCount,
    totalLaunchedInvocations,
    activeInvocations: hashesSubmitted,
    paddedInactiveInvocations,
    partialFinalWorkgroupInvocations: remainder === 0 ? selected : remainder,
  };
}

function u64ToVec2(value) {
  const low = Number(value & 0xffffffffn) >>> 0;
  const high = Number((value >> 32n) & 0xffffffffn) >>> 0;
  return `vec2u(0x${low.toString(16)}u, 0x${high.toString(16)}u)`;
}

function buildTableSource() {
  const table = PLAIN_T0.map(u64ToVec2).join(",\n  ");
  const rc = PLAIN_RC.map(u64ToVec2).join(",\n  ");
  return `
const T0 = array<vec2u, 256>(
  ${table}
);

const RC = array<vec2u, 10>(
  ${rc}
);
  `;
}

function timeoutAfter(label, ms = WEBGPU_OPERATION_TIMEOUT_MS) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
}

function selectedLimits(limits) {
  if (!limits) return null;
  return {
    maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
    maxComputeWorkgroupSizeY: limits.maxComputeWorkgroupSizeY,
    maxComputeWorkgroupSizeZ: limits.maxComputeWorkgroupSizeZ,
    maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxBufferSize: limits.maxBufferSize,
  };
}

function errorWithDiagnostics(message, diagnostics) {
  const error = new Error(message);
  error.webgpuDiagnostics = diagnostics;
  return error;
}

async function tryPopValidationError(device, diagnostics) {
  try {
    return await Promise.race([
      device.popErrorScope(),
      timeoutAfter("popErrorScope", 1_000),
    ]);
  } catch (error) {
    diagnostics.validationError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function isNonceRangeSafe(nonceStart, nonceCount) {
  if (!Number.isInteger(nonceStart) || !Number.isInteger(nonceCount)) return false;
  if (nonceStart < 0 || nonceStart > MAX_UINT32) return false;
  if (nonceCount <= 0 || nonceCount > MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT) return false;
  return nonceStart + nonceCount - 1 <= MAX_UINT32;
}

export function assertMinimalWhirlpoolInputs(header80, nonceStart, nonceCount) {
  if (header80.length !== 80) {
    throw new Error(`minimal WGSL Whirlpool proof requires exactly one 80-byte header, got ${header80.length}`);
  }
  if (nonceCount <= 0 || nonceCount > MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT) {
    throw new Error(`nonceCount must be between 1 and ${MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT} for the minimal Whirlpool proof`);
  }
  if (!isNonceRangeSafe(nonceStart, nonceCount)) {
    throw new Error(`nonce range overflows uint32: start=${nonceStart} count=${nonceCount}`);
  }
}

function nowIsoString() {
  return new Date().toISOString();
}

function buildRunDiagnostics(context, pipelineCacheHit) {
  const diagnostics = context.diagnostics;
  const thisRunPipelineCreationMs = pipelineCacheHit ? 0 : diagnostics.pipelineCreationMs;
  const thisRunShaderGenerationMs = pipelineCacheHit ? 0 : diagnostics.shaderGenerationMs;
  const thisRunShaderModuleCreationMs = pipelineCacheHit ? 0 : diagnostics.shaderModuleCreationMs;
  return {
    ...diagnostics,
    pipelineCacheHit,
    pipelineReused: pipelineCacheHit,
    pipelineCacheStatus: pipelineCacheHit ? "hit" : "miss",
    pipelineShaderBytes: diagnostics.shaderUtf8Bytes,
    pipelineShaderCodeUnits: diagnostics.shaderCodeUnits,
    coldPipelineCreationMs: diagnostics.pipelineCreationMs,
    coldPipelineCreationObservedAt: diagnostics.pipelineCreationObservedAt,
    coldPipelineCreationAppliesToCurrentRun: !pipelineCacheHit,
    thisRunPipelineCreationMs,
    thisRunPipelineWaitMs: thisRunPipelineCreationMs,
    thisRunUsedCachedPipeline: pipelineCacheHit,
    thisRunShaderGenerationMs,
    thisRunShaderModuleCreationMs,
    thisRunBufferSetupMs: 0,
    thisRunDispatchMs: 0,
    thisRunReadbackMs: 0,
    thisRunCpuComparisonMs: 0,
    thisRunTotalElapsedMs: 0,
  };
}

function withThisRunTimings(runDiagnostics, {
  bufferSetupMs,
  dispatchMs,
  readbackMs,
  cpuComparisonMs,
  totalElapsedMs,
}) {
  return {
    ...runDiagnostics,
    thisRunBufferSetupMs: bufferSetupMs,
    thisRunDispatchMs: dispatchMs,
    thisRunReadbackMs: readbackMs,
    thisRunCpuComparisonMs: cpuComparisonMs,
    thisRunTotalElapsedMs: totalElapsedMs,
  };
}

async function createWhirlpoolContext(gpu, buildShader = buildMinimalWhirlpoolShader, pipelineKey = "whirlpool-single", workgroupSize = WGSL_WORKGROUP_SIZE) {
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const diagnostics = {
    pipelineKey,
    workgroupSize: selectedWorkgroupSize,
    deviceLimitValidation: null,
    shaderGenerationMs: 0,
    shaderCodeUnits: 0,
    shaderUtf8Bytes: 0,
    shaderModuleCreationMs: 0,
    pipelineCreationMs: 0,
    pipelineTimeoutMs: WEBGPU_PIPELINE_TIMEOUT_MS,
    pipelineCreationCompleted: false,
    pipelineCreationObservedAt: null,
    validationError: null,
    deviceLostReason: null,
    deviceLostMessage: null,
    adapterLimits: null,
    deviceLimits: null,
  };

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw errorWithDiagnostics("WebGPU requestAdapter returned null", diagnostics);
  }
  const device = await adapter.requestDevice();
  diagnostics.adapterLimits = selectedLimits(adapter.limits);
  diagnostics.deviceLimits = selectedLimits(device.limits);
  diagnostics.deviceLimitValidation = validateWebGPUWorkgroupSize(selectedWorkgroupSize, device.limits);
  if (!diagnostics.deviceLimitValidation.valid) {
    throw errorWithDiagnostics("Unsupported by current WebGPU device limits", diagnostics);
  }
  device.lost.then((info) => {
    diagnostics.deviceLostReason = info.reason || null;
    diagnostics.deviceLostMessage = info.message || null;
  });

  const shaderGenerationStart = performance.now();
  const shaderCode = buildShader({ workgroupSize: selectedWorkgroupSize });
  diagnostics.shaderGenerationMs = performance.now() - shaderGenerationStart;
  diagnostics.shaderCodeUnits = shaderCode.length;
  diagnostics.shaderUtf8Bytes = new TextEncoder().encode(shaderCode).byteLength;

  device.pushErrorScope("validation");
  const moduleStart = performance.now();
  const shaderModule = device.createShaderModule({ code: shaderCode });
  diagnostics.shaderModuleCreationMs = performance.now() - moduleStart;

  const pipelineStart = performance.now();
  let pipeline;
  try {
    pipeline = await Promise.race([
      device.createComputePipelineAsync({
        layout: "auto",
        compute: {
          module: shaderModule,
          entryPoint: "main",
        },
      }),
      timeoutAfter("createComputePipelineAsync", WEBGPU_PIPELINE_TIMEOUT_MS),
    ]);
    diagnostics.pipelineCreationCompleted = true;
  } catch (error) {
    diagnostics.pipelineCreationMs = performance.now() - pipelineStart;
    diagnostics.pipelineCreationObservedAt = nowIsoString();
    const validationError = await tryPopValidationError(device, diagnostics);
    if (validationError) {
      diagnostics.validationError = validationError.message;
    }
    const message = validationError
      ? `WebGPU Whirlpool shader validation failed: ${validationError.message}`
      : error instanceof Error
      ? error.message
      : String(error);
    throw errorWithDiagnostics(message, diagnostics);
  }
  diagnostics.pipelineCreationMs = performance.now() - pipelineStart;
  diagnostics.pipelineCreationObservedAt = nowIsoString();

  const validationError = await device.popErrorScope();
  if (validationError) {
    diagnostics.validationError = validationError.message;
    throw errorWithDiagnostics(`WebGPU Whirlpool shader validation failed: ${validationError.message}`, diagnostics);
  }
  return { adapter, device, pipeline, diagnostics };
}

async function getWhirlpoolContext(gpu) {
  const pipelineCacheHit = Boolean(cachedContext);
  if (!cachedContext) {
    cachedContext = createWhirlpoolContext(gpu).catch((error) => {
      cachedContext = null;
      throw error;
    });
  }
  const context = await cachedContext;
  return {
    ...context,
    runDiagnostics: buildRunDiagnostics(context, pipelineCacheHit),
  };
}

async function getBatchedWhirlpoolContext(gpu, { workgroupSize = WGSL_WORKGROUP_SIZE } = {}) {
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const pipelineKey = whirlpoolPipelineKey(selectedWorkgroupSize);
  const pipelineCacheHit = cachedBatchContexts.has(pipelineKey);
  if (!cachedBatchContexts.has(pipelineKey)) {
    cachedBatchContexts.set(pipelineKey, createWhirlpoolContext(gpu, buildBatchedWhirlpoolShader, pipelineKey, selectedWorkgroupSize).catch((error) => {
      cachedBatchContexts.delete(pipelineKey);
      throw error;
    }));
  }
  const context = await cachedBatchContexts.get(pipelineKey);
  return {
    ...context,
    runDiagnostics: buildRunDiagnostics(context, pipelineCacheHit),
  };
}

export async function compileBatchedWhirlpoolPipeline({
  gpu = navigator.gpu,
  workgroupSize = WGSL_WORKGROUP_SIZE,
} = {}) {
  if (!gpu) {
    throw new Error("navigator.gpu is unavailable; cannot compile WebGPU Whirlpool pipeline");
  }
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const { runDiagnostics } = await getBatchedWhirlpoolContext(gpu, { workgroupSize: selectedWorkgroupSize });
  return {
    workgroupSize: selectedWorkgroupSize,
    pipelineKey: whirlpoolPipelineKey(selectedWorkgroupSize),
    compileGate: runDiagnostics.pipelineCreationCompleted && !runDiagnostics.validationError ? "compiled" : "compile failed",
    deviceValidation: runDiagnostics.deviceLimitValidation || null,
    pipelineDiagnostics: runDiagnostics,
  };
}

export function buildMinimalWhirlpoolShader({ workgroupSize = WGSL_WORKGROUP_SIZE } = {}) {
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  return `
${buildTableSource()}

struct Params {
  nonceStart: u32,
  nonceCount: u32,
};

@group(0) @binding(0) var<storage, read> headerWords: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> outputWords: array<u32>;

fn xor64(a: vec2u, b: vec2u) -> vec2u {
  return vec2u(a.x ^ b.x, a.y ^ b.y);
}

fn byte_at(x: vec2u, n: u32) -> u32 {
  if (n < 4u) {
    return (x.x >> (8u * n)) & 0xffu;
  }
  return (x.y >> (8u * (n - 4u))) & 0xffu;
}

fn rotl64(x: vec2u, n: u32) -> vec2u {
  if (n == 0u) {
    return x;
  }
  if (n < 32u) {
    return vec2u((x.x << n) | (x.y >> (32u - n)), (x.y << n) | (x.x >> (32u - n)));
  }
  if (n == 32u) {
    return vec2u(x.y, x.x);
  }
  let s = n - 32u;
  return vec2u((x.y << s) | (x.x >> (32u - s)), (x.x << s) | (x.y >> (32u - s)));
}

fn table_value(tableIndex: u32, byteValue: u32) -> vec2u {
  return rotl64(T0[byteValue], tableIndex * 8u);
}

fn round_elt(w: array<vec2u, 8>, i0: u32, i1: u32, i2: u32, i3: u32, i4: u32, i5: u32, i6: u32, i7: u32) -> vec2u {
  var out = table_value(0u, byte_at(w[i0], 0u));
  out = xor64(out, table_value(1u, byte_at(w[i1], 1u)));
  out = xor64(out, table_value(2u, byte_at(w[i2], 2u)));
  out = xor64(out, table_value(3u, byte_at(w[i3], 3u)));
  out = xor64(out, table_value(4u, byte_at(w[i4], 4u)));
  out = xor64(out, table_value(5u, byte_at(w[i5], 5u)));
  out = xor64(out, table_value(6u, byte_at(w[i6], 6u)));
  return xor64(out, table_value(7u, byte_at(w[i7], 7u)));
}

fn round_full(w: array<vec2u, 8>, c: array<vec2u, 8>) -> array<vec2u, 8> {
  var out: array<vec2u, 8>;
  out[0] = xor64(round_elt(w, 0u, 7u, 6u, 5u, 4u, 3u, 2u, 1u), c[0]);
  out[1] = xor64(round_elt(w, 1u, 0u, 7u, 6u, 5u, 4u, 3u, 2u), c[1]);
  out[2] = xor64(round_elt(w, 2u, 1u, 0u, 7u, 6u, 5u, 4u, 3u), c[2]);
  out[3] = xor64(round_elt(w, 3u, 2u, 1u, 0u, 7u, 6u, 5u, 4u), c[3]);
  out[4] = xor64(round_elt(w, 4u, 3u, 2u, 1u, 0u, 7u, 6u, 5u), c[4]);
  out[5] = xor64(round_elt(w, 5u, 4u, 3u, 2u, 1u, 0u, 7u, 6u), c[5]);
  out[6] = xor64(round_elt(w, 6u, 5u, 4u, 3u, 2u, 1u, 0u, 7u), c[6]);
  out[7] = xor64(round_elt(w, 7u, 6u, 5u, 4u, 3u, 2u, 1u, 0u), c[7]);
  return out;
}

fn process_block(source: array<vec2u, 8>, stateIn: array<vec2u, 8>) -> array<vec2u, 8> {
  var key = stateIn;
  var data: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    data[i] = xor64(source[i], key[i]);
  }

  for (var round = 0u; round < 10u; round = round + 1u) {
    var keyConstants: array<vec2u, 8>;
    keyConstants[0] = RC[round];
    keyConstants[1] = vec2u(0u, 0u);
    keyConstants[2] = vec2u(0u, 0u);
    keyConstants[3] = vec2u(0u, 0u);
    keyConstants[4] = vec2u(0u, 0u);
    keyConstants[5] = vec2u(0u, 0u);
    keyConstants[6] = vec2u(0u, 0u);
    keyConstants[7] = vec2u(0u, 0u);
    key = round_full(key, keyConstants);
    data = round_full(data, key);
  }

  var out: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    out[i] = xor64(xor64(stateIn[i], data[i]), source[i]);
  }
  return out;
}

fn whirlpool80_folded(nonce: u32) -> array<u32, 8> {
  var state: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    state[i] = vec2u(0u, 0u);
  }

  var block0: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    block0[i] = vec2u(headerWords[i * 2u], headerWords[i * 2u + 1u]);
  }
  state = process_block(block0, state);

  var block1: array<vec2u, 8>;
  block1[0] = vec2u(headerWords[16], headerWords[17]);
  block1[1] = vec2u(headerWords[18], nonce);
  block1[2] = vec2u(0x00000080u, 0u);
  block1[3] = vec2u(0u, 0u);
  block1[4] = vec2u(0u, 0u);
  block1[5] = vec2u(0u, 0u);
  block1[6] = vec2u(0u, 0u);
  block1[7] = vec2u(0u, 0x80020000u);
  state = process_block(block1, state);

  var folded: array<u32, 8>;
  folded[0] = state[0].x ^ state[4].x;
  folded[1] = state[0].y ^ state[4].y;
  folded[2] = state[1].x ^ state[5].x;
  folded[3] = state[1].y ^ state[5].y;
  folded[4] = state[2].x ^ state[6].x;
  folded[5] = state[2].y ^ state[6].y;
  folded[6] = state[3].x ^ state[7].x;
  folded[7] = state[3].y ^ state[7].y;
  return folded;
}

@compute @workgroup_size(${selectedWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.nonceCount) {
    return;
  }
  let nonce = params.nonceStart + index;
  let folded = whirlpool80_folded(nonce);
  let base = index * 8u;
  for (var i = 0u; i < 8u; i = i + 1u) {
    outputWords[base + i] = folded[i];
  }
}
`;
}

export function buildBatchedWhirlpoolShader({ workgroupSize = WGSL_WORKGROUP_SIZE } = {}) {
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  return `
${buildTableSource()}

struct Params {
  taskCount: u32,
  taskOffset: u32,
  outputOffset: u32,
  _pad0: u32,
};

@group(0) @binding(0) var<storage, read> headerWords: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> outputWords: array<u32>;
@group(0) @binding(3) var<storage, read> taskWords: array<u32>;

fn xor64(a: vec2u, b: vec2u) -> vec2u {
  return vec2u(a.x ^ b.x, a.y ^ b.y);
}

fn byte_at(x: vec2u, n: u32) -> u32 {
  if (n < 4u) {
    return (x.x >> (8u * n)) & 0xffu;
  }
  return (x.y >> (8u * (n - 4u))) & 0xffu;
}

fn rotl64(x: vec2u, n: u32) -> vec2u {
  if (n == 0u) {
    return x;
  }
  if (n < 32u) {
    return vec2u((x.x << n) | (x.y >> (32u - n)), (x.y << n) | (x.x >> (32u - n)));
  }
  if (n == 32u) {
    return vec2u(x.y, x.x);
  }
  let s = n - 32u;
  return vec2u((x.y << s) | (x.x >> (32u - s)), (x.x << s) | (x.y >> (32u - s)));
}

fn table_value(tableIndex: u32, byteValue: u32) -> vec2u {
  return rotl64(T0[byteValue], tableIndex * 8u);
}

fn round_elt(w: array<vec2u, 8>, i0: u32, i1: u32, i2: u32, i3: u32, i4: u32, i5: u32, i6: u32, i7: u32) -> vec2u {
  var out = table_value(0u, byte_at(w[i0], 0u));
  out = xor64(out, table_value(1u, byte_at(w[i1], 1u)));
  out = xor64(out, table_value(2u, byte_at(w[i2], 2u)));
  out = xor64(out, table_value(3u, byte_at(w[i3], 3u)));
  out = xor64(out, table_value(4u, byte_at(w[i4], 4u)));
  out = xor64(out, table_value(5u, byte_at(w[i5], 5u)));
  out = xor64(out, table_value(6u, byte_at(w[i6], 6u)));
  return xor64(out, table_value(7u, byte_at(w[i7], 7u)));
}

fn round_full(w: array<vec2u, 8>, c: array<vec2u, 8>) -> array<vec2u, 8> {
  var out: array<vec2u, 8>;
  out[0] = xor64(round_elt(w, 0u, 7u, 6u, 5u, 4u, 3u, 2u, 1u), c[0]);
  out[1] = xor64(round_elt(w, 1u, 0u, 7u, 6u, 5u, 4u, 3u, 2u), c[1]);
  out[2] = xor64(round_elt(w, 2u, 1u, 0u, 7u, 6u, 5u, 4u, 3u), c[2]);
  out[3] = xor64(round_elt(w, 3u, 2u, 1u, 0u, 7u, 6u, 5u, 4u), c[3]);
  out[4] = xor64(round_elt(w, 4u, 3u, 2u, 1u, 0u, 7u, 6u, 5u), c[4]);
  out[5] = xor64(round_elt(w, 5u, 4u, 3u, 2u, 1u, 0u, 7u, 6u), c[5]);
  out[6] = xor64(round_elt(w, 6u, 5u, 4u, 3u, 2u, 1u, 0u, 7u), c[6]);
  out[7] = xor64(round_elt(w, 7u, 6u, 5u, 4u, 3u, 2u, 1u, 0u), c[7]);
  return out;
}

fn process_block(source: array<vec2u, 8>, stateIn: array<vec2u, 8>) -> array<vec2u, 8> {
  var key = stateIn;
  var data: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    data[i] = xor64(source[i], key[i]);
  }

  for (var round = 0u; round < 10u; round = round + 1u) {
    var keyConstants: array<vec2u, 8>;
    keyConstants[0] = RC[round];
    keyConstants[1] = vec2u(0u, 0u);
    keyConstants[2] = vec2u(0u, 0u);
    keyConstants[3] = vec2u(0u, 0u);
    keyConstants[4] = vec2u(0u, 0u);
    keyConstants[5] = vec2u(0u, 0u);
    keyConstants[6] = vec2u(0u, 0u);
    keyConstants[7] = vec2u(0u, 0u);
    key = round_full(key, keyConstants);
    data = round_full(data, key);
  }

  var out: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    out[i] = xor64(xor64(stateIn[i], data[i]), source[i]);
  }
  return out;
}

fn whirlpool80_folded_at(headerBase: u32, nonce: u32) -> array<u32, 8> {
  var state: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    state[i] = vec2u(0u, 0u);
  }

  var block0: array<vec2u, 8>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    block0[i] = vec2u(headerWords[headerBase + i * 2u], headerWords[headerBase + i * 2u + 1u]);
  }
  state = process_block(block0, state);

  var block1: array<vec2u, 8>;
  block1[0] = vec2u(headerWords[headerBase + 16u], headerWords[headerBase + 17u]);
  block1[1] = vec2u(headerWords[headerBase + 18u], nonce);
  block1[2] = vec2u(0x00000080u, 0u);
  block1[3] = vec2u(0u, 0u);
  block1[4] = vec2u(0u, 0u);
  block1[5] = vec2u(0u, 0u);
  block1[6] = vec2u(0u, 0u);
  block1[7] = vec2u(0u, 0x80020000u);
  state = process_block(block1, state);

  var folded: array<u32, 8>;
  folded[0] = state[0].x ^ state[4].x;
  folded[1] = state[0].y ^ state[4].y;
  folded[2] = state[1].x ^ state[5].x;
  folded[3] = state[1].y ^ state[5].y;
  folded[4] = state[2].x ^ state[6].x;
  folded[5] = state[2].y ^ state[6].y;
  folded[6] = state[3].x ^ state[7].x;
  folded[7] = state[3].y ^ state[7].y;
  return folded;
}

@compute @workgroup_size(${selectedWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.taskCount) {
    return;
  }
  let taskIndex = params.taskOffset + index;
  let taskBase = taskIndex * 4u;
  let headerBase = taskWords[taskBase];
  let nonce = taskWords[taskBase + 1u];
  let folded = whirlpool80_folded_at(headerBase, nonce);
  let base = (params.outputOffset + index) * 8u;
  for (var i = 0u; i < 8u; i = i + 1u) {
    outputWords[base + i] = folded[i];
  }
}
`;
}

export function buildWhirlpoolCpuReferenceRows(header80, nonceStart, nonceCount) {
  assertMinimalWhirlpoolInputs(header80, nonceStart, nonceCount);
  const rows = [];
  for (let i = 0; i < nonceCount; i += 1) {
    const nonce = (nonceStart + i) >>> 0;
    const patched = Uint8Array.from(header80);
    patchNonce(patched, nonce);
    rows.push({
      index: i,
      nonce,
      cpuInternalHex: capstashPoWInternalHex(patched),
    });
  }
  return rows;
}

export function buildWhirlpool80CpuCheckpoints(header80, nonce) {
  assertMinimalWhirlpoolInputs(header80, nonce, 1);
  const patched = Uint8Array.from(header80);
  patchNonce(patched, nonce);
  const headerWords = headerBytesToWords(patched);
  const firstBlockWords = Array.from(headerWords.slice(0, 16));
  const secondBlockWords = [
    headerWords[16],
    headerWords[17],
    headerWords[18],
    headerWords[19],
    0x00000080,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0x80020000,
  ];
  const whirlpool512Bytes = whirlpool512(patched);
  const foldedBytes = xorFold512To256(whirlpool512Bytes);
  return {
    nonce,
    headerWords: Array.from(headerWords),
    firstBlockWords,
    secondBlockWords,
    initialStateWords64: Array(8).fill("0000000000000000"),
    roundConstants64Hex: PLAIN_RC.map((word) => word.toString(16).padStart(16, "0")),
    finalWhirlpool512Hex: bytesToHex(whirlpool512Bytes),
    foldedInternalHex: bytesToHex(foldedBytes),
  };
}

export function compareWhirlpoolGpuRows(rows) {
  return rows.map((row) => ({
    ...row,
    match: row.gpuInternalHex === row.cpuInternalHex,
  }));
}

export async function runWebGPUWhirlpoolMinimal({
  header80 = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex),
  nonceStart = 0,
  nonceCount = 1,
  gpu = navigator.gpu,
} = {}) {
  if (!gpu) {
    throw new Error("navigator.gpu is unavailable; cannot run WebGPU Whirlpool minimal proof");
  }
  assertMinimalWhirlpoolInputs(header80, nonceStart, nonceCount);

  const totalStart = performance.now();
  const { device, pipeline, runDiagnostics } = await getWhirlpoolContext(gpu);

  const bufferSetupStart = performance.now();
  const headerWords = headerBytesToWords(header80);
  const headerBuffer = device.createBuffer({
    size: headerWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(headerBuffer, 0, headerWords);

  const paramsArray = new Uint32Array([nonceStart >>> 0, nonceCount >>> 0, 0, 0]);
  const paramsBuffer = device.createBuffer({
    size: paramsArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, paramsArray);

  const outputSize = nonceCount * 8 * Uint32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  device.pushErrorScope("validation");
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: headerBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });
  const bufferSetupMs = performance.now() - bufferSetupStart;

  const dispatchCount = nonceCount;
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(dispatchCount);
  pass.end();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSize);

  const submitStart = performance.now();
  device.queue.submit([commandEncoder.finish()]);
  await Promise.race([device.queue.onSubmittedWorkDone(), timeoutAfter("WebGPU Whirlpool dispatch")]);
  const dispatchError = await device.popErrorScope();
  if (dispatchError) {
    throw new Error(`WebGPU Whirlpool dispatch failed: ${dispatchError.message}`);
  }
  const gpuElapsedMs = performance.now() - submitStart;

  const readbackStart = performance.now();
  await Promise.race([readbackBuffer.mapAsync(GPUMapMode.READ), timeoutAfter("WebGPU Whirlpool readback")]);
  const readbackMs = performance.now() - readbackStart;
  const mapped = readbackBuffer.getMappedRange();
  const outputWords = new Uint32Array(mapped.slice(0));
  readbackBuffer.unmap();

  const comparisonStart = performance.now();
  const cpuRows = buildWhirlpoolCpuReferenceRows(header80, nonceStart, nonceCount);
  const rows = [];
  for (let i = 0; i < nonceCount; i += 1) {
    const words = outputWords.slice(i * 8, i * 8 + 8);
    rows.push({
      ...cpuRows[i],
      gpuInternalHex: wordsToInternalHashHex(words),
    });
  }
  const results = compareWhirlpoolGpuRows(rows);
  const mismatches = results.filter((row) => !row.match);
  const cpuComparisonMs = performance.now() - comparisonStart;
  const totalElapsedMs = performance.now() - totalStart;
  const pipelineDiagnostics = withThisRunTimings(runDiagnostics, {
    bufferSetupMs,
    dispatchMs: gpuElapsedMs,
    readbackMs,
    cpuComparisonMs,
    totalElapsedMs,
  });
  const pipelineSetupMs =
    pipelineDiagnostics.thisRunShaderGenerationMs +
    pipelineDiagnostics.thisRunShaderModuleCreationMs +
    pipelineDiagnostics.thisRunPipelineCreationMs;
  const hashWorkExcludingPipelineMs = bufferSetupMs + gpuElapsedMs + readbackMs + cpuComparisonMs;

  return {
    stage: "webgpu-whirlpool-minimal",
    shaderStatus: mismatches.length === 0
      ? "Real WebGPU Whirlpool hashing: Verified for fixture case"
      : "Real WebGPU Whirlpool hashing: Failed verification",
    nonceStart,
    nonceCount,
    dispatchCount,
    resultsPerDispatch: nonceCount / dispatchCount,
    resultCount: results.length,
    mismatchesAgainstCpuReference: mismatches.length,
    firstMismatch: mismatches[0] || null,
    gpuElapsedMs,
    bufferSetupMs,
    readbackMs,
    cpuComparisonMs,
    pipelineSetupMs,
    hashWorkExcludingPipelineMs,
    verifiedHashesPerSecondExcludingPipeline: hashWorkExcludingPipelineMs > 0 ? (results.length * 1000) / hashWorkExcludingPipelineMs : 0,
    verifiedHashesPerSecondIncludingPipeline: totalElapsedMs > 0 ? (results.length * 1000) / totalElapsedMs : 0,
    totalElapsedMs,
    pipelineReused: runDiagnostics.pipelineReused,
    pipelineCacheStatus: runDiagnostics.pipelineCacheStatus,
    pipelineDiagnostics,
    results,
  };
}

export function buildWhirlpoolBatchCpuRows(tasks) {
  return tasks.map((task, index) => {
    assertMinimalWhirlpoolInputs(task.header80, task.nonce, 1);
    const patched = Uint8Array.from(task.header80);
    patchNonce(patched, task.nonce);
    return {
      ...task,
      index,
      nonce: task.nonce >>> 0,
      cpuInternalHex: capstashPoWInternalHex(patched),
    };
  });
}

function normalizeCpuCheckIndexes(cpuCheckIndexes, taskCount) {
  if (cpuCheckIndexes === null || cpuCheckIndexes === undefined) return null;
  const indexes = Array.from(new Set(cpuCheckIndexes.map((index) => Number.parseInt(index, 10))))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < taskCount)
    .sort((a, b) => a - b);
  return indexes;
}

function buildWhirlpoolSpotCheckRows(tasks, gpuRows, indexes) {
  return indexes.map((index) => {
    const task = tasks[index];
    assertMinimalWhirlpoolInputs(task.header80, task.nonce, 1);
    const patched = Uint8Array.from(task.header80);
    patchNonce(patched, task.nonce);
    const row = {
      ...task,
      index,
      nonce: task.nonce >>> 0,
      cpuInternalHex: capstashPoWInternalHex(patched),
      gpuInternalHex: gpuRows[index].gpuInternalHex,
    };
    return {
      ...row,
      match: row.gpuInternalHex === row.cpuInternalHex,
    };
  });
}

export async function runWebGPUWhirlpoolBatch({
  tasks,
  gpu = navigator.gpu,
  cpuCheckIndexes = null,
  outputReadback = true,
  workgroupSize = WGSL_WORKGROUP_SIZE,
} = {}) {
  if (!gpu) {
    throw new Error("navigator.gpu is unavailable; cannot run WebGPU Whirlpool batched proof");
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("batched WGSL Whirlpool proof requires at least one task");
  }
  if (tasks.length > MAX_WHIRLPOOL_BATCH_TASKS) {
    throw new Error(`batched WGSL Whirlpool proof supports at most ${MAX_WHIRLPOOL_BATCH_TASKS} tasks per dispatch`);
  }

  const totalStart = performance.now();
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const { device, pipeline, runDiagnostics } = await getBatchedWhirlpoolContext(gpu, { workgroupSize: selectedWorkgroupSize });

  const bufferSetupStart = performance.now();
  const bufferPopulationStart = performance.now();
  const headerWords = new Uint32Array(tasks.length * 20);
  const taskWords = new Uint32Array(tasks.length * 4);
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    assertMinimalWhirlpoolInputs(task.header80, task.nonce, 1);
    const words = headerBytesToWords(task.header80);
    headerWords.set(words, i * 20);
    taskWords[i * 4] = i * 20;
    taskWords[i * 4 + 1] = task.nonce >>> 0;
  }
  const bufferPopulationMs = performance.now() - bufferPopulationStart;

  const bufferAllocationStart = performance.now();
  const headerBuffer = device.createBuffer({
    size: headerWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const paramsArray = new Uint32Array([tasks.length >>> 0, 0, 0, 0]);
  const paramsBuffer = device.createBuffer({
    size: paramsArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const taskBuffer = device.createBuffer({
    size: taskWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const outputSize = tasks.length * 8 * Uint32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = outputReadback
    ? device.createBuffer({
        size: outputSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      })
    : null;
  const bufferAllocationMs = performance.now() - bufferAllocationStart;

  const bufferUploadStart = performance.now();
  device.queue.writeBuffer(headerBuffer, 0, headerWords);
  device.queue.writeBuffer(paramsBuffer, 0, paramsArray);
  device.queue.writeBuffer(taskBuffer, 0, taskWords);
  const bufferUploadMs = performance.now() - bufferUploadStart;

  device.pushErrorScope("validation");
  const bindGroupCreationStart = performance.now();
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: headerBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
      { binding: 3, resource: { buffer: taskBuffer } },
    ],
  });
  const bindGroupCreationMs = performance.now() - bindGroupCreationStart;
  const bufferSetupMs = performance.now() - bufferSetupStart;

  const dispatchCount = 1;
  const commandEncoderCreationStart = performance.now();
  const commandEncoder = device.createCommandEncoder();
  const commandEncoderCreationMs = performance.now() - commandEncoderCreationStart;
  const computePassEncodingStart = performance.now();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const invocationPlan = workgroupInvocationPlan(tasks.length, selectedWorkgroupSize);
  pass.dispatchWorkgroups(invocationPlan.workgroupCount);
  pass.end();
  if (outputReadback) {
    commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSize);
  }
  const computePassEncodingMs = performance.now() - computePassEncodingStart;
  const commandFinishStart = performance.now();
  const commandBuffer = commandEncoder.finish();
  const commandFinishMs = performance.now() - commandFinishStart;

  const submitStart = performance.now();
  device.queue.submit([commandBuffer]);
  const queueSubmissionMs = performance.now() - submitStart;
  const queueWaitStart = performance.now();
  await Promise.race([device.queue.onSubmittedWorkDone(), timeoutAfter("WebGPU Whirlpool batched dispatch")]);
  const queueCompletionWaitMs = performance.now() - queueWaitStart;
  const dispatchError = await device.popErrorScope();
  if (dispatchError) {
    throw new Error(`WebGPU Whirlpool batched dispatch failed: ${dispatchError.message}`);
  }
  const gpuElapsedMs = performance.now() - submitStart;

  let readbackMs = 0;
  let outputWords = new Uint32Array(0);
  let mapReadbackWaitMs = 0;
  let resultDecodeMs = 0;
  if (outputReadback) {
    const readbackStart = performance.now();
    const mapStart = performance.now();
    await Promise.race([readbackBuffer.mapAsync(GPUMapMode.READ), timeoutAfter("WebGPU Whirlpool batched readback")]);
    mapReadbackWaitMs = performance.now() - mapStart;
    const decodeStart = performance.now();
    const mapped = readbackBuffer.getMappedRange();
    outputWords = new Uint32Array(mapped.slice(0));
    readbackBuffer.unmap();
    resultDecodeMs = performance.now() - decodeStart;
    readbackMs = performance.now() - readbackStart;
  }

  const comparisonStart = performance.now();
  const spotCheckSelectionStart = performance.now();
  const spotCheckIndexes = outputReadback ? normalizeCpuCheckIndexes(cpuCheckIndexes, tasks.length) : [];
  const cpuSpotCheckSelectionMs = performance.now() - spotCheckSelectionStart;
  const gpuRows = [];
  if (outputReadback) {
    for (let i = 0; i < tasks.length; i += 1) {
      const words = outputWords.slice(i * 8, i * 8 + 8);
      gpuRows.push({
        ...tasks[i],
        index: i,
        nonce: tasks[i].nonce >>> 0,
        gpuInternalHex: wordsToInternalHashHex(words),
      });
    }
  }

  const cpuReferenceStart = performance.now();
  const results = outputReadback
    ? spotCheckIndexes === null
      ? compareWhirlpoolGpuRows(buildWhirlpoolBatchCpuRows(tasks).map((row) => ({
          ...row,
          gpuInternalHex: gpuRows[row.index].gpuInternalHex,
        })))
      : buildWhirlpoolSpotCheckRows(tasks, gpuRows, spotCheckIndexes)
    : [];
  const cpuReferenceHashingAndComparisonMs = performance.now() - cpuReferenceStart;
  const mismatches = results.filter((row) => !row.match);
  const cpuComparisonMs = performance.now() - comparisonStart;
  const totalElapsedMs = performance.now() - totalStart;
  const hostPhases = {
    bufferPopulationMs,
    bufferAllocationMs,
    bufferUploadMs,
    bindGroupCreationMs,
    commandEncoderCreationMs,
    computePassEncodingMs,
    commandFinishMs,
    queueSubmissionMs,
    queueCompletionWaitMs,
    mapReadbackWaitMs,
    resultDecodeMs,
    cpuSpotCheckSelectionMs,
    cpuReferenceHashingAndComparisonMs,
    cpuComparisonMs,
    totalElapsedMs,
    timingSourceNote: "Browser-observed wall-clock timing; WebGPU does not expose shader-internal hardware counters here.",
  };
  const pipelineDiagnostics = withThisRunTimings(runDiagnostics, {
    bufferSetupMs,
    dispatchMs: gpuElapsedMs,
    readbackMs,
    cpuComparisonMs,
    totalElapsedMs,
  });
  const pipelineSetupMs =
    pipelineDiagnostics.thisRunShaderGenerationMs +
    pipelineDiagnostics.thisRunShaderModuleCreationMs +
    pipelineDiagnostics.thisRunPipelineCreationMs;
  const hashWorkExcludingPipelineMs = bufferSetupMs + gpuElapsedMs + readbackMs + cpuComparisonMs;

  return {
    stage: "webgpu-whirlpool-batched",
    shaderStatus: mismatches.length === 0
      ? "Real WebGPU Whirlpool hashing: Verified for batched fixture case"
      : "Real WebGPU Whirlpool hashing: Failed batched verification",
    nonceStart: tasks[0].nonce >>> 0,
    nonceCount: tasks.length,
    batchSize: tasks.length,
    dispatchCount,
    resultsPerDispatch: tasks.length / dispatchCount,
    workgroupSize: selectedWorkgroupSize,
    workgroupCount: invocationPlan.workgroupCount,
    totalWorkgroups: invocationPlan.workgroupCount,
    totalLaunchedInvocations: invocationPlan.totalLaunchedInvocations,
    totalActiveInvocations: invocationPlan.activeInvocations,
    paddedInactiveInvocations: invocationPlan.paddedInactiveInvocations,
    partialFinalWorkgroupInvocations: invocationPlan.partialFinalWorkgroupInvocations,
    resultCount: tasks.length,
    returnedResultCount: gpuRows.length,
    mismatchesAgainstCpuReference: mismatches.length,
    cpuComparisonMode: outputReadback ? spotCheckIndexes === null ? "full" : "spot-check" : "none-no-readback-probe",
    spotCheckIndexes: spotCheckIndexes === null ? null : spotCheckIndexes,
    spotCheckCount: outputReadback ? spotCheckIndexes === null ? results.length : spotCheckIndexes.length : 0,
    spotCheckMismatches: mismatches.length,
    firstMismatch: mismatches[0] || null,
    gpuElapsedMs,
    bufferSetupMs,
    readbackMs,
    cpuComparisonMs,
    pipelineSetupMs,
    hashWorkExcludingPipelineMs,
    verifiedHashesPerSecondExcludingPipeline: hashWorkExcludingPipelineMs > 0 ? (results.length * 1000) / hashWorkExcludingPipelineMs : 0,
    verifiedHashesPerSecondIncludingPipeline: totalElapsedMs > 0 ? (results.length * 1000) / totalElapsedMs : 0,
    totalElapsedMs,
    pipelineReused: runDiagnostics.pipelineReused,
    pipelineCacheStatus: runDiagnostics.pipelineCacheStatus,
    pipelineDiagnostics,
    outputReadback,
    validHashBenchmark: outputReadback,
    profilingOnly: !outputReadback,
    hostPhases,
    results,
    gpuRows,
  };
}

export function buildLogicalDispatchPlan(taskCount, logicalBatchSize, workgroupSize = WGSL_WORKGROUP_SIZE) {
  if (!Number.isInteger(taskCount) || taskCount <= 0) {
    throw new Error(`taskCount must be a positive integer, got ${taskCount}`);
  }
  if (!Number.isInteger(logicalBatchSize) || logicalBatchSize <= 0) {
    throw new Error(`logicalBatchSize must be a positive integer, got ${logicalBatchSize}`);
  }
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const plan = [];
  for (let startIndex = 0; startIndex < taskCount; startIndex += logicalBatchSize) {
    const count = Math.min(logicalBatchSize, taskCount - startIndex);
    const invocationPlan = workgroupInvocationPlan(count, selectedWorkgroupSize);
    plan.push({
      dispatchIndex: plan.length,
      taskOffset: startIndex,
      outputOffset: startIndex,
      count,
      outputByteOffset: startIndex * 8 * Uint32Array.BYTES_PER_ELEMENT,
      outputByteLength: count * 8 * Uint32Array.BYTES_PER_ELEMENT,
      workgroupSize: selectedWorkgroupSize,
      workgroupCount: invocationPlan.workgroupCount,
      totalLaunchedInvocations: invocationPlan.totalLaunchedInvocations,
      activeInvocations: invocationPlan.activeInvocations,
      paddedInactiveInvocations: invocationPlan.paddedInactiveInvocations,
      partialFinalWorkgroupInvocations: invocationPlan.partialFinalWorkgroupInvocations,
    });
  }
  return plan;
}

export function outputOffsetRangesOverlap(plan) {
  const ranges = plan
    .map((entry) => ({
      start: entry.outputByteOffset,
      end: entry.outputByteOffset + entry.outputByteLength,
    }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) return true;
  }
  return false;
}

export async function runWebGPUWhirlpoolMultiDispatchSubmission({
  tasks,
  logicalBatchSize = MAX_WHIRLPOOL_BATCH_TASKS,
  gpu = navigator.gpu,
  cpuCheckIndexes = null,
  workgroupSize = WGSL_WORKGROUP_SIZE,
} = {}) {
  if (!gpu) {
    throw new Error("navigator.gpu is unavailable; cannot run WebGPU Whirlpool multi-dispatch proof");
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("multi-dispatch WGSL Whirlpool proof requires at least one task");
  }
  if (logicalBatchSize > MAX_WHIRLPOOL_BATCH_TASKS) {
    throw new Error(`logical dispatch batch size exceeds conservative WGSL batch limit: ${logicalBatchSize}`);
  }

  const totalStart = performance.now();
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const { device, pipeline, runDiagnostics } = await getBatchedWhirlpoolContext(gpu, { workgroupSize: selectedWorkgroupSize });

  const logicalPlan = buildLogicalDispatchPlan(tasks.length, logicalBatchSize, selectedWorkgroupSize);
  if (outputOffsetRangesOverlap(logicalPlan)) {
    throw new Error("multi-dispatch output offset ranges overlap");
  }

  const bufferSetupStart = performance.now();
  const bufferPopulationStart = performance.now();
  const headerWords = new Uint32Array(tasks.length * 20);
  const taskWords = new Uint32Array(tasks.length * 4);
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    assertMinimalWhirlpoolInputs(task.header80, task.nonce, 1);
    const words = headerBytesToWords(task.header80);
    headerWords.set(words, i * 20);
    taskWords[i * 4] = i * 20;
    taskWords[i * 4 + 1] = task.nonce >>> 0;
  }
  const bufferPopulationMs = performance.now() - bufferPopulationStart;

  const bufferAllocationStart = performance.now();
  const headerBuffer = device.createBuffer({
    size: headerWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const taskBuffer = device.createBuffer({
    size: taskWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const outputSize = tasks.length * 8 * Uint32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const paramsBuffers = logicalPlan.map((entry) => {
    const paramsArray = new Uint32Array([
      entry.count >>> 0,
      entry.taskOffset >>> 0,
      entry.outputOffset >>> 0,
      0,
    ]);
    const paramsBuffer = device.createBuffer({
      size: paramsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { paramsArray, paramsBuffer };
  });
  const bufferAllocationMs = performance.now() - bufferAllocationStart;

  const bufferUploadStart = performance.now();
  device.queue.writeBuffer(headerBuffer, 0, headerWords);
  device.queue.writeBuffer(taskBuffer, 0, taskWords);
  for (const entry of paramsBuffers) {
    device.queue.writeBuffer(entry.paramsBuffer, 0, entry.paramsArray);
  }
  const bufferUploadMs = performance.now() - bufferUploadStart;

  device.pushErrorScope("validation");
  const bindGroupCreationStart = performance.now();
  const bindGroups = paramsBuffers.map((entry) => device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: headerBuffer } },
      { binding: 1, resource: { buffer: entry.paramsBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
      { binding: 3, resource: { buffer: taskBuffer } },
    ],
  }));
  const bindGroupCreationMs = performance.now() - bindGroupCreationStart;
  const bufferSetupMs = performance.now() - bufferSetupStart;

  const commandEncoderCreationStart = performance.now();
  const commandEncoder = device.createCommandEncoder();
  const commandEncoderCreationMs = performance.now() - commandEncoderCreationStart;
  const computePassEncodingStart = performance.now();
  const perLogicalDispatch = [];
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  for (const entry of logicalPlan) {
    const encodeStart = performance.now();
    pass.setBindGroup(0, bindGroups[entry.dispatchIndex]);
    pass.dispatchWorkgroups(entry.workgroupCount);
    perLogicalDispatch.push({
      dispatchIndex: entry.dispatchIndex,
      taskOffset: entry.taskOffset,
      outputOffset: entry.outputOffset,
      outputByteOffset: entry.outputByteOffset,
      outputByteLength: entry.outputByteLength,
      hashesSubmitted: entry.count,
      workgroupSize: entry.workgroupSize,
      workgroupCount: entry.workgroupCount,
      totalLaunchedInvocations: entry.totalLaunchedInvocations,
      activeInvocations: entry.activeInvocations,
      paddedInactiveInvocations: entry.paddedInactiveInvocations,
      partialFinalWorkgroupInvocations: entry.partialFinalWorkgroupInvocations,
      computePassEncodingMs: performance.now() - encodeStart,
    });
  }
  pass.end();
  const copyEncodingStart = performance.now();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSize);
  const copyEncodingMs = performance.now() - copyEncodingStart;
  const computePassEncodingMs = performance.now() - computePassEncodingStart;
  const commandFinishStart = performance.now();
  const commandBuffer = commandEncoder.finish();
  const commandFinishMs = performance.now() - commandFinishStart;

  const submitStart = performance.now();
  device.queue.submit([commandBuffer]);
  const queueSubmissionMs = performance.now() - submitStart;
  const queueWaitStart = performance.now();
  await Promise.race([device.queue.onSubmittedWorkDone(), timeoutAfter("WebGPU Whirlpool multi-dispatch submission")]);
  const queueCompletionWaitMs = performance.now() - queueWaitStart;
  const dispatchError = await device.popErrorScope();
  if (dispatchError) {
    throw new Error(`WebGPU Whirlpool multi-dispatch submission failed: ${dispatchError.message}`);
  }
  const gpuElapsedMs = performance.now() - submitStart;

  const readbackStart = performance.now();
  const mapStart = performance.now();
  await Promise.race([readbackBuffer.mapAsync(GPUMapMode.READ), timeoutAfter("WebGPU Whirlpool multi-dispatch readback")]);
  const mapReadbackWaitMs = performance.now() - mapStart;
  const decodeStart = performance.now();
  const mapped = readbackBuffer.getMappedRange();
  const outputWords = new Uint32Array(mapped.slice(0));
  readbackBuffer.unmap();
  const resultDecodeMs = performance.now() - decodeStart;
  const readbackMs = performance.now() - readbackStart;

  const comparisonStart = performance.now();
  const spotCheckSelectionStart = performance.now();
  const spotCheckIndexes = normalizeCpuCheckIndexes(cpuCheckIndexes, tasks.length);
  const cpuSpotCheckSelectionMs = performance.now() - spotCheckSelectionStart;
  const gpuRows = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const words = outputWords.slice(i * 8, i * 8 + 8);
    gpuRows.push({
      ...tasks[i],
      index: i,
      nonce: tasks[i].nonce >>> 0,
      gpuInternalHex: wordsToInternalHashHex(words),
    });
  }
  const cpuReferenceStart = performance.now();
  const results = spotCheckIndexes === null
    ? compareWhirlpoolGpuRows(buildWhirlpoolBatchCpuRows(tasks).map((row) => ({
        ...row,
        gpuInternalHex: gpuRows[row.index].gpuInternalHex,
      })))
    : buildWhirlpoolSpotCheckRows(tasks, gpuRows, spotCheckIndexes);
  const cpuReferenceHashingAndComparisonMs = performance.now() - cpuReferenceStart;
  const mismatches = results.filter((row) => !row.match);
  const cpuComparisonMs = performance.now() - comparisonStart;
  const totalElapsedMs = performance.now() - totalStart;

  const hostPhases = {
    bufferPopulationMs,
    bufferAllocationMs,
    bufferUploadMs,
    bindGroupCreationMs,
    commandEncoderCreationMs,
    computePassEncodingMs,
    perLogicalDispatchEncodingMs: perLogicalDispatch.reduce((total, entry) => total + entry.computePassEncodingMs, 0),
    copyEncodingMs,
    commandFinishMs,
    queueSubmissionMs,
    queueCompletionWaitMs,
    mapReadbackWaitMs,
    resultDecodeMs,
    cpuSpotCheckSelectionMs,
    cpuReferenceHashingAndComparisonMs,
    cpuComparisonMs,
    totalElapsedMs,
    timingSourceNote: "Browser-observed wall-clock timing; one command submission and one readback cover all logical dispatches.",
  };
  const pipelineDiagnostics = withThisRunTimings(runDiagnostics, {
    bufferSetupMs,
    dispatchMs: gpuElapsedMs,
    readbackMs,
    cpuComparisonMs,
    totalElapsedMs,
  });
  const pipelineSetupMs =
    pipelineDiagnostics.thisRunShaderGenerationMs +
    pipelineDiagnostics.thisRunShaderModuleCreationMs +
    pipelineDiagnostics.thisRunPipelineCreationMs;
  const hashWorkExcludingPipelineMs = bufferSetupMs + gpuElapsedMs + readbackMs + cpuComparisonMs;

  return {
    stage: "webgpu-whirlpool-multi-dispatch-submission",
    shaderStatus: mismatches.length === 0
      ? "Real WebGPU Whirlpool hashing: Verified for multi-dispatch submission"
      : "Real WebGPU Whirlpool hashing: Failed multi-dispatch verification",
    nonceStart: tasks[0].nonce >>> 0,
    nonceCount: tasks.length,
    batchSize: logicalBatchSize,
    dispatchCount: logicalPlan.length,
    logicalDispatchCount: logicalPlan.length,
    physicalSubmissionCount: 1,
    queueWaitCount: 1,
    readbackCount: 1,
    commandBufferCount: 1,
    workgroupSize: selectedWorkgroupSize,
    totalWorkgroups: logicalPlan.reduce((total, entry) => total + entry.workgroupCount, 0),
    totalLaunchedInvocations: logicalPlan.reduce((total, entry) => total + entry.totalLaunchedInvocations, 0),
    totalActiveInvocations: tasks.length,
    paddedInactiveInvocations: logicalPlan.reduce((total, entry) => total + entry.paddedInactiveInvocations, 0),
    resultsPerDispatch: tasks.length / logicalPlan.length,
    resultCount: tasks.length,
    returnedResultCount: gpuRows.length,
    combinedOutputByteSize: outputSize,
    outputOffsetMap: logicalPlan.map((entry) => ({
      dispatchIndex: entry.dispatchIndex,
      taskOffset: entry.taskOffset,
      outputOffset: entry.outputOffset,
      outputByteOffset: entry.outputByteOffset,
      outputByteLength: entry.outputByteLength,
      hashesSubmitted: entry.count,
      workgroupSize: entry.workgroupSize,
      workgroupCount: entry.workgroupCount,
      totalLaunchedInvocations: entry.totalLaunchedInvocations,
      activeInvocations: entry.activeInvocations,
      paddedInactiveInvocations: entry.paddedInactiveInvocations,
    })),
    deterministicResultOrdering: "Output index equals global task index, which preserves ascending synthetic nonce order.",
    mismatchesAgainstCpuReference: mismatches.length,
    cpuComparisonMode: spotCheckIndexes === null ? "full" : "spot-check",
    spotCheckIndexes: spotCheckIndexes === null ? null : spotCheckIndexes,
    spotCheckCount: spotCheckIndexes === null ? results.length : spotCheckIndexes.length,
    spotCheckMismatches: mismatches.length,
    firstMismatch: mismatches[0] || null,
    gpuElapsedMs,
    bufferSetupMs,
    readbackMs,
    cpuComparisonMs,
    pipelineSetupMs,
    hashWorkExcludingPipelineMs,
    verifiedHashesPerSecondExcludingPipeline: hashWorkExcludingPipelineMs > 0 ? (results.length * 1000) / hashWorkExcludingPipelineMs : 0,
    verifiedHashesPerSecondIncludingPipeline: totalElapsedMs > 0 ? (results.length * 1000) / totalElapsedMs : 0,
    totalElapsedMs,
    pipelineReused: runDiagnostics.pipelineReused,
    pipelineCacheStatus: runDiagnostics.pipelineCacheStatus,
    pipelineDiagnostics,
    outputReadback: true,
    validHashBenchmark: true,
    profilingOnly: false,
    hostPhases,
    perLogicalDispatch,
    results,
    gpuRows,
  };
}
