import {
  DEFAULT_WGSL_CORE_VERIFICATION_SUBSET,
  FULL_CORE_VECTOR_VERIFICATION_PRESET,
  runWebGPUWhirlpoolFixtureSuite,
  verificationPresetById,
} from "./whirlpool-fixture-suite.js";
import {
  WGSL_WORKGROUP_SIZE,
  WORKGROUP_SIZE_OPTIONS,
  compileBatchedWhirlpoolPipeline,
  normalizeWorkgroupSize,
  validateWebGPUWorkgroupSize,
  whirlpoolPipelineKey,
  workgroupInvocationPlan,
} from "./whirlpool-minimal.js";
import {
  DEFAULT_PROFILING_PRESET,
  DEFAULT_PROFILING_READBACK_STRATEGY,
  DEFAULT_PROFILING_REPETITIONS,
  profilingPhysicalAccounting,
  profilingStatisticsForResults,
  runSyntheticProfiling,
  validateProfilingResult,
} from "./synthetic-profiling.js";
import { calculateStats, SYNTHETIC_ALGORITHM_ID, SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE } from "./synthetic-benchmark.js";
import { compareCoreVectorsToWgslSuite } from "../vectors/core-vector-compare.js";

export const WORKGROUP_EXPERIMENT_MODE = "webgpu-workgroup-experiment";
export const WORKGROUP_EXPERIMENT_RESULT_TYPE = "workgroup-size-experiment";
export const DEFAULT_EXPERIMENT_WORKGROUP_SIZE = WGSL_WORKGROUP_SIZE;
export const WORKGROUP_EXPERIMENT_REPETITION_OPTIONS = Object.freeze([1, 3, 5, 10]);
export const WORKGROUP_EXPERIMENT_ACTIONS = Object.freeze({
  compile: "compile-selected-variant",
  smallGate: "small-correctness-gate",
  full294: "full-294-vector-verification",
  performanceProfile: "performance-profile",
  matchedComparison: "matched-wg1-wg32-comparison",
});
export const WORKGROUP_EXPERIMENT_ACTION_LABELS = Object.freeze({
  [WORKGROUP_EXPERIMENT_ACTIONS.compile]: "Compile selected variant",
  [WORKGROUP_EXPERIMENT_ACTIONS.smallGate]: "Small correctness gate",
  [WORKGROUP_EXPERIMENT_ACTIONS.full294]: "Full 294-vector verification",
  [WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile]: "Performance profile",
  [WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison]: "Matched WG1 vs WG32 comparison",
});
export const FULL_294_WORKGROUP_EXPERIMENT_BATCH_SIZE = FULL_CORE_VECTOR_VERIFICATION_PRESET.expectedCoreVectorCount;
export const MATCHED_WORKGROUP_COMPARISON_SIZES = Object.freeze([1, 32]);
export const MATCHED_WORKGROUP_COMPARISON_RESULT_TYPE = "matched-workgroup-wg1-vs-wg32-comparison";
export const MATCHED_WORKGROUP_COMPARISON_THRESHOLDS = Object.freeze({
  maxTotalTimeCvPercent: 10,
  maxThroughputCvPercent: 10,
  minPracticalThroughputDifferencePercent: 5,
});
export { WORKGROUP_SIZE_OPTIONS, whirlpoolPipelineKey };

export function normalizeWorkgroupExperimentAction(actionType) {
  if (Object.values(WORKGROUP_EXPERIMENT_ACTIONS).includes(actionType)) {
    return actionType;
  }
  throw new Error(`Unknown workgroup experiment action: ${actionType}`);
}

export function createWorkgroupActionTelemetry({
  requestedActionType,
  runId,
  timestamp = new Date().toISOString(),
} = {}) {
  const normalized = normalizeWorkgroupExperimentAction(requestedActionType);
  return {
    requestedActionType: normalized,
    startedActionType: normalized,
    completedActionType: null,
    actionRequestTimestamp: timestamp,
    actionStartTimestamp: timestamp,
    actionCompletionTimestamp: null,
    actionRoutingConsistency: true,
    actionRoutingMessage: "Workgroup action requested and started with matching action type.",
    workgroupActionRunId: runId || null,
  };
}

export function completeWorkgroupActionTelemetry(
  telemetry,
  completedActionType,
  { timestamp = new Date().toISOString(), runId = telemetry?.workgroupActionRunId || null } = {},
) {
  const normalizedCompleted = normalizeWorkgroupExperimentAction(completedActionType);
  const actionRoutingConsistency =
    telemetry?.requestedActionType === telemetry?.startedActionType &&
    telemetry?.requestedActionType === normalizedCompleted &&
    (!runId || !telemetry?.workgroupActionRunId || telemetry.workgroupActionRunId === runId);
  return {
    ...telemetry,
    completedActionType: normalizedCompleted,
    actionCompletionTimestamp: timestamp,
    actionRoutingConsistency,
    actionRoutingMessage: actionRoutingConsistency
      ? "Requested, started, and completed workgroup action types match."
      : "Requested workgroup action did not match the executed action.",
    workgroupActionRunId: telemetry?.workgroupActionRunId || runId || null,
  };
}

export function workgroupExperimentStatusTemplate(workgroupSize = WGSL_WORKGROUP_SIZE) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  return {
    workgroupSize: selected,
    pipelineKey: whirlpoolPipelineKey(selected),
    reference: selected === WGSL_WORKGROUP_SIZE,
    status: selected === WGSL_WORKGROUP_SIZE
      ? "documented prior project verification; current browser session not run"
      : "not compiled",
    deviceSupport: "not checked",
    pipeline: "not compiled",
    smallGate: "not run",
    full294: selected === WGSL_WORKGROUP_SIZE ? "documented prior full 294 pass; current session not run" : "pending",
    profiling: "not run",
    performanceEligible: false,
    performanceTested: false,
    currentSessionFull294Passed: false,
    documentedPriorFull294Passed: selected === WGSL_WORKGROUP_SIZE,
  };
}

export function createWorkgroupStatusMap(sizes = WORKGROUP_SIZE_OPTIONS) {
  return Object.fromEntries(sizes.map((size) => [size, workgroupExperimentStatusTemplate(size)]));
}

export function workgroupDeviceSupportRows(deviceLimits = {}, sizes = WORKGROUP_SIZE_OPTIONS) {
  return sizes.map((size) => {
    const validation = validateWebGPUWorkgroupSize(size, deviceLimits);
    return {
      workgroupSize: size,
      pipelineKey: whirlpoolPipelineKey(size),
      supported: validation.valid,
      deviceSupport: validation.valid ? "supported" : "Unsupported by current WebGPU device limits",
      validation,
    };
  });
}

export function workgroupChunkAccounting(hashesSubmitted, workgroupSize) {
  const plan = workgroupInvocationPlan(hashesSubmitted, workgroupSize);
  const hasPartialFinalWorkgroup = plan.paddedInactiveInvocations > 0;
  const finalWorkgroupActiveInvocations = plan.partialFinalWorkgroupInvocations;
  return {
    workgroupSize: plan.wgslWorkgroupSize,
    hashesSubmitted,
    workgroupCount: plan.workgroupCount,
    totalLaunchedInvocations: plan.totalLaunchedInvocations,
    activeInvocations: plan.activeInvocations,
    paddedInactiveInvocations: plan.paddedInactiveInvocations,
    hasPartialFinalWorkgroup,
    finalWorkgroupActiveInvocations,
    partialFinalWorkgroupActiveInvocations: hasPartialFinalWorkgroup ? finalWorkgroupActiveInvocations : 0,
  };
}

