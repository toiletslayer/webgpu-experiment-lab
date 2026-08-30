import { bytesToHex, capstashPoWInternalHex, patchNonce } from "../cpu/capstash-pow.js";
import { fixtureHeaderBytes, WHIRLPOOL_HEADER_FIXTURES } from "../vectors/whirlpool-fixtures.js";
import {
  DEFAULT_WGSL_BATCH_SIZE,
  runWebGPUWhirlpoolFixtureSuite,
  verificationPresetById,
} from "./whirlpool-fixture-suite.js";
import { MAX_UINT32, MAX_WHIRLPOOL_BATCH_TASKS, WGSL_WORKGROUP_SIZE, runWebGPUWhirlpoolBatch, validateWebGPUWorkgroupSize, workgroupInvocationPlan } from "./whirlpool-minimal.js";

export const SYNTHETIC_HASH_COUNT_OPTIONS = Object.freeze([256, 512, 1024, 2048, 4096, 8192]);
export const DEFAULT_SYNTHETIC_HASH_COUNT = 1024;
export const SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS = Object.freeze([64, 128, 256, 512, 1024]);
export const DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE = 64;
export const SYNTHETIC_FIXTURE_ID = "realistic-fields";
export const SYNTHETIC_CORRECTNESS_GATE_PRESET_ID = "ten-fixtures-one-nonce";
export const SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE = 64;
export const SYNTHETIC_RESULT_TYPE = "synthetic-browser-research";
export const SYNTHETIC_REPEATED_RUN_RESULT_TYPE = "synthetic-browser-repeated-run-summary";
export const SYNTHETIC_ALGORITHM_ID = "capstash-whirlpool80-fold-v1";
export const SYNTHETIC_DOCUMENTED_RESULT = Object.freeze({
  label: "2026-07-18 manual synthetic 256 b64",
  browser: "Microsoft Edge 150 / Chromium 150",
  os: "Windows 10",
  adapter: "NVIDIA Blackwell",
  vendor: "NVIDIA",
  hashCount: 256,
  dispatchBatchSize: 64,
  dispatchCount: 4,
  hashesPerDispatch: 64,
  fixtureName: "Realistic-looking CapStash fields",
  nonceStart: 5,
  nonceEnd: 260,
  correctnessGate: "passed",
  correctnessGatePreset: "10 fixtures x 1 nonce",
  correctnessGateBatchSize: 64,
  spotChecksSelected: 5,
  spotChecksPassed: 5,
  mismatches: 0,
  pipelineError: "none",
  bufferSetupMs: 0.8,
  dispatchMs: 13.6,
  readbackMs: 3.7,
  cpuSpotCheckMs: 2.9,
  totalElapsedMs: 23.6,
  hashesPerSecondIncludingPipeline: 10800,
  hashesPerSecondExcludingPipelineAndCpuSpotCheck: 14100,
  pipelineCacheStatus: "hit",
  thisRunPipelineCreationMs: 0,
  historicalColdCompileMs: 26462.9,
  historicalColdCompileAppliesToCurrentRun: false,
});
export const SYNTHETIC_LADDER_RESULTS = Object.freeze([
  Object.freeze({ hashCount: 256, batchSize: 64, dispatchCount: 4, result: "passed", hpsIncluding: "10.8 kH/s", hpsExcluding: "14.1 kH/s" }),
  Object.freeze({ hashCount: 512, batchSize: 64, dispatchCount: 8, result: "passed", hpsIncluding: "12.0 kH/s", hpsExcluding: "14.7 kH/s" }),
  Object.freeze({ hashCount: 1024, batchSize: 64, dispatchCount: 16, result: "passed", hpsIncluding: "11.4 kH/s", hpsExcluding: "13.4 kH/s" }),
  Object.freeze({ hashCount: 1024, batchSize: 128, dispatchCount: 8, result: "passed", hpsIncluding: "25.9 kH/s", hpsExcluding: "33.6 kH/s" }),
  Object.freeze({ hashCount: 2048, batchSize: 128, dispatchCount: 16, result: "passed", hpsIncluding: "21.6 kH/s", hpsExcluding: "27.0 kH/s" }),
  Object.freeze({ hashCount: 4096, batchSize: 256, dispatchCount: 16, result: "passed", hpsIncluding: "38.7 kH/s", hpsExcluding: "50.1 kH/s" }),
  Object.freeze({ hashCount: 8192, batchSize: 512, dispatchCount: 16, result: "passed repeatedly", hpsIncluding: "74.36 kH/s mean", hpsExcluding: "117.4 kH/s mean" }),
]);
export const SYNTHETIC_8192_REPEATED_RUNS = Object.freeze([
  Object.freeze({ hpsIncluding: 75300, hpsExcluding: 121000, dispatchMs: 57.9, totalElapsedMs: 108.8 }),
  Object.freeze({ hpsIncluding: 74500, hpsExcluding: 113000, dispatchMs: 61.6, totalElapsedMs: 109.9 }),
  Object.freeze({ hpsIncluding: 75200, hpsExcluding: 120000, dispatchMs: 58.1, totalElapsedMs: 108.9 }),
  Object.freeze({ hpsIncluding: 72100, hpsExcluding: 116000, dispatchMs: 58.1, totalElapsedMs: 113.6 }),
  Object.freeze({ hpsIncluding: 74700, hpsExcluding: 117000, dispatchMs: 59.0, totalElapsedMs: 109.7 }),
]);