export function workgroupExperimentInvocationAccounting({
  hashCount = DEFAULT_PROFILING_PRESET.hashCount,
  logicalBatchSize = DEFAULT_PROFILING_PRESET.dispatchBatchSize,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
} = {}) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  const logicalDispatchCount = Math.ceil(hashCount / logicalBatchSize);
  const chunks = [];
  for (let offset = 0; offset < hashCount; offset += logicalBatchSize) {
    const hashesSubmitted = Math.min(logicalBatchSize, hashCount - offset);
    chunks.push({
      dispatchIndex: chunks.length,
      nonceOffset: offset,
      ...workgroupChunkAccounting(hashesSubmitted, selected),
    });
  }
  return {
    workgroupSize: selected,
    hashCount,
    logicalBatchSize,
    logicalDispatchCount,
    workgroupsPerLogicalDispatch: workgroupChunkAccounting(Math.min(hashCount, logicalBatchSize), selected).workgroupCount,
    totalWorkgroups: chunks.reduce((sum, chunk) => sum + chunk.workgroupCount, 0),
    totalLaunchedInvocations: chunks.reduce((sum, chunk) => sum + chunk.totalLaunchedInvocations, 0),
    activeInvocations: hashCount,
    paddedInactiveInvocations: chunks.reduce((sum, chunk) => sum + chunk.paddedInactiveInvocations, 0),
    chunks,
  };
}

export function workgroupPerformanceEligible(status = {}) {
  return Boolean(
    status.deviceSupport === "supported" &&
    status.pipeline === "compiled" &&
    status.smallGate === "passed" &&
    status.full294 === "passed" &&
    (status.profiling === "valid" || status.profiling === "passed") &&
    status.currentSessionFull294Passed === true,
  );
}

export function workgroupPerformanceActionAvailable(status = {}) {
  return Boolean(
    status.deviceSupport === "supported" &&
    status.pipeline === "compiled" &&
    status.smallGate === "passed" &&
    status.full294 === "passed" &&
    status.currentSessionFull294Passed === true,
  );
}

export function workgroupExecutedVerificationAccounting({
  vectorCount = FULL_CORE_VECTOR_VERIFICATION_PRESET.expectedCoreVectorCount,
  batchSize = FULL_294_WORKGROUP_EXPERIMENT_BATCH_SIZE,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
} = {}) {
  return {
    ...workgroupExperimentInvocationAccounting({
      hashCount: vectorCount,
      logicalBatchSize: batchSize,
      workgroupSize,
    }),
    vectorCount,
    verificationBatchSize: batchSize,
    accountingScope: "executed-full-core-vector-verification",
  };
}

export function workgroupProfilingInvocationAccounting({
  hashCount = DEFAULT_PROFILING_PRESET.hashCount,
  logicalBatchSize = DEFAULT_PROFILING_PRESET.dispatchBatchSize,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  readbackStrategyId = DEFAULT_PROFILING_READBACK_STRATEGY,
} = {}) {
  const logical = workgroupExperimentInvocationAccounting({
    hashCount,
    logicalBatchSize,
    workgroupSize,
  });
  const physical = profilingPhysicalAccounting({
    hashCount,
    dispatchBatchSize: logicalBatchSize,
    readbackStrategyId,
    workgroupSize,
  });
  return {
    ...logical,
    ...physical,
    requestedHashes: hashCount,
    completedHashes: hashCount,
    accountingScope: "executed-workgroup-performance-profile",
  };
}

export function summarizeWorkgroupProfilingResult({
  profilingSummary,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  full294 = null,
} = {}) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  const iterations = profilingSummary?.iterations || [];
  const first = iterations[0] || null;
  const validation = first ? validateProfilingResult(first) : { valid: false, issues: ["profiling execution did not start"] };
  const expected = workgroupProfilingInvocationAccounting({
    hashCount: DEFAULT_PROFILING_PRESET.hashCount,
    logicalBatchSize: DEFAULT_PROFILING_PRESET.dispatchBatchSize,
    workgroupSize: selected,
  });
  const validIterations = iterations.filter((entry) => entry?.telemetryValidation?.valid);
  const firstInvalid = iterations.find((entry) => !entry?.telemetryValidation?.valid);
  const validProfilingRun = Boolean(
    first &&
    first.resultCount === DEFAULT_PROFILING_PRESET.hashCount &&
    first.returnedResultCount === DEFAULT_PROFILING_PRESET.hashCount &&
    first.readbackStrategy?.id === DEFAULT_PROFILING_READBACK_STRATEGY &&
    first.workgroup?.wgslWorkgroupSize === selected &&
    first.physicalSubmissionCount === expected.physicalSubmissionCount &&
    first.queueWaitCount === expected.queueWaitCount &&
    first.readbackCount === expected.readbackCount &&
    first.commandBufferCount === expected.commandBufferCount &&
    first.cpuSpotChecked === true &&
    first.outputReadback === true &&
    first.mismatchesAgainstCpuReference === 0 &&
    !first.firstMismatch &&
    !first.pipelineError &&
    validation.valid,
  );
  return {
    profilingExecuted: iterations.length > 0,
    validProfilingRun,
    performanceEligible: validProfilingRun,
    telemetryConsistency: validation,
    telemetryValidation: validation,
    repetitions: iterations.length,
    validRepetitions: validIterations.length,
    invalidRepetitions: iterations.length - validIterations.length,
    requestedHashes: first?.totalRequested ?? DEFAULT_PROFILING_PRESET.hashCount,
    hashesCompleted: first?.resultCount ?? 0,
    resultCount: first?.resultCount ?? 0,
    returnedResultCount: first?.returnedResultCount ?? 0,
    logicalDispatchCount: first?.logicalDispatchCount ?? expected.logicalDispatchCount,
    physicalSubmissionCount: first?.physicalSubmissionCount ?? expected.physicalSubmissionCount,
    queueWaitCount: first?.queueWaitCount ?? expected.queueWaitCount,
    readbackCount: first?.readbackCount ?? expected.readbackCount,
    commandBufferCount: first?.commandBufferCount ?? expected.commandBufferCount,
    workgroupSize: selected,
    pipelineKey: first?.pipelineDiagnostics?.pipelineKey || whirlpoolPipelineKey(selected),
    workgroupsPerLogicalDispatch: first?.workgroup?.workgroupsDispatched ?? expected.workgroupsPerLogicalDispatch,
    totalWorkgroups: expected.totalWorkgroups,
    totalLaunchedInvocations: expected.totalLaunchedInvocations,
    activeInvocations: expected.activeInvocations,
    paddedInactiveInvocations: expected.paddedInactiveInvocations,
    deterministicOrderingStatus: first?.deterministicResultOrdering || "not run",
    cpuSpotCheckCount: first?.spotCheckCount ?? 0,
    cpuSpotCheckStatus: first?.cpuSpotChecked
      ? first?.mismatchesAgainstCpuReference === 0 ? "passed" : "failed"
      : "not run",
    mismatchCount: first?.mismatchesAgainstCpuReference ?? 0,
    firstMismatch: first?.firstMismatch || firstInvalid?.firstMismatch || null,
    pipelineError: first?.pipelineError || firstInvalid?.pipelineError || null,
    deviceLostReason: first?.pipelineDiagnostics?.deviceLostReason || null,
    deviceLostMessage: first?.pipelineDiagnostics?.deviceLostMessage || null,
    totalElapsedMs: first?.hostPhases?.totalBenchmarkElapsedMs ?? null,
    queueWaitMs: first?.hostPhases?.queueCompletionWaitMs ?? null,
    readbackMs: first?.hostPhases?.readbackMs ?? null,
    cpuValidationMs: first?.hostPhases?.cpuGpuComparisonMs ?? null,
    hashesPerSecondIncludingPipeline: first?.verifiedHashesPerSecondIncludingPipeline ?? 0,
    hashesPerSecondExcludingPipeline: first?.verifiedHashesPerSecondExcludingPipeline ?? 0,
    statistics: profilingSummary?.statistics || profilingStatisticsForResults(iterations),
    prerequisiteFull294: full294,
    firstIteration: first,
    iterations,
  };
}

export function matchedWorkgroupExecutionOrder({
  repetitions = 3,
  order = "alternating-pairs",
  sizes = MATCHED_WORKGROUP_COMPARISON_SIZES,
} = {}) {
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error(`invalid matched comparison repetition count: ${repetitions}`);
  }
  const [left, right] = sizes.map(normalizeWorkgroupSize);
  if (order === "wg1-then-wg32" || order === "wg32-then-wg1") {
    const orderedSizes = order === "wg1-then-wg32" ? [left, right] : [right, left];
    return orderedSizes
      .flatMap((size) => Array.from({ length: repetitions }, (_, index) => ({
        workgroupSize: size,
        repetitionIndex: index + 1,
      })))
      .map((entry, executionOrderIndex) => ({ ...entry, executionOrderIndex }));
  }
  if (order !== "alternating-pairs") {
    throw new Error(`unknown matched workgroup execution order: ${order}`);
  }
  const sequence = [];
  for (let pair = 0; pair < Math.ceil(repetitions / 2); pair += 1) {
    const firstRep = pair * 2 + 1;
    const secondRep = firstRep + 1;
    sequence.push({ workgroupSize: left, repetitionIndex: firstRep });
    sequence.push({ workgroupSize: right, repetitionIndex: firstRep });
    if (secondRep <= repetitions) {
      sequence.push({ workgroupSize: right, repetitionIndex: secondRep });
      sequence.push({ workgroupSize: left, repetitionIndex: secondRep });
    }
  }
  return sequence
    .filter((entry) => entry.repetitionIndex <= repetitions)
    .map((entry, executionOrderIndex) => ({ ...entry, executionOrderIndex }));
}