export function syntheticFixture(fixtures = WHIRLPOOL_HEADER_FIXTURES) {
  return fixtures.find((fixture) => fixture.id === SYNTHETIC_FIXTURE_ID) || fixtures[0];
}

export function syntheticDispatchCount(hashCount, dispatchBatchSize) {
  if (!Number.isInteger(hashCount) || hashCount <= 0) return 0;
  return Math.ceil(hashCount / Math.max(1, dispatchBatchSize));
}

export function syntheticBatchPlan(hashCount, dispatchBatchSize) {
  const dispatches = syntheticDispatchCount(hashCount, dispatchBatchSize);
  return Array.from({ length: dispatches }, (_, dispatchIndex) => {
    const startIndex = dispatchIndex * dispatchBatchSize;
    const count = Math.min(dispatchBatchSize, hashCount - startIndex);
    return {
      dispatchIndex,
      startIndex,
      count,
      endIndex: startIndex + count - 1,
      partial: count < dispatchBatchSize,
    };
  });
}

export function syntheticWorkgroupPlan(hashesInDispatch, workgroupSize = WGSL_WORKGROUP_SIZE) {
  const plan = workgroupInvocationPlan(hashesInDispatch, workgroupSize);
  return {
    wgslWorkgroupSize: plan.wgslWorkgroupSize,
    hashesInDispatch,
    workgroupsDispatched: plan.workgroupCount,
    totalLaunchedInvocations: plan.totalLaunchedInvocations,
    activeInvocations: plan.activeInvocations,
    paddedInactiveInvocations: plan.paddedInactiveInvocations,
    activeInvocationsInPartialFinalWorkgroup: plan.partialFinalWorkgroupInvocations,
  };
}

export function validateWorkgroupLimit(workgroupSize, deviceLimits = {}) {
  return validateWebGPUWorkgroupSize(workgroupSize, deviceLimits);
}

export function calculateStats(values) {
  const clean = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  const count = clean.length;
  if (count === 0) {
    return { count: 0, insufficient: true };
  }
  const mean = clean.reduce((sum, value) => sum + value, 0) / count;
  const median = count % 2 === 1
    ? clean[(count - 1) / 2]
    : (clean[count / 2 - 1] + clean[count / 2]) / 2;
  const variance = count > 1
    ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)
    : 0;
  const sampleStandardDeviation = Math.sqrt(variance);
  return {
    count,
    mean,
    median,
    minimum: clean[0],
    maximum: clean[count - 1],
    sampleStandardDeviation,
    sampleCoefficientOfVariation: mean !== 0 ? sampleStandardDeviation / mean : 0,
    insufficient: count < 2,
  };
}

export function variationLabel(coefficientOfVariation) {
  if (!Number.isFinite(coefficientOfVariation)) return "insufficient repeated runs for variability statistics";
  const percent = coefficientOfVariation * 100;
  if (percent < 3) return "low observed variation";
  if (percent <= 10) return "moderate observed variation";
  return "high observed variation";
}

export function buildSyntheticNonceRange({
  hashCount = DEFAULT_SYNTHETIC_HASH_COUNT,
  nonceStart = syntheticFixture().nonceStart,
} = {}) {
  if (!Number.isInteger(hashCount) || hashCount <= 0) {
    throw new Error(`synthetic hash count must be a positive integer, got ${hashCount}`);
  }
  if (!Number.isInteger(nonceStart) || nonceStart < 0 || nonceStart > MAX_UINT32) {
    throw new Error(`synthetic nonce start must be uint32, got ${nonceStart}`);
  }
  const nonceEnd = nonceStart + hashCount - 1;
  if (nonceEnd > MAX_UINT32) {
    throw new Error(`synthetic nonce range overflows uint32: start=${nonceStart} count=${hashCount}`);
  }
  return {
    nonceStart: nonceStart >>> 0,
    nonceEnd: nonceEnd >>> 0,
    hashCount,
  };
}