export function matchedWorkgroupComparisonPrerequisites({
  statuses = {},
  repetitions = 3,
  deviceLimits = {},
  sizes = MATCHED_WORKGROUP_COMPARISON_SIZES,
} = {}) {
  const missing = [];
  if (!Number.isInteger(repetitions) || repetitions < 3) {
    missing.push("matched comparison requires at least 3 repetitions per size");
  }
  for (const size of sizes.map(normalizeWorkgroupSize)) {
    const status = statuses[size] || {};
    const support = validateWebGPUWorkgroupSize(size, deviceLimits || {});
    if (!support.valid) missing.push(`WG${size} unsupported by current WebGPU device limits`);
    if (status.deviceSupport !== "supported") missing.push(`WG${size} device support not confirmed`);
    if (status.pipeline !== "compiled") missing.push(`WG${size} pipeline not compiled`);
    if (status.smallGate !== "passed") missing.push(`WG${size} small gate not passed`);
    if (status.full294 !== "passed" || status.currentSessionFull294Passed !== true) {
      missing.push(`WG${size} current-session full 294 verification not passed`);
    }
  }
  return {
    available: missing.length === 0,
    missing,
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function percentDifference(next, base) {
  return Number.isFinite(next) && Number.isFinite(base) && base !== 0
    ? ((next - base) / base) * 100
    : null;
}

function sampleStats(samples) {
  const valid = samples.filter((sample) => sample.valid);
  return {
    validRepetitionCount: valid.length,
    invalidRepetitionCount: samples.length - valid.length,
    totalElapsedMs: calculateStats(valid.map((sample) => sample.totalElapsedMs)),
    queueCompletionWaitMs: calculateStats(valid.map((sample) => sample.queueWaitMs)),
    readbackMs: calculateStats(valid.map((sample) => sample.readbackMs)),
    cpuValidationMs: calculateStats(valid.map((sample) => sample.cpuValidationMs)),
    resultDecodingMs: calculateStats(valid.map((sample) => sample.resultDecodingMs)),
    commandEncodingMs: calculateStats(valid.map((sample) => sample.commandEncodingMs)),
    hashesPerSecondIncludingPipeline: calculateStats(valid.map((sample) => sample.hashesPerSecondIncludingPipeline)),
    hashesPerSecondExcludingPipeline: calculateStats(valid.map((sample) => sample.hashesPerSecondExcludingPipeline)),
  };
}

function matchedWorkgroupPipelineKey(size) {
  return whirlpoolPipelineKey(normalizeWorkgroupSize(size));
}

function perRepetitionInvocationAccounting(sample, comparisonId) {
  return {
    comparisonId,
    actionRunId: sample.actionRunId,
    requestedWorkgroupSize: sample.requestedWorkgroupSize,
    executedWorkgroupSize: sample.executedWorkgroupSize,
    requestedPipelineKey: sample.requestedPipelineKey,
    executedPipelineKey: sample.executedPipelineKey,
    pipelineIdentityConsistency: sample.pipelineIdentityConsistency,
    repetitionIndex: sample.repetitionIndex,
    executionOrderIndex: sample.executionOrderIndex,
    valid: sample.valid,
    invalidationReasons: sample.issues || [],
    hashCount: DEFAULT_PROFILING_PRESET.hashCount,
    logicalBatchSize: DEFAULT_PROFILING_PRESET.dispatchBatchSize,
    logicalDispatchCount: sample.logicalDispatchCount,
    workgroupsPerLogicalDispatch: sample.workgroupsPerLogicalDispatch,
    totalWorkgroups: sample.totalWorkgroups,
    launchedInvocations: sample.totalLaunchedInvocations,
    activeInvocations: sample.activeInvocations,
    paddedInvocations: sample.paddedInactiveInvocations,
  };
}

function buildPerSizeInvocationAccounting({ samples, comparisonId, workgroupSize }) {
  const size = normalizeWorkgroupSize(workgroupSize);
  const sizeSamples = samples.filter((sample) => sample.workgroupSize === size);
  const valid = sizeSamples.filter((sample) => sample.valid);
  const perRepetition = sizeSamples.map((sample) => perRepetitionInvocationAccounting(sample, comparisonId));
  return {
    workgroupSize: size,
    pipelineKey: matchedWorkgroupPipelineKey(size),
    repetitions: sizeSamples.length,
    validRepetitions: valid.length,
    invalidRepetitions: sizeSamples.length - valid.length,
    perRepetition,
    aggregate: {
      validRepetitions: valid.length,
      invalidRepetitions: sizeSamples.length - valid.length,
      hashCountPerRepetition: DEFAULT_PROFILING_PRESET.hashCount,
      logicalBatchSize: DEFAULT_PROFILING_PRESET.dispatchBatchSize,
      logicalDispatchCountPerRepetition: valid[0]?.logicalDispatchCount ?? null,
      workgroupsPerLogicalDispatch: valid[0]?.workgroupsPerLogicalDispatch ?? null,
      totalWorkgroupsPerRepetition: valid[0]?.totalWorkgroups ?? null,
      totalWorkgroups: valid.reduce((sum, sample) => sum + (sample.totalWorkgroups || 0), 0),
      launchedInvocations: valid.reduce((sum, sample) => sum + (sample.totalLaunchedInvocations || 0), 0),
      activeInvocations: valid.reduce((sum, sample) => sum + (sample.activeInvocations || 0), 0),
      paddedInvocations: valid.reduce((sum, sample) => sum + (sample.paddedInactiveInvocations || 0), 0),
    },
  };
}

function sumSamples(samples, field) {
  return samples.reduce((sum, sample) => sum + (Number.isFinite(sample[field]) ? sample[field] : 0), 0);
}

function profilingTotalsForSamples(samples, requestedRepetitions = 0) {
  const valid = samples.filter((sample) => sample.valid);
  const invalid = samples.filter((sample) => !sample.valid);
  return {
    repetitionsRequested: requestedRepetitions,
    repetitionsObserved: samples.length,
    validRepetitions: valid.length,
    invalidRepetitions: invalid.length,
    requestedHashesPerRepetition: valid.map((sample) => sample.hashesRequested),
    completedHashesPerRepetition: valid.map((sample) => sample.hashesCompleted),
    returnedResultsPerRepetition: valid.map((sample) => sample.returnedResultCount),
    totalRequestedHashes: sumSamples(valid, "hashesRequested"),
    totalCompletedHashes: sumSamples(valid, "hashesCompleted"),
    totalReturnedResults: sumSamples(valid, "returnedResultCount"),
    logicalDispatchesPerRepetition: valid.map((sample) => sample.logicalDispatchCount),
    totalLogicalDispatches: sumSamples(valid, "logicalDispatchCount"),
    submissionsPerRepetition: valid.map((sample) => sample.physicalSubmissionCount),
    totalSubmissions: sumSamples(valid, "physicalSubmissionCount"),
    queueWaitsPerRepetition: valid.map((sample) => sample.queueWaitCount),
    totalQueueWaits: sumSamples(valid, "queueWaitCount"),
    readbacksPerRepetition: valid.map((sample) => sample.readbackCount),
    totalReadbacks: sumSamples(valid, "readbackCount"),
    commandBuffersPerRepetition: valid.map((sample) => sample.commandBufferCount),
    totalCommandBuffers: sumSamples(valid, "commandBufferCount"),
    cpuSpotChecksPerRepetition: valid.map((sample) => sample.cpuSpotCheckCount),
    totalCpuSpotChecks: sumSamples(valid, "cpuSpotCheckCount"),
    mismatches: sumSamples(samples, "mismatchCount"),
    pipelineErrors: samples.filter((sample) => sample.pipelineError).length,
    deviceLosses: samples.filter((sample) => sample.deviceLostReason || sample.deviceLostMessage).length,
    deterministicOrderingFailures: samples.filter((sample) =>
      /fail|mismatch|not preserved/i.test(sample.deterministicOrderingStatus || "")).length,
    invalidSamples: invalid.map((sample) => ({
      workgroupSize: sample.workgroupSize,
      repetitionIndex: sample.repetitionIndex,
      executionOrderIndex: sample.executionOrderIndex,
      invalidationReasons: sample.issues || [],
    })),
  };
}

function buildMatchedExecutedProfilingAccounting({ samples, repetitions }) {
  const wg1Samples = samples.filter((sample) => sample.workgroupSize === 1);
  const wg32Samples = samples.filter((sample) => sample.workgroupSize === 32);
  const wg1 = profilingTotalsForSamples(wg1Samples, repetitions);
  const wg32 = profilingTotalsForSamples(wg32Samples, repetitions);
  return {
    wg1,
    wg32,
    combined: {
      repetitionsRequestedPerSize: repetitions,
      totalSamplesObserved: samples.length,
      validRepetitions: wg1.validRepetitions + wg32.validRepetitions,
      invalidRepetitions: wg1.invalidRepetitions + wg32.invalidRepetitions,
      totalRequestedHashes: wg1.totalRequestedHashes + wg32.totalRequestedHashes,
      totalCompletedHashes: wg1.totalCompletedHashes + wg32.totalCompletedHashes,
      totalReturnedResults: wg1.totalReturnedResults + wg32.totalReturnedResults,
      totalLogicalDispatches: wg1.totalLogicalDispatches + wg32.totalLogicalDispatches,
      totalSubmissions: wg1.totalSubmissions + wg32.totalSubmissions,
      totalQueueWaits: wg1.totalQueueWaits + wg32.totalQueueWaits,
      totalReadbacks: wg1.totalReadbacks + wg32.totalReadbacks,
      totalCommandBuffers: wg1.totalCommandBuffers + wg32.totalCommandBuffers,
      totalCpuSpotChecks: wg1.totalCpuSpotChecks + wg32.totalCpuSpotChecks,
      mismatches: wg1.mismatches + wg32.mismatches,
      pipelineErrors: wg1.pipelineErrors + wg32.pipelineErrors,
      deviceLosses: wg1.deviceLosses + wg32.deviceLosses,
      deterministicOrderingFailures: wg1.deterministicOrderingFailures + wg32.deterministicOrderingFailures,
    },
  };
}

function buildRecommendationBlockers({ wg1, wg32, differences, thresholds, compatible, practical }) {
  const blockers = [];
  if (!compatible) {
    blockers.push({ metric: "sampleCountOrCompatibility", observed: false, threshold: true });
  }
  const variabilityChecks = [
    ["wg1.totalElapsedCv", wg1.totalElapsedMs.sampleCoefficientOfVariation, thresholds.maxTotalTimeCvPercent / 100],
    ["wg32.totalElapsedCv", wg32.totalElapsedMs.sampleCoefficientOfVariation, thresholds.maxTotalTimeCvPercent / 100],
    ["wg1.throughputCv", wg1.hashesPerSecondIncludingPipeline.sampleCoefficientOfVariation, thresholds.maxThroughputCvPercent / 100],
    ["wg32.throughputCv", wg32.hashesPerSecondIncludingPipeline.sampleCoefficientOfVariation, thresholds.maxThroughputCvPercent / 100],
  ];
  for (const [metric, observed, threshold] of variabilityChecks) {
    if (!Number.isFinite(observed) || observed > threshold) {
      blockers.push({
        metric,
        observed,
        observedPercent: Number.isFinite(observed) ? observed * 100 : null,
        threshold,
        thresholdPercent: threshold * 100,
      });
    }
  }
  if (!practical) {
    blockers.push({
      metric: "meanThroughputPercent",
      observed: differences.meanThroughputPercent,
      threshold: thresholds.minPracticalThroughputDifferencePercent,
      note: "Absolute mean throughput difference did not clear the practical-difference threshold.",
    });
  }
  return blockers;
}

export function validateMatchedWorkgroupProfileSample({
  iteration,
  requestedWorkgroupSize,
  repetitionIndex,
  executionOrderIndex,
  actionRunId = null,
  full294Passed = true,
} = {}) {
  const selected = normalizeWorkgroupSize(requestedWorkgroupSize);
  const expectedPipelineKey = whirlpoolPipelineKey(selected);
  const telemetry = validateProfilingResult(iteration);
  const expected = workgroupProfilingInvocationAccounting({ workgroupSize: selected });
  const issues = [...(telemetry.issues || [])];
  const executedWorkgroupSize = iteration?.workgroup?.wgslWorkgroupSize ?? null;
  const executedPipelineKey = iteration?.pipelineDiagnostics?.pipelineKey || null;
  const pipelineIdentityConsistency = executedWorkgroupSize === selected && executedPipelineKey === expectedPipelineKey;
  if (!full294Passed) issues.push(`WG${selected} full 294 prerequisite is not current-session passed`);
  if (!pipelineIdentityConsistency) issues.push(`WG${selected} pipeline identity mismatch`);
  if (iteration?.totalRequested !== DEFAULT_PROFILING_PRESET.hashCount) issues.push("profile must request 8,192 hashes");
  if (iteration?.resultCount !== DEFAULT_PROFILING_PRESET.hashCount) issues.push("profile must complete 8,192 hashes");
  if (iteration?.returnedResultCount !== DEFAULT_PROFILING_PRESET.hashCount) issues.push("profile must return 8,192 results");
  if (iteration?.logicalDispatchCount !== expected.logicalDispatchCount) issues.push("logical dispatch count mismatch");
  if (iteration?.physicalSubmissionCount !== expected.physicalSubmissionCount) issues.push("physical submission count mismatch");
  if (iteration?.queueWaitCount !== expected.queueWaitCount) issues.push("queue wait count mismatch");
  if (iteration?.readbackCount !== expected.readbackCount) issues.push("readback count mismatch");
  if (iteration?.commandBufferCount !== expected.commandBufferCount) issues.push("command buffer count mismatch");
  if (iteration?.workgroup?.workgroupsDispatched !== expected.workgroupsPerLogicalDispatch) {
    issues.push("workgroups per logical dispatch mismatch");
  }
  if (iteration?.mismatchesAgainstCpuReference !== 0) issues.push("CPU spot-check mismatch");
  if (iteration?.firstMismatch) issues.push("first mismatch present");
  if (iteration?.pipelineError) issues.push("pipeline error present");
  if (iteration?.pipelineDiagnostics?.deviceLostReason || iteration?.pipelineDiagnostics?.deviceLostMessage) {
    issues.push("device loss reported");
  }
  return {
    workgroupSize: selected,
    requestedWorkgroupSize: selected,
    executedWorkgroupSize,
    requestedPipelineKey: expectedPipelineKey,
    executedPipelineKey,
    pipelineIdentityConsistency,
    actionRunId,
    repetitionIndex,
    executionOrderIndex,
    valid: issues.length === 0,
    issues,
    full294PrerequisitePassed: Boolean(full294Passed),
    hashesRequested: iteration?.totalRequested ?? 0,
    hashesCompleted: iteration?.resultCount ?? 0,
    returnedResultCount: iteration?.returnedResultCount ?? 0,
    logicalDispatchCount: iteration?.logicalDispatchCount ?? 0,
    physicalSubmissionCount: iteration?.physicalSubmissionCount ?? 0,
    queueWaitCount: iteration?.queueWaitCount ?? 0,
    readbackCount: iteration?.readbackCount ?? 0,
    commandBufferCount: iteration?.commandBufferCount ?? 0,
    workgroupsPerLogicalDispatch: expected.workgroupsPerLogicalDispatch,
    totalWorkgroups: expected.totalWorkgroups,
    totalLaunchedInvocations: expected.totalLaunchedInvocations,
    activeInvocations: expected.activeInvocations,
    paddedInactiveInvocations: expected.paddedInactiveInvocations,
    deterministicOrderingStatus: iteration?.deterministicResultOrdering || "not run",
    cpuSpotChecked: Boolean(iteration?.cpuSpotChecked),
    cpuSpotCheckCount: iteration?.spotCheckCount ?? 0,
    mismatchCount: iteration?.mismatchesAgainstCpuReference ?? 0,
    firstMismatch: iteration?.firstMismatch || null,
    pipelineError: iteration?.pipelineError || null,
    deviceLostReason: iteration?.pipelineDiagnostics?.deviceLostReason || null,
    deviceLostMessage: iteration?.pipelineDiagnostics?.deviceLostMessage || null,
    telemetryConsistency: telemetry,
    totalElapsedMs: finiteOrNull(iteration?.hostPhases?.totalBenchmarkElapsedMs),
    queueWaitMs: finiteOrNull(iteration?.hostPhases?.queueCompletionWaitMs),
    readbackMs: finiteOrNull(iteration?.hostPhases?.readbackMs),
    cpuValidationMs: finiteOrNull(iteration?.hostPhases?.cpuGpuComparisonMs),
    resultDecodingMs: finiteOrNull(iteration?.hostPhases?.resultDecodingMs),
    commandEncodingMs: finiteOrNull((iteration?.hostPhases?.computePassEncodingMs ?? 0) + (iteration?.hostPhases?.copyEncodingMs ?? 0)),
    hashesPerSecondIncludingPipeline: finiteOrNull(iteration?.verifiedHashesPerSecondIncludingPipeline),
    hashesPerSecondExcludingPipeline: finiteOrNull(iteration?.verifiedHashesPerSecondExcludingPipeline),
    iteration,
  };
}

export function buildMatchedWorkgroupComparison({
  samples = [],
  executionOrder = [],
  repetitions = 3,
  thresholds = MATCHED_WORKGROUP_COMPARISON_THRESHOLDS,
  capabilities = null,
  userAgent = "unavailable",
  timestamp = new Date().toISOString(),
  comparisonId = `wg1-vs-wg32-${timestamp}`,
} = {}) {
  const bySize = Object.fromEntries(MATCHED_WORKGROUP_COMPARISON_SIZES.map((size) => [
    size,
    samples.filter((sample) => sample.workgroupSize === size),
  ]));
  const aggregate = Object.fromEntries(MATCHED_WORKGROUP_COMPARISON_SIZES.map((size) => [
    size,
    sampleStats(bySize[size] || []),
  ]));
  const wg1 = aggregate[1];
  const wg32 = aggregate[32];
  const compatible = MATCHED_WORKGROUP_COMPARISON_SIZES.every((size) => aggregate[size]?.validRepetitionCount >= repetitions);
  const differences = {
    direction: "WG32 relative to WG1. Negative elapsed-time percentages mean WG32 took less time; positive throughput percentages mean WG32 was faster.",
    meanTotalElapsedMs: finiteOrNull(wg32.totalElapsedMs.mean - wg1.totalElapsedMs.mean),
    meanTotalElapsedPercent: percentDifference(wg32.totalElapsedMs.mean, wg1.totalElapsedMs.mean),
    medianTotalElapsedMs: finiteOrNull(wg32.totalElapsedMs.median - wg1.totalElapsedMs.median),
    medianTotalElapsedPercent: percentDifference(wg32.totalElapsedMs.median, wg1.totalElapsedMs.median),
    meanQueueWaitMs: finiteOrNull(wg32.queueCompletionWaitMs.mean - wg1.queueCompletionWaitMs.mean),
    meanQueueWaitPercent: percentDifference(wg32.queueCompletionWaitMs.mean, wg1.queueCompletionWaitMs.mean),
    meanCpuValidationMs: finiteOrNull(wg32.cpuValidationMs.mean - wg1.cpuValidationMs.mean),
    meanCpuValidationPercent: percentDifference(wg32.cpuValidationMs.mean, wg1.cpuValidationMs.mean),
    meanThroughputHps: finiteOrNull(wg32.hashesPerSecondIncludingPipeline.mean - wg1.hashesPerSecondIncludingPipeline.mean),
    meanThroughputPercent: percentDifference(wg32.hashesPerSecondIncludingPipeline.mean, wg1.hashesPerSecondIncludingPipeline.mean),
    medianThroughputHps: finiteOrNull(wg32.hashesPerSecondIncludingPipeline.median - wg1.hashesPerSecondIncludingPipeline.median),
    medianThroughputPercent: percentDifference(wg32.hashesPerSecondIncludingPipeline.median, wg1.hashesPerSecondIncludingPipeline.median),
  };
  const highVariability = [wg1, wg32].some((stats) =>
    ((stats.totalElapsedMs.sampleCoefficientOfVariation ?? Infinity) * 100) > thresholds.maxTotalTimeCvPercent ||
    ((stats.hashesPerSecondIncludingPipeline.sampleCoefficientOfVariation ?? Infinity) * 100) > thresholds.maxThroughputCvPercent);
  const practical = Math.abs(differences.meanThroughputPercent ?? 0) >= thresholds.minPracticalThroughputDifferencePercent;
  const executedInvocationAccounting = {
    wg1: buildPerSizeInvocationAccounting({ samples, comparisonId, workgroupSize: 1 }),
    wg32: buildPerSizeInvocationAccounting({ samples, comparisonId, workgroupSize: 32 }),
  };
  const executedProfilingAccounting = buildMatchedExecutedProfilingAccounting({ samples, repetitions });
  const recommendationBlockers = buildRecommendationBlockers({ wg1, wg32, differences, thresholds, compatible, practical });
  const correctnessEligible = executedProfilingAccounting.combined.mismatches === 0 &&
    executedProfilingAccounting.combined.pipelineErrors === 0 &&
    executedProfilingAccounting.combined.deviceLosses === 0 &&
    executedProfilingAccounting.combined.deterministicOrderingFailures === 0 &&
    samples.every((sample) => sample.full294PrerequisitePassed === true);
  let classification = "insufficient valid samples";
  if (compatible && highVariability) classification = "host-side variability too high for a recommendation";
  else if (compatible && !practical) classification = "effectively tied within observed variability";
  else if (compatible && differences.meanThroughputPercent > 0) classification = "WG32 faster in this browser observation";
  else if (compatible) classification = "WG1 faster in this browser observation";
  const recommendationEligible = compatible && correctnessEligible && !highVariability && practical;
  const matchedComparisonStatus = {
    executed: samples.length > 0,
    complete: samples.length === repetitions * MATCHED_WORKGROUP_COMPARISON_SIZES.length,
    valid: compatible && correctnessEligible,
    compatible,
    sampleCountEligible: compatible,
    correctnessEligible,
    variabilityEligible: !highVariability,
    practicalDifferenceEligible: practical,
    recommendationEligible,
    classification,
  };
  const currentSessionFull294 = Object.fromEntries(MATCHED_WORKGROUP_COMPARISON_SIZES.map((size) => {
    const sizeSamples = bySize[size] || [];
    return [size, {
      status: sizeSamples.length > 0 && sizeSamples.every((sample) => sample.full294PrerequisitePassed) ? "passed" : "not passed",
      matches: sizeSamples.length > 0 && sizeSamples.every((sample) => sample.full294PrerequisitePassed) ? 294 : null,
      mismatches: sizeSamples.length > 0 && sizeSamples.every((sample) => sample.full294PrerequisitePassed) ? 0 : null,
      source: "explicit workgroup experiment full-294 prerequisite",
    }];
  }));
  const summary = {
    action: "matched WG1 vs WG32 comparison",
    wg1ValidSamples: wg1.validRepetitionCount,
    wg32ValidSamples: wg32.validRepetitionCount,
    totalValidSamples: executedProfilingAccounting.combined.validRepetitions,
    totalInvalidSamples: executedProfilingAccounting.combined.invalidRepetitions,
    executionOrder,
    wg1PipelineKey: matchedWorkgroupPipelineKey(1),
    wg32PipelineKey: matchedWorkgroupPipelineKey(32),
    wg1CurrentSessionFull294Status: currentSessionFull294[1].status,
    wg32CurrentSessionFull294Status: currentSessionFull294[32].status,
    comparisonValidity: matchedComparisonStatus.valid ? "valid matched comparison" : "invalid or incomplete matched comparison",
    recommendationEligibility: recommendationEligible ? "recommendation eligible" : "no recommendation",
    finalInterpretation: classification,
    mismatchesAcrossAllSamples: executedProfilingAccounting.combined.mismatches,
    failedCpuSpotChecksAcrossAllSamples: samples.filter((sample) => !sample.cpuSpotChecked || sample.mismatchCount > 0).length,
    pipelineErrorsAcrossAllSamples: executedProfilingAccounting.combined.pipelineErrors,
    deviceLossesAcrossAllSamples: executedProfilingAccounting.combined.deviceLosses,
    scalarSummarySource: "matched comparison aggregate; any scalar last-sample values are labeled separately",
  };
  return {
    schemaVersion: 1,
    resultType: MATCHED_WORKGROUP_COMPARISON_RESULT_TYPE,
    comparisonId,
    timestamp,
    environment: {
      userAgent,
      webgpuVendor: capabilities?.adapterInfo?.vendor || "unavailable",
      adapterDescription: capabilities?.adapterInfo
        ? [capabilities.adapterInfo.vendor, capabilities.adapterInfo.architecture, capabilities.adapterInfo.device, capabilities.adapterInfo.description].filter(Boolean).join(" / ") || "adapter available"
        : "unavailable",
      deviceLimits: capabilities?.limits || null,
    },
    configuration: {
      sizes: MATCHED_WORKGROUP_COMPARISON_SIZES,
      hashCount: DEFAULT_PROFILING_PRESET.hashCount,
      logicalBatchSize: DEFAULT_PROFILING_PRESET.dispatchBatchSize,
      readbackStrategy: DEFAULT_PROFILING_READBACK_STRATEGY,
      outputReadback: true,
      cpuSpotChecked: true,
      fixtureId: "realistic-fields",
      algorithmId: SYNTHETIC_ALGORITHM_ID,
      repetitions,
      executionOrder,
    },
    samples,
    aggregate,
    executedInvocationAccounting,
    executedProfilingAccounting,
    differences,
    thresholds,
    recommendationBlockers,
    matchedComparisonStatus,
    currentSessionFull294,
    summary,
    compatible,
    recommendationEligible,
    interpretation: {
      classification,
      message: highVariability
        ? "Observed variability is too high for a workgroup-size recommendation."
        : recommendationEligible
        ? `${classification}; browser-observed only and scoped to this configuration.`
        : "No workgroup-size recommendation from this comparison.",
      hostSideNote: "Browser-observed total time includes host-side validation and JavaScript overhead. A stable queue wait with variable CPU validation does not establish a shader-side performance difference.",
      queueWaitNote: "Queue completion wait is browser-observed wall-clock time, not precise GPU kernel execution time.",
    },
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      walletUse: false,
      nativePerformance: false,
      browserObservedProfiling: true,
      experimentalWorkgroupComparison: true,
      matchedWorkgroupComparison: true,
    },
  };
}

export function serializeMatchedWorkgroupComparison(exportObject) {
  return `${JSON.stringify(exportObject, null, 2)}\n`;
}

export function matchedWorkgroupComparisonFilename(exportObject) {
  const timestamp = String(exportObject?.timestamp || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-zT_Z-]/g, "-");
  return `caps-webgpu-matched-wg1-wg32-${timestamp}.json`;
}

export function performanceComparisonCandidates(results = []) {
  return results.filter((entry) => entry?.performanceEligible === true &&
    entry?.boundaries?.outputReadback === true &&
    entry?.correctness?.smallGateStatus === "passed" &&
    entry?.correctness?.full294Status === "passed" &&
    entry?.correctness?.syntheticProfilingStatus === "valid" &&
    entry?.correctness?.mismatchCount === 0 &&
    !entry?.correctness?.pipelineError);
}

export function compareWorkgroupPerformance(results = []) {
  const candidates = performanceComparisonCandidates(results);
  const bySize = new Map();
  for (const result of candidates) {
    const key = [
      result.environment?.userAgent,
      result.environment?.adapterDescription,
      result.configuration?.algorithmId,
      result.configuration?.hashCount,
      result.configuration?.logicalBatchSize,
      result.configuration?.controlStrategy,
      result.configuration?.fixtureId,
      result.configuration?.pipelineCacheScope,
    ].join("|");
    const groupKey = `${key}|wg${result.configuration?.workgroupSize}`;
    if (!bySize.has(groupKey)) bySize.set(groupKey, []);
    bySize.get(groupKey).push(result);
  }
  const groups = Array.from(bySize.values()).map((entries) => ({
    workgroupSize: entries[0].configuration.workgroupSize,
    sampleCount: entries.length,
    recommendationEligible: entries.length >= 3,
    stats: profilingStatisticsForResults(entries.map((entry) => entry.syntheticProfilingIteration).filter(Boolean)),
  }));
  return {
    status: groups.some((group) => group.recommendationEligible)
      ? "Comparison candidates available; recommendation still requires compatible cross-size groups."
      : "At least three valid compatible repetitions per workgroup size are required before a recommendation",
    groups,
  };
}