export function selectSyntheticSpotCheckIndexes(hashCount) {
  if (!Number.isInteger(hashCount) || hashCount <= 0) return [];
  const indexes = new Set([0, Math.min(1, hashCount - 1), Math.floor(hashCount / 2), hashCount - 1]);
  const pseudoRandom = Math.imul(hashCount ^ 0x9e3779b9, 2654435761) >>> 0;
  indexes.add(pseudoRandom % hashCount);
  return Array.from(indexes).sort((a, b) => a - b);
}

export function buildSyntheticTasks({
  fixture = syntheticFixture(),
  nonceStart = fixture.nonceStart,
  hashCount = DEFAULT_SYNTHETIC_HASH_COUNT,
  startIndex = 0,
  count = hashCount,
} = {}) {
  buildSyntheticNonceRange({ hashCount, nonceStart });
  const header80 = fixtureHeaderBytes(fixture);
  return Array.from({ length: count }, (_, offset) => {
    const globalIndex = startIndex + offset;
    return {
      header80,
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      nonceStart,
      nonceCount: hashCount,
      nonce: (nonceStart + globalIndex) >>> 0,
      syntheticIndex: globalIndex,
      caseKey: `synthetic:${fixture.id}:${nonceStart}:${hashCount}`,
    };
  });
}

export function formatSyntheticMismatch(mismatch) {
  if (!mismatch) return "None";
  return {
    syntheticIndex: mismatch.syntheticIndex,
    indexWithinDispatch: mismatch.index,
    fixtureId: mismatch.fixtureId,
    fixtureName: mismatch.fixtureName,
    nonce: mismatch.nonce,
    dispatchIndex: mismatch.dispatchIndex,
    batchSize: mismatch.batchSize,
    patchedHeaderHex: mismatch.patchedHeaderHex,
    cpuInternalHex: mismatch.cpuInternalHex,
    wgslInternalHex: mismatch.gpuInternalHex,
    byteOrderNote: "folded 256-bit hash is compared in internal byte order from the CapStash PoW fold",
  };
}

function isFiniteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function validateSyntheticBenchmarkResult(result) {
  const issues = [];
  if (!result || result.stage !== "webgpu-synthetic-nonce-benchmark") {
    return { valid: false, status: "invalid telemetry", issues: ["missing synthetic benchmark result"] };
  }
  const expectedDispatchCount = syntheticDispatchCount(result.totalRequested, result.dispatchBatchSize);
  if (result.valid && result.resultCount !== result.totalRequested) {
    issues.push("valid result must complete exactly the requested hash count");
  }
  if (result.dispatchCount !== expectedDispatchCount) {
    issues.push(`dispatch count must equal ceil(hashCount / batchSize): expected ${expectedDispatchCount}, got ${result.dispatchCount}`);
  }
  if (result.valid && !result.correctnessGate?.passed) {
    issues.push("valid result requires a passed correctness gate");
  }
  if (result.valid && result.mismatchesAgainstCpuReference !== 0) {
    issues.push("valid result requires zero CPU spot-check failures");
  }
  if (result.valid && result.firstMismatch) {
    issues.push("valid result must not include a first mismatch");
  }
  if (result.valid && (result.firstPipelineError || result.pipelineError || result.pipelineDiagnostics?.validationError)) {
    issues.push("valid result must not include a pipeline error");
  }
  for (const [label, value] of [
    ["buffer setup", result.bufferSetupMs],
    ["dispatch", result.gpuElapsedMs],
    ["readback", result.readbackMs],
    ["CPU spot-check", result.cpuComparisonMs],
    ["total elapsed", result.totalElapsedMs],
    ["H/s including pipeline", result.verifiedHashesPerSecondIncludingPipeline],
    ["H/s excluding pipeline", result.verifiedHashesPerSecondExcludingPipeline],
  ]) {
    if (!isFiniteNonnegative(value)) {
      issues.push(`${label} timing/rate must be finite and nonnegative`);
    }
  }
  if (Number.isFinite(result.totalElapsedMs) && Number.isFinite(result.gpuElapsedMs) && result.totalElapsedMs < result.gpuElapsedMs) {
    issues.push("total elapsed must be greater than or equal to dispatch time");
  }
  if (
    Number.isFinite(result.verifiedHashesPerSecondIncludingPipeline) &&
    Number.isFinite(result.verifiedHashesPerSecondExcludingPipeline) &&
    result.verifiedHashesPerSecondIncludingPipeline > result.verifiedHashesPerSecondExcludingPipeline
  ) {
    issues.push("including-overhead H/s must not exceed excluding-overhead H/s");
  }
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "valid telemetry" : "invalid telemetry",
    issues,
  };
}