export async function runWorkgroupSmallGate({
  gpu = navigator.gpu,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  onProgress = () => {},
} = {}) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  const subset = verificationPresetById("ten-fixtures-one-nonce");
  const result = await runWebGPUWhirlpoolFixtureSuite({
    gpu,
    subset,
    batchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
    workgroupSize: selected,
    onProgress,
  });
  const passed = result.resultCount > 0 &&
    result.mismatchesAgainstCpuReference === 0 &&
    result.fixtureCasesFailedBeforeDispatch === 0 &&
    !result.firstPipelineError;
  const diagnostics = result.pipelineDiagnostics || null;
  return {
    mode: WORKGROUP_EXPERIMENT_MODE,
    workgroupSize: selected,
    pipelineKey: whirlpoolPipelineKey(selected),
    status: passed ? "small gate passed" : "small gate failed",
    deviceValidation: diagnostics?.deviceLimitValidation || null,
    compileGate: diagnostics?.pipelineCreationCompleted && !diagnostics?.validationError
      ? "compiled"
      : "compile failed",
    pipelineDiagnostics: diagnostics,
    smallGate: {
      presetId: subset.id,
      presetLabel: subset.label,
      batchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
      matches: result.resultCount - result.mismatchesAgainstCpuReference,
      mismatches: result.mismatchesAgainstCpuReference,
      resultCount: result.resultCount,
      firstMismatch: result.firstMismatch || null,
      passed,
    },
    full294: {
      presetId: FULL_CORE_VECTOR_VERIFICATION_PRESET.id,
      status: selected === WGSL_WORKGROUP_SIZE ? "documented prior pass; current browser session pending" : "pending",
      matches: null,
      mismatches: null,
      requiredForPerformanceEligibility: true,
    },
    invocationAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: selected }),
    result,
  };
}

export async function runWorkgroupCompileGate({
  gpu = navigator.gpu,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
} = {}) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  const result = await compileBatchedWhirlpoolPipeline({ gpu, workgroupSize: selected });
  const passed = result.compileGate === "compiled" && result.deviceValidation?.valid === true;
  return {
    mode: WORKGROUP_EXPERIMENT_MODE,
    actionType: WORKGROUP_EXPERIMENT_ACTIONS.compile,
    workgroupSize: selected,
    pipelineKey: whirlpoolPipelineKey(selected),
    status: passed ? "compiled, correctness not run" : "compile failed",
    deviceValidation: result.deviceValidation,
    compileGate: result.compileGate,
    pipelineDiagnostics: result.pipelineDiagnostics,
    actionTelemetry: null,
    smallGate: { status: "not run", passed: false },
    full294: { status: "pending", requiredForPerformanceAction: true },
    executedInvocationAccounting: null,
    plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: selected }),
  };
}

export async function runWorkgroupFullVerification({
  gpu = navigator.gpu,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  coreVectorData,
  onProgress = () => {},
} = {}) {
  const selected = normalizeWorkgroupSize(workgroupSize);
  const batchSize = FULL_294_WORKGROUP_EXPERIMENT_BATCH_SIZE;
  const result = await runWebGPUWhirlpoolFixtureSuite({
    gpu,
    subset: FULL_CORE_VECTOR_VERIFICATION_PRESET,
    batchSize,
    workgroupSize: selected,
    onProgress,
  });
  const coreComparison = compareCoreVectorsToWgslSuite(coreVectorData, result, {
    scope: "all",
    fullVector: true,
  });
  const mismatches = coreComparison.mismatches?.length ?? result.mismatchesAgainstCpuReference;
  const passed = !coreComparison.pending &&
    coreComparison.selectedVectorCount === FULL_CORE_VECTOR_VERIFICATION_PRESET.expectedCoreVectorCount &&
    coreComparison.matches === FULL_CORE_VECTOR_VERIFICATION_PRESET.expectedCoreVectorCount &&
    mismatches === 0 &&
    result.fixtureCasesFailedBeforeDispatch === 0 &&
    !result.firstPipelineError;
  const diagnostics = result.pipelineDiagnostics || null;
  return {
    mode: WORKGROUP_EXPERIMENT_MODE,
    actionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    workgroupSize: selected,
    pipelineKey: whirlpoolPipelineKey(selected),
    status: passed ? "full 294 verification passed" : "full 294 verification failed",
    deviceValidation: diagnostics?.deviceLimitValidation || null,
    compileGate: diagnostics?.pipelineCreationCompleted && !diagnostics?.validationError
      ? "compiled"
      : "compile failed",
    pipelineDiagnostics: diagnostics,
    actionTelemetry: null,
    smallGate: {
      status: passed ? "passed" : "not run in this action",
      passed,
      note: passed ? "Full 294 verification covers the small fixture set for this selected pipeline." : "Run the small gate separately before profiling.",
    },
    full294: {
      presetId: FULL_CORE_VECTOR_VERIFICATION_PRESET.id,
      presetLabel: FULL_CORE_VECTOR_VERIFICATION_PRESET.label,
      batchSize,
      matches: coreComparison.matches,
      mismatches,
      resultCount: result.resultCount,
      selectedVectorCount: coreComparison.selectedVectorCount,
      vectorCount: coreComparison.vectorCount,
      firstMismatch: coreComparison.mismatches?.[0] || result.firstMismatch || null,
      pending: coreComparison.pending,
      passed,
      status: passed ? "passed" : "failed",
      verificationStatus: coreComparison.verificationStatus,
    },
    executedInvocationAccounting: workgroupExecutedVerificationAccounting({
      vectorCount: result.resultCount || FULL_CORE_VECTOR_VERIFICATION_PRESET.expectedCoreVectorCount,
      batchSize,
      workgroupSize: selected,
    }),
    plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: selected }),
    outputReadbackCompleted: result.resultCount === result.returnedResultCount || result.resultCount > 0,
    deterministicOrderingStatus: "preserved: fixture-suite rows are compared to Core vectors by fixture, nonce range, and nonce",
    coreComparison,
    result,
  };
}

export async function runWorkgroupSyntheticProfiling({
  gpu = navigator.gpu,
  workgroupSize = DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  repetitions = DEFAULT_PROFILING_REPETITIONS,
  onProgress = () => {},
} = {}) {
  return runSyntheticProfiling({
    gpu,
    preset: DEFAULT_PROFILING_PRESET,
    repetitions,
    readbackStrategyId: DEFAULT_PROFILING_READBACK_STRATEGY,
    workgroupSize,
    onProgress,
  });
}