export async function runSyntheticCorrectnessGate({
  gpu = navigator.gpu,
  workgroupSize = WGSL_WORKGROUP_SIZE,
  onProgress = () => {},
} = {}) {
  const subset = verificationPresetById(SYNTHETIC_CORRECTNESS_GATE_PRESET_ID);
  const result = await runWebGPUWhirlpoolFixtureSuite({
    subset,
    batchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
    workgroupSize,
    gpu,
    onProgress,
  });
  const passed =
    result.resultCount > 0 &&
    result.mismatchesAgainstCpuReference === 0 &&
    result.fixtureCasesFailedBeforeDispatch === 0 &&
    !result.firstPipelineError;
  return {
    passed,
    presetId: subset.id,
    presetLabel: subset.label,
    batchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
    workgroupSize,
    result,
  };
}

export async function runSyntheticNonceBenchmark({
  gpu = navigator.gpu,
  fixture = syntheticFixture(),
  hashCount = DEFAULT_SYNTHETIC_HASH_COUNT,
  dispatchBatchSize = DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE,
  nonceStart = fixture.nonceStart,
  correctnessGate = null,
  requireCorrectnessGate = true,
  onProgress = () => {},
} = {}) {
  if (!SYNTHETIC_HASH_COUNT_OPTIONS.includes(hashCount)) {
    throw new Error(`unsupported synthetic hash count: ${hashCount}`);
  }
  if (!SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS.includes(dispatchBatchSize)) {
    throw new Error(`unsupported synthetic dispatch batch size: ${dispatchBatchSize}`);
  }
  if (dispatchBatchSize > MAX_WHIRLPOOL_BATCH_TASKS) {
    throw new Error(`synthetic dispatch batch size exceeds WGSL batch runner limit: ${dispatchBatchSize}`);
  }
  const range = buildSyntheticNonceRange({ hashCount, nonceStart });
  let gate = correctnessGate;
  if (!gate) {
    gate = await runSyntheticCorrectnessGate({
      gpu,
      onProgress(progress) {
        onProgress({
          stage: "synthetic-correctness-gate",
          fixtureName: progress.fixtureName,
          completed: progress.completedCases || 0,
          totalRequested: progress.totalCases || 0,
          nonceCount: progress.nonceCount,
        });
      },
    });
  }
  if (requireCorrectnessGate && !gate.passed) {
    return {
      stage: "webgpu-synthetic-nonce-benchmark",
      valid: false,
      blocked: true,
      reason: "Synthetic benchmark blocked because the WGSL correctness gate failed.",
      correctnessGate: gate,
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      nonceStart: range.nonceStart,
      nonceEnd: range.nonceEnd,
      totalRequested: hashCount,
      resultCount: 0,
      dispatchBatchSize,
      dispatchCount: 0,
      resultsPerDispatch: 0,
      mismatchesAgainstCpuReference: 0,
      spotCheckCount: 0,
      firstMismatch: null,
      totalElapsedMs: gate.result?.totalElapsedMs || 0,
    };
  }

  const totalStart = performance.now();
  const spotCheckIndexes = selectSyntheticSpotCheckIndexes(hashCount);
  const spotCheckSet = new Set(spotCheckIndexes);
  const dispatchCount = syntheticDispatchCount(hashCount, dispatchBatchSize);
  const spotCheckResults = [];
  let resultCount = 0;
  let returnedResultCount = 0;
  let gpuElapsedMs = 0;
  let bufferSetupMs = 0;
  let readbackMs = 0;
  let cpuComparisonMs = 0;
  let pipelineSetupMs = 0;
  let firstMismatch = null;
  let pipelineDiagnostics = null;
  let pipelineReused = false;
  let pipelineCacheStatus = "miss";

  for (let startIndex = 0; startIndex < hashCount; startIndex += dispatchBatchSize) {
    const dispatchIndex = Math.floor(startIndex / dispatchBatchSize);
    const count = Math.min(dispatchBatchSize, hashCount - startIndex);
    const localSpotChecks = [];
    for (let localIndex = 0; localIndex < count; localIndex += 1) {
      if (spotCheckSet.has(startIndex + localIndex)) {
        localSpotChecks.push(localIndex);
      }
    }
    const tasks = buildSyntheticTasks({ fixture, nonceStart, hashCount, startIndex, count });
    const batchResult = await runWebGPUWhirlpoolBatch({ tasks, gpu, cpuCheckIndexes: localSpotChecks });

    resultCount += batchResult.resultCount;
    returnedResultCount += batchResult.returnedResultCount;
    gpuElapsedMs += batchResult.gpuElapsedMs;
    bufferSetupMs += batchResult.bufferSetupMs;
    readbackMs += batchResult.readbackMs;
    cpuComparisonMs += batchResult.cpuComparisonMs;
    pipelineSetupMs += batchResult.pipelineSetupMs;
    pipelineDiagnostics = batchResult.pipelineDiagnostics || pipelineDiagnostics;
    pipelineReused = batchResult.pipelineReused;
    pipelineCacheStatus = batchResult.pipelineCacheStatus;

    for (const row of batchResult.results) {
      const patched = Uint8Array.from(row.header80);
      patchNonce(patched, row.nonce);
      const enriched = {
        ...row,
        syntheticIndex: startIndex + row.index,
        dispatchIndex,
        indexWithinDispatch: row.index,
        batchSize: dispatchBatchSize,
        patchedHeaderHex: bytesToHex(patched),
      };
      spotCheckResults.push(enriched);
      if (!enriched.match && !firstMismatch) {
        firstMismatch = enriched;
      }
    }

    onProgress({
      stage: "webgpu-synthetic-nonce-benchmark",
      fixtureName: fixture.name,
      dispatchIndex,
      dispatchCount,
      completed: resultCount,
      totalRequested: hashCount,
      spotCheckCount: spotCheckResults.length,
      mismatchesAgainstCpuReference: firstMismatch ? 1 : 0,
    });
    if (firstMismatch) break;
  }

  const totalElapsedMs = performance.now() - totalStart;
  const hashWorkExcludingPipelineMs = bufferSetupMs + gpuElapsedMs + readbackMs;
  const mismatches = spotCheckResults.filter((row) => !row.match);
  const valid = gate.passed && mismatches.length === 0 && resultCount === hashCount;
  const firstSpotCheck = spotCheckResults[0];
  const header80 = fixtureHeaderBytes(fixture);
  const firstPatched = Uint8Array.from(header80);
  patchNonce(firstPatched, range.nonceStart);

  return {
    stage: "webgpu-synthetic-nonce-benchmark",
    modeLabel: "Controlled synthetic nonce-batch benchmark",
    validityLabel: valid
      ? "Synthetic benchmark valid after correctness gate and CPU spot checks"
      : "Synthetic benchmark invalid; see mismatch or completion details",
    valid,
    blocked: false,
    correctnessGate: gate,
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    fixtureHeaderHex: fixture.headerHex,
    firstPatchedHeaderHex: bytesToHex(firstPatched),
    nonceStart: range.nonceStart,
    nonceEnd: range.nonceEnd,
    totalRequested: hashCount,
    resultCount,
    returnedResultCount,
    dispatchBatchSize,
    dispatchCount,
    resultsPerDispatch: dispatchCount > 0 ? resultCount / dispatchCount : 0,
    gpuElapsedMs,
    bufferSetupMs,
    readbackMs,
    cpuComparisonMs,
    pipelineSetupMs,
    hashWorkExcludingPipelineMs,
    verifiedHashesPerSecondExcludingPipeline: hashWorkExcludingPipelineMs > 0 ? (resultCount * 1000) / hashWorkExcludingPipelineMs : 0,
    verifiedHashesPerSecondIncludingPipeline: totalElapsedMs > 0 ? (resultCount * 1000) / totalElapsedMs : 0,
    totalElapsedMs,
    pipelineReused,
    pipelineCacheStatus,
    pipelineDiagnostics,
    workgroup: {
      ...syntheticWorkgroupPlan(Math.min(dispatchBatchSize, hashCount)),
      maxComputeInvocationsPerWorkgroup: pipelineDiagnostics?.deviceLimits?.maxComputeInvocationsPerWorkgroup ?? null,
      workgroupLimitValid: validateWorkgroupLimit(WGSL_WORKGROUP_SIZE, pipelineDiagnostics?.deviceLimits).valid,
    },
    spotCheckIndexes,
    spotCheckCount: spotCheckResults.length,
    spotCheckStatus: mismatches.length === 0
      ? `CPU spot-check passed for ${spotCheckResults.length} selected nonces`
      : `CPU spot-check failed with ${mismatches.length} mismatch(es)`,
    spotCheckResults: spotCheckResults.map((row) => ({
      syntheticIndex: row.syntheticIndex,
      nonce: row.nonce,
      cpuInternalHex: row.cpuInternalHex,
      gpuInternalHex: row.gpuInternalHex,
      match: row.match,
    })),
    firstSpotCheckCpuInternalHex: firstSpotCheck?.cpuInternalHex || capstashPoWInternalHex(firstPatched),
    mismatchesAgainstCpuReference: mismatches.length,
    firstMismatch: firstMismatch ? formatSyntheticMismatch(firstMismatch) : null,
    note: "Controlled local browser research mode only; no target comparison, pool connection, live network submission, wallet, payout, or mining loop.",
  };
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function limitObject(limits) {
  if (!limits || typeof limits !== "object") return null;
  const selected = {
    maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
    maxComputeWorkgroupSizeY: limits.maxComputeWorkgroupSizeY,
    maxComputeWorkgroupSizeZ: limits.maxComputeWorkgroupSizeZ,
    maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxBufferSize: limits.maxBufferSize,
  };
  return Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== undefined));
}