export function buildWorkgroupExperimentExport({
  actionResult = null,
  smallGateResult,
  fullVerificationResult = null,
  profilingSummary = null,
  capabilities = null,
  userAgent = "unavailable",
  timestamp = new Date().toISOString(),
} = {}) {
  const primaryResult = actionResult || fullVerificationResult || smallGateResult || null;
  const selected = normalizeWorkgroupSize(primaryResult?.workgroupSize ?? DEFAULT_EXPERIMENT_WORKGROUP_SIZE);
  const profilingIteration = profilingSummary?.iterations?.[0] || null;
  const full294 = primaryResult?.full294 || fullVerificationResult?.full294 || null;
  const smallGate = primaryResult?.smallGate || smallGateResult?.smallGate || null;
  const profiling = primaryResult?.profiling || null;
  const matchedComparison = primaryResult?.matchedComparison || null;
  const diagnostics = primaryResult?.pipelineDiagnostics || smallGateResult?.pipelineDiagnostics || null;
  const status = {
    deviceSupport: primaryResult?.deviceValidation?.valid ? "supported" : "not checked",
    pipeline: primaryResult?.compileGate === "compiled" ? "compiled" : "compile failed",
    smallGate: smallGate?.passed ? "passed" : smallGate?.status || "not run",
    full294: full294?.passed ? "passed" : full294?.status || "pending",
    profiling: profiling?.validProfilingRun ? "valid" : profilingIteration?.telemetryValidation?.valid ? "valid" : "not run",
    currentSessionFull294Passed: full294?.passed === true,
  };
  const performanceEligible = workgroupPerformanceEligible(status);
  const performanceActionAvailable = workgroupPerformanceActionAvailable(status);
  const plannedAccounting = workgroupExperimentInvocationAccounting({ workgroupSize: selected });
  const executedAccounting = primaryResult?.executedInvocationAccounting || null;
  const executedProfilingAccounting = primaryResult?.executedProfilingAccounting || null;
  return {
    schemaVersion: 1,
    resultType: WORKGROUP_EXPERIMENT_RESULT_TYPE,
    actionType: primaryResult?.actionType || WORKGROUP_EXPERIMENT_ACTIONS.smallGate,
    actionTelemetry: primaryResult?.actionTelemetry || null,
    environment: {
      timestamp,
      userAgent,
      webgpuVendor: capabilities?.adapterInfo?.vendor || "unavailable",
      adapterDescription: capabilities?.adapterInfo
        ? [capabilities.adapterInfo.vendor, capabilities.adapterInfo.architecture, capabilities.adapterInfo.device, capabilities.adapterInfo.description].filter(Boolean).join(" / ") || "adapter available"
        : "unavailable",
      deviceLimits: diagnostics?.deviceLimits || null,
    },
    configuration: {
      mode: WORKGROUP_EXPERIMENT_MODE,
      workgroupSize: selected,
      pipelineKey: whirlpoolPipelineKey(selected),
      shaderCodeUnits: diagnostics?.shaderCodeUnits ?? null,
      shaderUtf8Bytes: diagnostics?.shaderUtf8Bytes ?? null,
      hashCount: DEFAULT_PROFILING_PRESET.hashCount,
      logicalBatchSize: DEFAULT_PROFILING_PRESET.dispatchBatchSize,
      logicalDispatchCount: plannedAccounting.logicalDispatchCount,
      physicalSubmissionCount: 1,
      queueWaitCount: 1,
      readbackCount: 1,
      repetitionCount: profilingSummary?.runCount || 0,
      controlStrategy: DEFAULT_PROFILING_READBACK_STRATEGY,
      fixtureId: "realistic-fields",
      algorithmId: SYNTHETIC_ALGORITHM_ID,
      pipelineCacheScope: diagnostics?.thisRunPipelineCreationMs > 0 ? "cold-in-current-run" : "cached-or-zero-current-run",
    },
    executedVerificationAccounting: executedAccounting,
    executedInvocationAccounting: executedAccounting,
    executedProfilingAccounting,
    matchedComparisonStatus: matchedComparison?.matchedComparisonStatus || null,
    recommendationBlockers: matchedComparison?.recommendationBlockers || [],
    matchedComparisonSummary: matchedComparison?.summary || null,
    currentSessionFull294: matchedComparison?.currentSessionFull294 || null,
    matchedComparison,
    plannedProfilingAccounting: plannedAccounting,
    invocationAccounting: executedProfilingAccounting || executedAccounting || plannedAccounting,
    profiling,
    correctness: {
      compileDeviceGate: primaryResult?.compileGate || "not run",
      deviceValidation: primaryResult?.deviceValidation || null,
      smallGateStatus: smallGate?.passed ? "passed" : smallGate?.status || "not run",
      smallGateMatches: smallGate?.matches ?? null,
      smallGateMismatches: smallGate?.mismatches ?? null,
      full294Status: full294?.passed ? "passed" : full294?.status || "pending",
      full294Matches: full294?.matches ?? null,
      full294Mismatches: full294?.mismatches ?? null,
      full294SelectedVectorCount: full294?.selectedVectorCount ?? null,
      full294ResultCount: full294?.resultCount ?? null,
      syntheticProfilingStatus: profiling?.validProfilingRun ? "valid" : profiling?.profilingExecuted ? "invalid" : profilingIteration?.telemetryValidation?.valid ? "valid" : "not run",
      profilingExecuted: Boolean(profiling?.profilingExecuted),
      validProfilingRun: Boolean(profiling?.validProfilingRun),
      cpuSpotCheckStatus: profiling?.cpuSpotCheckStatus || (profilingIteration?.cpuSpotChecked ? "passed" : "not run"),
      cpuSpotCheckCount: profiling?.cpuSpotCheckCount ?? profilingIteration?.spotCheckCount ?? null,
      mismatchCount: profiling?.mismatchCount ?? profilingIteration?.mismatchesAgainstCpuReference ?? full294?.mismatches ?? smallGate?.mismatches ?? 0,
      firstMismatch: profiling?.firstMismatch || profilingIteration?.firstMismatch || full294?.firstMismatch || smallGate?.firstMismatch || null,
      deterministicOrderingStatus: profiling?.deterministicOrderingStatus || primaryResult?.deterministicOrderingStatus || (profilingIteration?.deterministicResultOrdering ? "declared and spot-checked" : "not established by this action"),
      pipelineError: profiling?.pipelineError || profilingIteration?.pipelineError || null,
      telemetryConsistency: profiling?.telemetryConsistency || null,
      performanceEligible,
      performanceActionAvailable,
      fullCoreVerificationRequiredForPerformanceEligibility: true,
      actionRoutingConsistency: primaryResult?.actionTelemetry?.actionRoutingConsistency ?? null,
      actionRoutingMessage: primaryResult?.actionTelemetry?.actionRoutingMessage || null,
    },
    timing: {
      pipelineCreationMs: diagnostics?.thisRunPipelineCreationMs ?? null,
      queueWaitMs: profiling?.queueWaitMs ?? profilingIteration?.hostPhases?.queueCompletionWaitMs ?? null,
      readbackMs: profiling?.readbackMs ?? profilingIteration?.hostPhases?.readbackMs ?? null,
      cpuValidationMs: profiling?.cpuValidationMs ?? profilingIteration?.hostPhases?.cpuGpuComparisonMs ?? null,
      totalElapsedMs: profiling?.totalElapsedMs ?? profilingIteration?.hostPhases?.totalBenchmarkElapsedMs ?? null,
      hashesPerSecondIncludingPipeline: profiling?.hashesPerSecondIncludingPipeline ?? profilingIteration?.verifiedHashesPerSecondIncludingPipeline ?? null,
      repetitionStatistics: profilingSummary?.statistics || null,
    },
    syntheticProfilingIteration: profilingIteration,
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      walletSupport: false,
      walletUse: false,
      payoutTracking: false,
      remoteTelemetryUpload: false,
      experimentalWorkgroupVariant: true,
      performanceBenchmark: Boolean(profiling?.profilingExecuted),
      nativePerformance: false,
      browserObservedProfiling: Boolean(matchedComparison),
      matchedWorkgroupComparison: Boolean(matchedComparison),
      performanceEligible,
      performanceActionAvailable,
      fullCoreVerificationPassed: full294?.passed === true,
      actionRoutingConsistency: primaryResult?.actionTelemetry?.actionRoutingConsistency ?? null,
      profilingExecuted: Boolean(profiling?.profilingExecuted),
      validProfilingRun: Boolean(profiling?.validProfilingRun),
      outputReadback: Boolean(profiling?.profilingExecuted ? profiling?.firstIteration?.outputReadback : profilingIteration?.outputReadback),
      cpuSpotChecked: Boolean(profiling?.profilingExecuted ? profiling?.firstIteration?.cpuSpotChecked : profilingIteration?.cpuSpotChecked),
    },
  };
}

export function serializeWorkgroupExperimentExport(exportObject) {
  return `${JSON.stringify(exportObject, null, 2)}\n`;
}

export function workgroupExperimentFilename(exportObject) {
  const workgroupSize = exportObject?.configuration?.workgroupSize || "unknown";
  const timestamp = String(exportObject?.environment?.timestamp || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-zT_Z-]/g, "-");
  return `caps-webgpu-workgroup-wg${workgroupSize}-${timestamp}.json`;
}