export function buildSyntheticBenchmarkExport({
  result,
  capabilities = null,
  userAgent = "unavailable",
  projectVersion = "0.1.0",
  gitCommit = null,
  timestamp = new Date().toISOString(),
} = {}) {
  if (!result || result.stage !== "webgpu-synthetic-nonce-benchmark") {
    throw new Error("synthetic benchmark export requires a completed synthetic benchmark result");
  }
  const diagnostics = result.pipelineDiagnostics || {};
  const gateResult = result.correctnessGate?.result || {};
  const spotChecksFailed = result.mismatchesAgainstCpuReference || 0;
  const spotChecksSelected = result.spotCheckCount || 0;
  const validation = validateSyntheticBenchmarkResult(result);
  const exportIsValid = Boolean(result.valid) && validation.valid;
  return {
    schemaVersion: 1,
    resultType: SYNTHETIC_RESULT_TYPE,
    telemetryStatus: validation.status,
    telemetryValidationIssues: validation.issues,
    environment: {
      timestamp,
      userAgent,
      webgpuVendor: capabilities?.adapterInfo?.vendor || "unavailable",
      adapterDescription: capabilities?.adapterInfo
        ? [capabilities.adapterInfo.vendor, capabilities.adapterInfo.architecture, capabilities.adapterInfo.device, capabilities.adapterInfo.description].filter(Boolean).join(" / ") || "adapter available"
        : "unavailable",
      adapterLimits: limitObject(capabilities?.limits || diagnostics.adapterLimits),
      deviceLimits: limitObject(diagnostics.deviceLimits),
      projectVersion,
      gitCommit,
      gitCommitSource: gitCommit ? "provided" : "not available in static browser app",
    },
    mode: {
      executionMode: "webgpu-synthetic-nonce-benchmark",
      fixtureId: result.fixtureId,
      fixtureName: result.fixtureName,
      headerHex: result.fixtureHeaderHex,
      firstPatchedHeaderHex: result.firstPatchedHeaderHex,
      startNonce: result.nonceStart,
      endNonce: result.nonceEnd,
      hashesRequested: result.totalRequested,
      hashesCompleted: result.resultCount,
      dispatchBatchSize: result.dispatchBatchSize,
      dispatchCount: result.dispatchCount,
      averageHashesPerDispatch: result.resultsPerDispatch,
      algorithmId: SYNTHETIC_ALGORITHM_ID,
      wgslWorkgroupSize: result.workgroup?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
      hashesInRepresentativeDispatch: result.workgroup?.hashesInDispatch ?? result.dispatchBatchSize,
      workgroupsInRepresentativeDispatch: result.workgroup?.workgroupsDispatched ?? result.dispatchBatchSize,
      activeInvocationsInPartialFinalWorkgroup: result.workgroup?.activeInvocationsInPartialFinalWorkgroup ?? WGSL_WORKGROUP_SIZE,
      maxDeviceInvocationsPerWorkgroup: result.workgroup?.maxComputeInvocationsPerWorkgroup ?? null,
      workgroupLimitValid: result.workgroup?.workgroupLimitValid ?? true,
      overflowStatus: result.blocked ? "blocked-before-dispatch" : "range-checked-no-overflow",
    },
    correctness: {
      valid: exportIsValid,
      correctnessGateStatus: result.correctnessGate?.passed ? "passed" : "failed",
      correctnessGatePreset: result.correctnessGate?.presetLabel || null,
      correctnessGateBatchSize: result.correctnessGate?.batchSize || null,
      correctnessGateFixtureCount: gateResult.fixtureCasesExecuted || 0,
      correctnessGateMatches: gateResult.resultCount || 0,
      correctnessGateMismatches: gateResult.mismatchesAgainstCpuReference || 0,
      cpuSpotChecksSelected: spotChecksSelected,
      cpuSpotChecksPassed: Math.max(0, spotChecksSelected - spotChecksFailed),
      cpuSpotChecksFailed: spotChecksFailed,
      firstMismatch: result.firstMismatch || null,
      overflowStatus: result.blocked ? "blocked-before-dispatch" : "range-checked-no-overflow",
    },
    timing: {
      pipelineKey: diagnostics.pipelineKey || "whirlpool-batched",
      syntheticBufferSetupMs: safeNumber(result.bufferSetupMs),
      syntheticDispatchLoopMs: safeNumber(result.gpuElapsedMs),
      syntheticReadbackMs: safeNumber(result.readbackMs),
      syntheticCpuSpotCheckMs: safeNumber(result.cpuComparisonMs),
      syntheticTotalElapsedMs: safeNumber(result.totalElapsedMs),
      gateBufferSetupMs: safeNumber(gateResult.bufferSetupMs),
      gateDispatchMs: safeNumber(gateResult.gpuElapsedMs),
      gateReadbackMs: safeNumber(gateResult.readbackMs),
      gateCpuComparisonMs: safeNumber(gateResult.cpuComparisonMs),
      gateTotalElapsedMs: safeNumber(gateResult.totalElapsedMs),
      originalColdCompileMs: safeNumber(diagnostics.coldPipelineCreationMs, null),
      coldCompileAppliesToThisRun: Boolean(diagnostics.coldPipelineCreationAppliesToCurrentRun),
      pipelineCacheStatus: result.pipelineCacheStatus || diagnostics.pipelineCacheStatus || "unknown",
      thisRunPipelineCreationMs: safeNumber(diagnostics.thisRunPipelineCreationMs, 0),
      bufferSetupMs: safeNumber(result.bufferSetupMs),
      dispatchMs: safeNumber(result.gpuElapsedMs),
      readbackMs: safeNumber(result.readbackMs),
      cpuSpotCheckMs: safeNumber(result.cpuComparisonMs),
      diagnosticTotalMs: safeNumber(diagnostics.thisRunTotalElapsedMs, result.totalElapsedMs),
      appLevelTotalElapsedMs: safeNumber(result.totalElapsedMs),
      hashesPerSecondIncludingPipeline: safeNumber(result.verifiedHashesPerSecondIncludingPipeline),
      hashesPerSecondExcludingPipeline: safeNumber(result.verifiedHashesPerSecondExcludingPipeline),
    },
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      walletSupport: false,
      payoutTracking: false,
      networkSubmission: false,
      remoteTelemetryUpload: false,
      resultType: SYNTHETIC_RESULT_TYPE,
    },
  };
}

export function syntheticConfigurationIdentity(exportObject) {
  return {
    mode: exportObject?.mode?.executionMode,
    fixtureId: exportObject?.mode?.fixtureId,
    hashesRequested: exportObject?.mode?.hashesRequested,
    dispatchBatchSize: exportObject?.mode?.dispatchBatchSize,
    correctnessGatePreset: exportObject?.correctness?.correctnessGatePreset,
    correctnessGateBatchSize: exportObject?.correctness?.correctnessGateBatchSize,
    adapterDescription: exportObject?.environment?.adapterDescription || "unavailable",
    webgpuVendor: exportObject?.environment?.webgpuVendor || "unavailable",
    pipelineKey: exportObject?.timing?.pipelineKey || "whirlpool-batched",
    algorithmId: exportObject?.mode?.algorithmId || SYNTHETIC_ALGORITHM_ID,
    wgslWorkgroupSize: exportObject?.mode?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
  };
}

function identityKey(identity) {
  return JSON.stringify(identity);
}

export function compatibleSyntheticRuns(exports, referenceExport = exports[0]) {
  if (!referenceExport) return [];
  const referenceKey = identityKey(syntheticConfigurationIdentity(referenceExport));
  return exports.filter((entry) => identityKey(syntheticConfigurationIdentity(entry)) === referenceKey);
}

export function buildSyntheticRepeatedRunSummary(exports, referenceExport = exports[0]) {
  const compatible = compatibleSyntheticRuns(exports, referenceExport);
  const validRuns = compatible.filter((entry) => entry.telemetryStatus === "valid telemetry" && entry.correctness?.valid);
  const stats = {
    hpsIncludingPipeline: calculateStats(validRuns.map((entry) => entry.timing.hashesPerSecondIncludingPipeline)),
    hpsExcludingPipelineAndCpuSpotCheck: calculateStats(validRuns.map((entry) => entry.timing.hashesPerSecondExcludingPipeline)),
    dispatchMs: calculateStats(validRuns.map((entry) => entry.timing.syntheticDispatchLoopMs ?? entry.timing.dispatchMs)),
    totalElapsedMs: calculateStats(validRuns.map((entry) => entry.timing.syntheticTotalElapsedMs ?? entry.timing.appLevelTotalElapsedMs)),
    readbackMs: calculateStats(validRuns.map((entry) => entry.timing.syntheticReadbackMs ?? entry.timing.readbackMs)),
    bufferSetupMs: calculateStats(validRuns.map((entry) => entry.timing.syntheticBufferSetupMs ?? entry.timing.bufferSetupMs)),
    cpuSpotCheckMs: calculateStats(validRuns.map((entry) => entry.timing.syntheticCpuSpotCheckMs ?? entry.timing.cpuSpotCheckMs)),
  };
  const cv = stats.hpsIncludingPipeline.sampleCoefficientOfVariation;
  return {
    schemaVersion: 1,
    resultType: SYNTHETIC_REPEATED_RUN_RESULT_TYPE,
    configuration: syntheticConfigurationIdentity(referenceExport),
    runCount: compatible.length,
    validRunCount: validRuns.length,
    invalidRunCount: compatible.length - validRuns.length,
    individualResultTimestamps: compatible.map((entry) => entry.environment.timestamp),
    statisticsStatus: validRuns.length < 2
      ? "Insufficient repeated runs for variability statistics"
      : "Repeated-run statistics available",
    interpretation: validRuns.length < 2
      ? "Insufficient repeated runs for variability statistics"
      : variationLabel(cv),
    statistics: stats,
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      walletSupport: false,
      payoutTracking: false,
      networkSubmission: false,
      remoteTelemetryUpload: false,
      resultType: SYNTHETIC_REPEATED_RUN_RESULT_TYPE,
    },
  };
}

export function serializeSyntheticRepeatedRunSummary(summary) {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function syntheticRepeatedRunSummaryFilename(summary) {
  const count = summary?.configuration?.hashesRequested || "unknown";
  const batch = summary?.configuration?.dispatchBatchSize || "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `caps-webgpu-synthetic-summary-${count}-batch-${batch}-${stamp}.json`;
}

export function serializeSyntheticBenchmarkExport(exportObject) {
  return `${JSON.stringify(exportObject, null, 2)}\n`;
}

export function syntheticBenchmarkExportFilename(exportObject) {
  const hashCount = exportObject?.mode?.hashesRequested || "unknown";
  const batchSize = exportObject?.mode?.dispatchBatchSize || "unknown";
  const timestamp = String(exportObject?.environment?.timestamp || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-zT_Z-]/g, "-");
  return `caps-webgpu-synthetic-${hashCount}-batch-${batchSize}-${timestamp}.json`;
}

export function syntheticHistoryEntry(exportObject) {
  return {
    timestamp: exportObject.environment.timestamp,
    hashCount: exportObject.mode.hashesRequested,
    batchSize: exportObject.mode.dispatchBatchSize,
    gateStatus: exportObject.correctness.correctnessGateStatus,
    spotCheckStatus: exportObject.correctness.cpuSpotChecksFailed === 0 ? "passed" : "failed",
    dispatchCount: exportObject.mode.dispatchCount,
    dispatchMs: exportObject.timing.syntheticDispatchLoopMs,
    totalElapsedMs: exportObject.timing.syntheticTotalElapsedMs,
    hashesPerSecondIncludingPipeline: exportObject.timing.hashesPerSecondIncludingPipeline,
    hashesPerSecondExcludingPipeline: exportObject.timing.hashesPerSecondExcludingPipeline,
    pass: exportObject.correctness.valid,
  };
}

export function addSyntheticHistoryEntry(history, exportObject) {
  return [syntheticHistoryEntry(exportObject), ...history];
}

export function clearSyntheticHistory() {
  return [];
}
