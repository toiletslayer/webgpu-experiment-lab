import { bytesToHex, capstashPoWInternalHex, patchNonce } from "../cpu/capstash-pow.js";
import {
  SYNTHETIC_ALGORITHM_ID,
  SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
  SYNTHETIC_FIXTURE_ID,
  buildSyntheticBenchmarkExport,
  buildSyntheticNonceRange,
  buildSyntheticTasks,
  calculateStats,
  formatSyntheticMismatch,
  runSyntheticCorrectnessGate,
  selectSyntheticSpotCheckIndexes,
  syntheticBatchPlan,
  syntheticDispatchCount,
  syntheticFixture,
  syntheticWorkgroupPlan,
  validateSyntheticBenchmarkResult,
  validateWorkgroupLimit,
  variationLabel,
} from "./synthetic-benchmark.js";
import {
  MAX_WHIRLPOOL_BATCH_TASKS,
  WGSL_WORKGROUP_SIZE,
  buildLogicalDispatchPlan,
  normalizeWorkgroupSize,
  runWebGPUWhirlpoolBatch,
  runWebGPUWhirlpoolMultiDispatchSubmission,
} from "./whirlpool-minimal.js";
import { fixtureHeaderBytes } from "../vectors/whirlpool-fixtures.js";

export const SYNTHETIC_PROFILING_RESULT_TYPE = "synthetic-browser-profiling";
export const SYNTHETIC_PROFILING_SUMMARY_RESULT_TYPE = "synthetic-browser-profiling-summary";
export const SYNTHETIC_PROFILING_MODE = "webgpu-synthetic-profiling";
export const PROFILING_REPETITION_OPTIONS = Object.freeze([1, 3, 5, 10]);
export const DEFAULT_PROFILING_REPETITIONS = 1;
export const PROFILING_PRESETS = Object.freeze([
  Object.freeze({ id: "1024-b128", label: "1,024 hashes / batch 128", hashCount: 1024, dispatchBatchSize: 128 }),
  Object.freeze({ id: "2048-b128", label: "2,048 hashes / batch 128", hashCount: 2048, dispatchBatchSize: 128 }),
  Object.freeze({ id: "4096-b256", label: "4,096 hashes / batch 256", hashCount: 4096, dispatchBatchSize: 256 }),
  Object.freeze({ id: "8192-b512", label: "8,192 hashes / batch 512", hashCount: 8192, dispatchBatchSize: 512 }),
]);
export const DEFAULT_PROFILING_PRESET = PROFILING_PRESETS[3];
export const PROFILING_READBACK_STRATEGIES = Object.freeze({
  "current-per-dispatch": Object.freeze({
    id: "current-per-dispatch",
    label: "Variant A - current per-dispatch readback",
    outputReadback: true,
    cpuSpotChecked: true,
    implemented: true,
    note: "Current behavior: submit one synthetic dispatch, wait, map/read back, decode, then continue.",
  }),
  "dispatch-timing-probe-no-readback": Object.freeze({
    id: "dispatch-timing-probe-no-readback",
    label: "Dispatch timing probe - no output readback",
    outputReadback: false,
    cpuSpotChecked: false,
    implemented: true,
    note: "Profiling only: executes WGSL after the correctness gate but does not establish output correctness for this run.",
  }),
  "multi-dispatch-single-readback": Object.freeze({
    id: "multi-dispatch-single-readback",
    label: "Variant B - multiple dispatches, one submission, one readback",
    outputReadback: true,
    cpuSpotChecked: true,
    implemented: true,
    note: "Encodes multiple logical dispatch chunks into one command submission, waits once, and reads back one combined output buffer.",
  }),
  "single-large-dispatch": Object.freeze({
    id: "single-large-dispatch",
    label: "Variant C - single large dispatch where permitted",
    outputReadback: true,
    cpuSpotChecked: true,
    implemented: false,
    note: "Documented candidate; current batch runner is capped by conservative task-buffer limits.",
  }),
});
export const DEFAULT_PROFILING_READBACK_STRATEGY = "multi-dispatch-single-readback";
export const MAX_PROFILING_HISTORY_ENTRIES = 20;

function now() {
  return performance.now();
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function sum(values) {
  return values.reduce((total, value) => total + safeNumber(value), 0);
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

export function profilingPresetById(id) {
  return PROFILING_PRESETS.find((preset) => preset.id === id) || DEFAULT_PROFILING_PRESET;
}

export function profilingReadbackStrategyById(id) {
  return PROFILING_READBACK_STRATEGIES[id] || PROFILING_READBACK_STRATEGIES[DEFAULT_PROFILING_READBACK_STRATEGY];
}

export function profilingOutputSizeBytes(hashCount) {
  return hashCount * 8 * Uint32Array.BYTES_PER_ELEMENT;
}

export function profilingPhysicalAccounting({ hashCount, dispatchBatchSize, readbackStrategyId = DEFAULT_PROFILING_READBACK_STRATEGY, workgroupSize = WGSL_WORKGROUP_SIZE } = {}) {
  const strategy = profilingReadbackStrategyById(readbackStrategyId);
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const logicalDispatchCount = syntheticDispatchCount(hashCount, dispatchBatchSize);
  const outputReadback = Boolean(strategy.outputReadback);
  const combined = strategy.id === "multi-dispatch-single-readback";
  const logicalPlan = buildLogicalDispatchPlan(hashCount, dispatchBatchSize, selectedWorkgroupSize);
  return {
    strategyId: strategy.id,
    workgroupSize: selectedWorkgroupSize,
    logicalDispatchCount,
    physicalSubmissionCount: combined ? 1 : logicalDispatchCount,
    queueWaitCount: combined ? 1 : logicalDispatchCount,
    readbackCount: outputReadback ? combined ? 1 : logicalDispatchCount : 0,
    commandBufferCount: combined ? 1 : logicalDispatchCount,
    totalWorkgroups: logicalPlan.reduce((total, entry) => total + entry.workgroupCount, 0),
    totalLaunchedInvocations: logicalPlan.reduce((total, entry) => total + entry.totalLaunchedInvocations, 0),
    totalActiveInvocations: hashCount,
    paddedInactiveInvocations: logicalPlan.reduce((total, entry) => total + entry.paddedInactiveInvocations, 0),
    outputReadback,
    combinedOutputByteSize: outputReadback ? profilingOutputSizeBytes(hashCount) : 0,
  };
}

export function buildProfilingOutputOffsetMap(hashCount, dispatchBatchSize, workgroupSize = WGSL_WORKGROUP_SIZE) {
  return buildLogicalDispatchPlan(hashCount, dispatchBatchSize, workgroupSize).map((entry) => ({
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
  }));
}

export function profilingRunIdentity(exportObject) {
  return {
    mode: exportObject?.configuration?.mode,
    fixtureId: exportObject?.configuration?.fixtureId,
    fixtureName: exportObject?.configuration?.fixtureName,
    headerHex: exportObject?.configuration?.headerHex,
    hashCount: exportObject?.configuration?.hashCount,
    dispatchBatchSize: exportObject?.configuration?.dispatchBatchSize,
    readbackStrategy: exportObject?.configuration?.readbackStrategy,
    outputReadback: exportObject?.boundaries?.outputReadback,
    cpuSpotChecked: exportObject?.boundaries?.cpuSpotChecked,
    validHashBenchmark: exportObject?.boundaries?.validHashBenchmark,
    profilingOnly: exportObject?.boundaries?.profilingOnly,
    algorithmId: exportObject?.configuration?.algorithmId || SYNTHETIC_ALGORITHM_ID,
    wgslWorkgroupSize: exportObject?.configuration?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
    correctnessGateStatus: exportObject?.correctness?.correctnessGateStatus,
    correctnessGateBatchSize: exportObject?.correctness?.correctnessGateBatchSize,
    userAgent: exportObject?.environment?.userAgent || "unavailable",
    webgpuVendor: exportObject?.environment?.webgpuVendor || "unavailable",
    adapterDescription: exportObject?.environment?.adapterDescription || "unavailable",
    pipelineKey: exportObject?.environment?.pipelineKey || "whirlpool-batched",
    shaderPipelineKey: exportObject?.environment?.shaderPipelineKey || exportObject?.environment?.pipelineKey || "whirlpool-batched",
    shaderUtf8Bytes: exportObject?.environment?.shaderUtf8Bytes ?? null,
    shaderCodeUnits: exportObject?.environment?.shaderCodeUnits ?? null,
    deviceLimits: JSON.stringify(limitObject(exportObject?.environment?.deviceLimits)),
    pipelineScope: exportObject?.timing?.hostPhases?.thisRunPipelineCreationMs > 0 ? "cold-in-current-run" : "cached-or-zero-current-run",
  };
}

function identityKey(identity) {
  return JSON.stringify(identity);
}

export function compatibleProfilingRuns(exports, referenceExport = exports[0]) {
  if (!referenceExport) return [];
  const key = identityKey(profilingRunIdentity(referenceExport));
  return exports.filter((entry) => identityKey(profilingRunIdentity(entry)) === key);
}

export function validateProfilingResult(result) {
  const issues = [];
  if (!result || result.stage !== SYNTHETIC_PROFILING_MODE) {
    return { valid: false, status: "invalid profiling telemetry", issues: ["missing profiling result"] };
  }
  if (!result.correctnessGate?.passed) {
    issues.push("profiling requires a passed correctness gate");
  }
  if (result.readbackStrategy?.outputReadback && result.resultCount !== result.totalRequested) {
    issues.push("normal profiling must complete exactly the requested hash count");
  }
  if (result.dispatchCount !== syntheticDispatchCount(result.totalRequested, result.dispatchBatchSize)) {
    issues.push("dispatch count must equal ceil(hashCount / dispatchBatchSize)");
  }
  const expectedPhysical = profilingPhysicalAccounting({
    hashCount: result.totalRequested,
    dispatchBatchSize: result.dispatchBatchSize,
    readbackStrategyId: result.readbackStrategy?.id,
    workgroupSize: result.workgroup?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
  });
  for (const key of ["logicalDispatchCount", "physicalSubmissionCount", "queueWaitCount", "readbackCount", "commandBufferCount"]) {
    if (result[key] !== undefined && result[key] !== expectedPhysical[key]) {
      issues.push(`${key} must match the selected profiling readback strategy`);
    }
  }
  if (result.readbackStrategy?.id === "multi-dispatch-single-readback") {
    const expectedOffsets = buildProfilingOutputOffsetMap(
      result.totalRequested,
      result.dispatchBatchSize,
      result.workgroup?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
    );
    if (JSON.stringify(result.outputOffsetMap || []) !== JSON.stringify(expectedOffsets)) {
      issues.push("Variant B output offsets must preserve deterministic non-overlapping result order");
    }
  }
  if (result.readbackStrategy?.outputReadback && result.mismatchesAgainstCpuReference !== 0) {
    issues.push("normal profiling requires zero CPU/GPU spot-check mismatches");
  }
  if (result.readbackStrategy?.outputReadback && result.firstMismatch) {
    issues.push("normal profiling must not include a first mismatch");
  }
  if (result.pipelineError) {
    issues.push("profiling result must not include a pipeline error");
  }
  if (!result.readbackStrategy?.outputReadback && result.validHashBenchmark) {
    issues.push("no-readback probe cannot claim valid hash benchmark status");
  }
  if (!result.readbackStrategy?.outputReadback && result.cpuSpotChecked) {
    issues.push("no-readback probe cannot claim CPU spot checks");
  }
  for (const [label, value] of Object.entries(result.hostPhases || {})) {
    if (value !== null && typeof value !== "string" && !Number.isFinite(value)) {
      issues.push(`${label} must be finite, nonnegative, null, or a scope note`);
    }
    if (Number.isFinite(value) && value < 0) {
      issues.push(`${label} must be nonnegative`);
    }
  }
  for (const dispatch of result.perDispatch || []) {
    if (dispatch.nonceEnd < dispatch.nonceStart) {
      issues.push(`dispatch ${dispatch.dispatchIndex} has an invalid nonce range`);
    }
    for (const [label, value] of Object.entries(dispatch.timing || {})) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push(`dispatch ${dispatch.dispatchIndex} ${label} must be finite and nonnegative`);
      }
    }
  }
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "valid profiling telemetry" : "invalid profiling telemetry",
    issues,
  };
}

export function interpretProfilingPhases(hostPhases) {
  const categories = {
    "dispatch loop": safeNumber(hostPhases.dispatchLoopElapsedMs),
    "readback/map": safeNumber(hostPhases.mapReadbackWaitMs) + safeNumber(hostPhases.resultDecodingMs),
    "CPU validation": safeNumber(hostPhases.cpuReferenceHashingAndComparisonMs) + safeNumber(hostPhases.cpuSpotCheckSelectionMs),
    "buffer/setup": safeNumber(hostPhases.bufferAllocationMs) + safeNumber(hostPhases.bufferPopulationMs) + safeNumber(hostPhases.bufferUploadMs) + safeNumber(hostPhases.bindGroupCreationMs),
  };
  const known = sum(Object.values(categories));
  categories["other host overhead"] = Math.max(0, safeNumber(hostPhases.totalBenchmarkElapsedMs) - known);
  const total = sum(Object.values(categories));
  const percentages = Object.fromEntries(Object.entries(categories).map(([key, value]) => [
    key,
    total > 0 ? (value / total) * 100 : 0,
  ]));
  const [largestCategory, largestPercent] = Object.entries(percentages).sort((a, b) => b[1] - a[1])[0] || ["mixed", 0];
  const interpretation = largestPercent < 40
    ? "mixed"
    : largestCategory === "dispatch loop"
    ? "dispatch-dominated"
    : largestCategory === "readback/map"
    ? "readback-dominated"
    : largestCategory === "CPU validation"
    ? "CPU-validation-dominated"
    : largestCategory === "buffer/setup"
    ? "setup-dominated"
    : "mixed";
  return {
    categories,
    percentages,
    largestCategory,
    largestPercent,
    interpretation,
    note: `Browser-observed execution is ${interpretation}; shader-internal bottleneck remains unknown.`,
  };
}

function aggregateDispatchTimings(perDispatch) {
  return {
    bufferPopulationMs: sum(perDispatch.map((entry) => entry.timing.bufferPopulationMs)),
    bufferAllocationMs: sum(perDispatch.map((entry) => entry.timing.bufferAllocationMs)),
    bufferUploadMs: sum(perDispatch.map((entry) => entry.timing.bufferUploadMs)),
    bindGroupCreationMs: sum(perDispatch.map((entry) => entry.timing.bindGroupCreationMs)),
    commandEncoderCreationMs: sum(perDispatch.map((entry) => entry.timing.commandEncoderCreationMs)),
    computePassEncodingMs: sum(perDispatch.map((entry) => entry.timing.computePassEncodingMs)),
    commandFinishMs: sum(perDispatch.map((entry) => entry.timing.commandFinishMs)),
    queueSubmissionMs: sum(perDispatch.map((entry) => entry.timing.queueSubmissionMs)),
    queueCompletionWaitMs: sum(perDispatch.map((entry) => entry.timing.queueCompletionWaitMs)),
    dispatchLoopElapsedMs: sum(perDispatch.map((entry) => entry.timing.dispatchElapsedMs)),
    mapReadbackWaitMs: sum(perDispatch.map((entry) => entry.timing.mapReadbackWaitMs)),
    resultDecodingMs: sum(perDispatch.map((entry) => entry.timing.resultDecodingMs)),
    readbackMs: sum(perDispatch.map((entry) => entry.timing.readbackMs)),
    cpuReferenceHashingAndComparisonMs: sum(perDispatch.map((entry) => entry.timing.cpuReferenceHashingAndComparisonMs)),
    cpuComparisonMs: sum(perDispatch.map((entry) => entry.timing.cpuComparisonMs)),
  };
}

export async function runSyntheticProfilingIteration({
  gpu = navigator.gpu,
  fixture = syntheticFixture(),
  hashCount = DEFAULT_PROFILING_PRESET.hashCount,
  dispatchBatchSize = DEFAULT_PROFILING_PRESET.dispatchBatchSize,
  readbackStrategyId = DEFAULT_PROFILING_READBACK_STRATEGY,
  workgroupSize = WGSL_WORKGROUP_SIZE,
  correctnessGate,
  includePerDispatch = true,
  onProgress = () => {},
} = {}) {
  const strategy = profilingReadbackStrategyById(readbackStrategyId);
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  if (!strategy.implemented) {
    throw new Error(`${strategy.label} is documented but not implemented in this milestone.`);
  }
  if (!correctnessGate?.passed) {
    throw new Error("Synthetic profiling requires a passed correctness gate.");
  }
  if (dispatchBatchSize > MAX_WHIRLPOOL_BATCH_TASKS) {
    throw new Error(`profiling dispatch batch size exceeds WGSL batch runner limit: ${dispatchBatchSize}`);
  }

  const totalStart = now();
  const fixtureStart = now();
  const header80 = fixtureHeaderBytes(fixture);
  const fixtureHeaderPreparationMs = now() - fixtureStart;

  const nonceRangeStart = now();
  const range = buildSyntheticNonceRange({ hashCount, nonceStart: fixture.nonceStart });
  const plan = syntheticBatchPlan(hashCount, dispatchBatchSize);
  const nonceRangePlanningMs = now() - nonceRangeStart;

  const outputSizeStart = now();
  const outputSizeBytes = profilingOutputSizeBytes(hashCount);
  const outputSizeCalculationMs = now() - outputSizeStart;

  const spotCheckStart = now();
  const spotCheckIndexes = strategy.outputReadback ? selectSyntheticSpotCheckIndexes(hashCount) : [];
  const spotCheckSet = new Set(spotCheckIndexes);
  const cpuSpotCheckSelectionMs = now() - spotCheckStart;

  const perDispatch = [];
  const spotCheckResults = [];
  let resultCount = 0;
  let returnedResultCount = 0;
  let firstMismatch = null;
  let pipelineDiagnostics = null;
  let pipelineError = null;
  let pipelineReused = false;
  let pipelineCacheStatus = "miss";
  let combinedSubmissionHostPhases = null;
  const physicalAccounting = profilingPhysicalAccounting({
    hashCount,
    dispatchBatchSize,
    readbackStrategyId: strategy.id,
    workgroupSize: selectedWorkgroupSize,
  });
  let outputOffsetMap = strategy.id === "multi-dispatch-single-readback"
    ? buildProfilingOutputOffsetMap(hashCount, dispatchBatchSize, selectedWorkgroupSize)
    : [];

  if (strategy.id === "multi-dispatch-single-readback") {
    const taskPrepStart = now();
    const tasks = buildSyntheticTasks({
      fixture,
      nonceStart: range.nonceStart,
      hashCount,
      startIndex: 0,
      count: hashCount,
    });
    const taskPreparationMs = now() - taskPrepStart;
    try {
      const batchResult = await runWebGPUWhirlpoolMultiDispatchSubmission({
        tasks,
        gpu,
        logicalBatchSize: dispatchBatchSize,
        cpuCheckIndexes: spotCheckIndexes,
        workgroupSize: selectedWorkgroupSize,
      });
      resultCount += batchResult.resultCount;
      returnedResultCount += batchResult.returnedResultCount;
      pipelineDiagnostics = batchResult.pipelineDiagnostics || pipelineDiagnostics;
      pipelineReused = batchResult.pipelineReused;
      pipelineCacheStatus = batchResult.pipelineCacheStatus;
      combinedSubmissionHostPhases = batchResult.hostPhases;
      for (const row of batchResult.results || []) {
        const patched = Uint8Array.from(row.header80);
        patchNonce(patched, row.nonce);
        const enriched = {
          ...row,
          syntheticIndex: row.index,
          dispatchIndex: Math.floor(row.index / dispatchBatchSize),
          indexWithinDispatch: row.index % dispatchBatchSize,
          batchSize: dispatchBatchSize,
          patchedHeaderHex: bytesToHex(patched),
        };
        spotCheckResults.push(enriched);
        if (!enriched.match && !firstMismatch) {
          firstMismatch = enriched;
        }
      }
      outputOffsetMap = batchResult.outputOffsetMap || outputOffsetMap;
      if (includePerDispatch) {
        for (const logical of batchResult.perLogicalDispatch || []) {
          const firstTask = tasks[logical.taskOffset];
          const lastTask = tasks[logical.taskOffset + logical.hashesSubmitted - 1];
          perDispatch.push({
            dispatchIndex: logical.dispatchIndex,
            nonceStart: firstTask.nonce >>> 0,
            nonceEnd: lastTask.nonce >>> 0,
            hashesSubmitted: logical.hashesSubmitted,
            outputDestinationOffset: logical.outputOffset,
            outputByteOffset: logical.outputByteOffset,
            outputByteLength: logical.outputByteLength,
            workgroupSize: logical.workgroupSize,
            workgroupCount: logical.workgroupCount,
            totalLaunchedInvocations: logical.totalLaunchedInvocations,
            activeInvocations: logical.activeInvocations,
            paddedInactiveInvocations: logical.paddedInactiveInvocations,
            partialFinalWorkgroupInvocations: logical.partialFinalWorkgroupInvocations,
            outputReadback: true,
            timingScope: "combined-submission",
            timingOwner: "aggregate",
            logicalDispatchTimingIndividuallyMeasured: false,
            timing: {},
          });
        }
      }
      onProgress({
        stage: SYNTHETIC_PROFILING_MODE,
        dispatchIndex: plan.length - 1,
        dispatchCount: plan.length,
        completed: resultCount,
        totalRequested: hashCount,
      });
    } catch (error) {
      pipelineError = error instanceof Error ? error.message : String(error);
    }
  } else {
    for (const batch of plan) {
      const taskPrepStart = now();
      const tasks = buildSyntheticTasks({
        fixture,
        nonceStart: range.nonceStart,
        hashCount,
        startIndex: batch.startIndex,
        count: batch.count,
      });
      const taskPreparationMs = now() - taskPrepStart;
      const localSpotChecks = [];
      for (let localIndex = 0; localIndex < batch.count; localIndex += 1) {
        if (spotCheckSet.has(batch.startIndex + localIndex)) {
          localSpotChecks.push(localIndex);
        }
      }

      try {
        const batchResult = await runWebGPUWhirlpoolBatch({
          tasks,
          gpu,
          cpuCheckIndexes: strategy.outputReadback ? localSpotChecks : [],
          outputReadback: strategy.outputReadback,
          workgroupSize: selectedWorkgroupSize,
        });
        resultCount += batchResult.resultCount;
        returnedResultCount += batchResult.returnedResultCount;
        pipelineDiagnostics = batchResult.pipelineDiagnostics || pipelineDiagnostics;
        pipelineReused = batchResult.pipelineReused;
        pipelineCacheStatus = batchResult.pipelineCacheStatus;
        for (const row of batchResult.results || []) {
          const patched = Uint8Array.from(row.header80);
          patchNonce(patched, row.nonce);
          const enriched = {
            ...row,
            syntheticIndex: batch.startIndex + row.index,
            dispatchIndex: batch.dispatchIndex,
            indexWithinDispatch: row.index,
            batchSize: dispatchBatchSize,
            patchedHeaderHex: bytesToHex(patched),
          };
          spotCheckResults.push(enriched);
          if (!enriched.match && !firstMismatch) {
            firstMismatch = enriched;
          }
        }
        const workgroup = syntheticWorkgroupPlan(batch.count, selectedWorkgroupSize);
        if (includePerDispatch) {
          perDispatch.push({
            dispatchIndex: batch.dispatchIndex,
            nonceStart: tasks[0].nonce >>> 0,
            nonceEnd: tasks[tasks.length - 1].nonce >>> 0,
            hashesSubmitted: batch.count,
            outputDestinationOffset: 0,
            outputByteOffset: 0,
            outputByteLength: batch.count * 8 * Uint32Array.BYTES_PER_ELEMENT,
            workgroupSize: workgroup.wgslWorkgroupSize,
            workgroupCount: workgroup.workgroupsDispatched,
            totalLaunchedInvocations: workgroup.totalLaunchedInvocations,
            activeInvocations: batch.count,
            paddedInactiveInvocations: workgroup.paddedInactiveInvocations,
            partialFinalWorkgroupInvocations: workgroup.activeInvocationsInPartialFinalWorkgroup,
            outputReadback: strategy.outputReadback,
            timing: {
              taskPreparationMs,
              bufferSetupMs: batchResult.bufferSetupMs,
              bufferPopulationMs: batchResult.hostPhases?.bufferPopulationMs || 0,
              bufferAllocationMs: batchResult.hostPhases?.bufferAllocationMs || 0,
              bufferUploadMs: batchResult.hostPhases?.bufferUploadMs || 0,
              bindGroupCreationMs: batchResult.hostPhases?.bindGroupCreationMs || 0,
              commandEncoderCreationMs: batchResult.hostPhases?.commandEncoderCreationMs || 0,
              computePassEncodingMs: batchResult.hostPhases?.computePassEncodingMs || 0,
              commandFinishMs: batchResult.hostPhases?.commandFinishMs || 0,
              queueSubmissionMs: batchResult.hostPhases?.queueSubmissionMs || 0,
              queueCompletionWaitMs: batchResult.hostPhases?.queueCompletionWaitMs || 0,
              dispatchElapsedMs: batchResult.gpuElapsedMs,
              mapReadbackWaitMs: batchResult.hostPhases?.mapReadbackWaitMs || 0,
              resultDecodingMs: batchResult.hostPhases?.resultDecodeMs || 0,
              readbackMs: batchResult.readbackMs,
              cpuReferenceHashingAndComparisonMs: batchResult.hostPhases?.cpuReferenceHashingAndComparisonMs || 0,
              cpuComparisonMs: batchResult.cpuComparisonMs,
              totalDispatchElapsedMs: batchResult.totalElapsedMs,
            },
          });
        }
        onProgress({
          stage: SYNTHETIC_PROFILING_MODE,
          dispatchIndex: batch.dispatchIndex,
          dispatchCount: plan.length,
          completed: resultCount,
          totalRequested: hashCount,
        });
        if (firstMismatch) break;
      } catch (error) {
        pipelineError = error instanceof Error ? error.message : String(error);
        break;
      }
    }
  }

  const dispatchAggregate = aggregateDispatchTimings(perDispatch);
  const phaseAggregate = combinedSubmissionHostPhases
    ? {
        bufferPopulationMs: combinedSubmissionHostPhases.bufferPopulationMs || 0,
        bufferAllocationMs: combinedSubmissionHostPhases.bufferAllocationMs || 0,
        bufferUploadMs: combinedSubmissionHostPhases.bufferUploadMs || 0,
        bindGroupCreationMs: combinedSubmissionHostPhases.bindGroupCreationMs || 0,
        commandEncoderCreationMs: combinedSubmissionHostPhases.commandEncoderCreationMs || 0,
        computePassEncodingMs: combinedSubmissionHostPhases.computePassEncodingMs || 0,
        copyEncodingMs: combinedSubmissionHostPhases.copyEncodingMs || 0,
        commandFinishMs: combinedSubmissionHostPhases.commandFinishMs || 0,
        queueSubmissionMs: combinedSubmissionHostPhases.queueSubmissionMs || 0,
        queueCompletionWaitMs: combinedSubmissionHostPhases.queueCompletionWaitMs || 0,
        dispatchLoopElapsedMs: (combinedSubmissionHostPhases.queueSubmissionMs || 0) + (combinedSubmissionHostPhases.queueCompletionWaitMs || 0),
        mapReadbackWaitMs: combinedSubmissionHostPhases.mapReadbackWaitMs || 0,
        resultDecodingMs: combinedSubmissionHostPhases.resultDecodeMs || 0,
        readbackMs: readbackStrategyId === "multi-dispatch-single-readback"
          ? (combinedSubmissionHostPhases.mapReadbackWaitMs || 0) + (combinedSubmissionHostPhases.resultDecodeMs || 0)
          : 0,
        cpuReferenceHashingAndComparisonMs: combinedSubmissionHostPhases.cpuReferenceHashingAndComparisonMs || 0,
        cpuComparisonMs: combinedSubmissionHostPhases.cpuComparisonMs || 0,
      }
    : dispatchAggregate;
  const resultObjectStart = now();
  const mismatches = spotCheckResults.filter((row) => !row.match);
  const validHashBenchmark =
    strategy.outputReadback &&
    correctnessGate.passed &&
    resultCount === hashCount &&
    mismatches.length === 0 &&
    !pipelineError;
  const firstPatched = Uint8Array.from(header80);
  patchNonce(firstPatched, range.nonceStart);
  const totalBeforeObject = now() - totalStart;
  const hostPhases = {
    fixtureHeaderPreparationMs,
    nonceRangePlanningMs,
    outputSizeCalculationMs,
    bufferAllocationMs: phaseAggregate.bufferAllocationMs,
    bufferPopulationUploadMs: phaseAggregate.bufferPopulationMs + phaseAggregate.bufferUploadMs,
    bufferPopulationMs: phaseAggregate.bufferPopulationMs,
    bufferUploadMs: phaseAggregate.bufferUploadMs,
    bindGroupCreationMs: phaseAggregate.bindGroupCreationMs,
    commandEncoderCreationMs: phaseAggregate.commandEncoderCreationMs,
    computePassEncodingMs: phaseAggregate.computePassEncodingMs,
    copyEncodingMs: phaseAggregate.copyEncodingMs || 0,
    commandFinishMs: phaseAggregate.commandFinishMs,
    queueSubmissionMs: phaseAggregate.queueSubmissionMs,
    queueCompletionWaitMs: phaseAggregate.queueCompletionWaitMs,
    dispatchLoopElapsedMs: phaseAggregate.dispatchLoopElapsedMs,
    mapReadbackWaitMs: phaseAggregate.mapReadbackWaitMs,
    readbackMs: phaseAggregate.readbackMs,
    resultDecodingMs: phaseAggregate.resultDecodingMs,
    cpuSpotCheckSelectionMs,
    cpuReferenceHashingMs: phaseAggregate.cpuReferenceHashingAndComparisonMs,
    cpuGpuComparisonMs: phaseAggregate.cpuComparisonMs,
    resultObjectConstructionMs: 0,
    uiRenderingMs: null,
    totalBenchmarkElapsedMs: totalBeforeObject,
    timingSourceNote: "Browser-observed wall-clock timing; queue completion wait is not a direct shader hardware counter.",
  };
  const interpretation = interpretProfilingPhases(hostPhases);
  const result = {
    stage: SYNTHETIC_PROFILING_MODE,
    modeLabel: strategy.outputReadback ? "Synthetic profiling run" : "Dispatch timing probe - output correctness not established by this run alone",
    valid: validateSyntheticBenchmarkResult({
      stage: "webgpu-synthetic-nonce-benchmark",
      valid: validHashBenchmark,
      correctnessGate,
      totalRequested: hashCount,
      resultCount,
      dispatchBatchSize,
      dispatchCount: plan.length,
      mismatchesAgainstCpuReference: mismatches.length,
      firstMismatch: firstMismatch ? formatSyntheticMismatch(firstMismatch) : null,
      pipelineDiagnostics,
      bufferSetupMs: phaseAggregate.bufferAllocationMs + phaseAggregate.bufferUploadMs + phaseAggregate.bindGroupCreationMs,
      gpuElapsedMs: phaseAggregate.dispatchLoopElapsedMs,
      readbackMs: phaseAggregate.readbackMs,
      cpuComparisonMs: phaseAggregate.cpuComparisonMs,
      totalElapsedMs: totalBeforeObject,
      verifiedHashesPerSecondIncludingPipeline: totalBeforeObject > 0 ? (resultCount * 1000) / totalBeforeObject : 0,
      verifiedHashesPerSecondExcludingPipeline: phaseAggregate.dispatchLoopElapsedMs > 0 ? (resultCount * 1000) / phaseAggregate.dispatchLoopElapsedMs : 0,
    }).valid,
    validHashBenchmark,
    profilingOnly: !strategy.outputReadback,
    outputReadback: strategy.outputReadback,
    cpuSpotChecked: strategy.cpuSpotChecked && strategy.outputReadback,
    readbackStrategy: strategy,
    correctnessGate,
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    fixtureHeaderHex: fixture.headerHex,
    firstPatchedHeaderHex: bytesToHex(firstPatched),
    firstSpotCheckCpuInternalHex: capstashPoWInternalHex(firstPatched),
    nonceStart: range.nonceStart,
    nonceEnd: range.nonceEnd,
    totalRequested: hashCount,
    resultCount,
    returnedResultCount,
    dispatchBatchSize,
    dispatchCount: plan.length,
    logicalDispatchCount: physicalAccounting.logicalDispatchCount,
    physicalSubmissionCount: physicalAccounting.physicalSubmissionCount,
    queueWaitCount: physicalAccounting.queueWaitCount,
    readbackCount: physicalAccounting.readbackCount,
    commandBufferCount: physicalAccounting.commandBufferCount,
    combinedOutputByteSize: physicalAccounting.combinedOutputByteSize,
    outputOffsetMap,
    deterministicResultOrdering: strategy.id === "multi-dispatch-single-readback"
      ? "Output index equals global task index, preserving ascending synthetic nonce order across one combined readback."
      : "Each logical dispatch decodes in ascending synthetic nonce order.",
    resultsPerDispatch: plan.length > 0 ? resultCount / plan.length : 0,
    outputSizeBytes,
    spotCheckIndexes,
    spotCheckCount: spotCheckResults.length,
    spotCheckStatus: strategy.outputReadback
      ? mismatches.length === 0
        ? `CPU spot-check passed for ${spotCheckResults.length} selected nonces`
        : `CPU spot-check failed with ${mismatches.length} mismatch(es)`
      : "CPU spot-check skipped for no-readback profiling probe",
    spotCheckResults: spotCheckResults.map((row) => ({
      syntheticIndex: row.syntheticIndex,
      nonce: row.nonce,
      cpuInternalHex: row.cpuInternalHex,
      gpuInternalHex: row.gpuInternalHex,
      match: row.match,
    })),
    mismatchesAgainstCpuReference: mismatches.length,
    firstMismatch: firstMismatch ? formatSyntheticMismatch(firstMismatch) : null,
    pipelineError,
    pipelineDiagnostics,
    pipelineReused,
    pipelineCacheStatus,
    gpuElapsedMs: phaseAggregate.dispatchLoopElapsedMs,
    readbackMs: phaseAggregate.readbackMs,
    bufferSetupMs: phaseAggregate.bufferAllocationMs + phaseAggregate.bufferPopulationMs + phaseAggregate.bufferUploadMs + phaseAggregate.bindGroupCreationMs,
    cpuComparisonMs: phaseAggregate.cpuComparisonMs,
    workgroup: {
      ...syntheticWorkgroupPlan(Math.min(dispatchBatchSize, hashCount), selectedWorkgroupSize),
      maxComputeInvocationsPerWorkgroup: pipelineDiagnostics?.deviceLimits?.maxComputeInvocationsPerWorkgroup ?? null,
      maxComputeWorkgroupSizeX: pipelineDiagnostics?.deviceLimits?.maxComputeWorkgroupSizeX ?? null,
      workgroupLimitValid: validateWorkgroupLimit(selectedWorkgroupSize, pipelineDiagnostics?.deviceLimits).valid,
      deviceLimitValidation: validateWorkgroupLimit(selectedWorkgroupSize, pipelineDiagnostics?.deviceLimits),
    },
    hostPhases,
    perDispatch,
    interpretation,
    verifiedHashesPerSecondIncludingPipeline: totalBeforeObject > 0 ? (resultCount * 1000) / totalBeforeObject : 0,
    verifiedHashesPerSecondExcludingPipeline: phaseAggregate.dispatchLoopElapsedMs > 0 ? (resultCount * 1000) / phaseAggregate.dispatchLoopElapsedMs : 0,
    totalElapsedMs: totalBeforeObject,
    note: "Synthetic profiling is browser-observed research telemetry only; no target comparison, pool connection, live mining, wallet, payout, or native-performance claim.",
  };
  result.hostPhases.resultObjectConstructionMs = now() - resultObjectStart;
  result.hostPhases.totalBenchmarkElapsedMs = now() - totalStart;
  result.interpretation = interpretProfilingPhases(result.hostPhases);
  result.telemetryValidation = validateProfilingResult(result);
  return result;
}

export async function runSyntheticProfiling({
  gpu = navigator.gpu,
  preset = DEFAULT_PROFILING_PRESET,
  repetitions = DEFAULT_PROFILING_REPETITIONS,
  readbackStrategyId = DEFAULT_PROFILING_READBACK_STRATEGY,
  workgroupSize = WGSL_WORKGROUP_SIZE,
  onProgress = () => {},
} = {}) {
  if (!PROFILING_REPETITION_OPTIONS.includes(repetitions)) {
    throw new Error(`unsupported profiling repetition count: ${repetitions}`);
  }
  const selectedWorkgroupSize = normalizeWorkgroupSize(workgroupSize);
  const selectedPreset = typeof preset === "string" ? profilingPresetById(preset) : preset;
  const gate = await runSyntheticCorrectnessGate({
    gpu,
    workgroupSize: selectedWorkgroupSize,
    onProgress(progress) {
      onProgress({
        stage: "synthetic-profiling-correctness-gate",
        completed: progress.completedCases || 0,
        totalRequested: progress.totalCases || 0,
      });
    },
  });
  if (!gate.passed) {
    throw new Error("Synthetic profiling blocked because the correctness gate failed.");
  }
  const iterations = [];
  for (let index = 0; index < repetitions; index += 1) {
    const iteration = await runSyntheticProfilingIteration({
      gpu,
      fixture: syntheticFixture(),
      hashCount: selectedPreset.hashCount,
      dispatchBatchSize: selectedPreset.dispatchBatchSize,
      readbackStrategyId,
      workgroupSize: selectedWorkgroupSize,
      correctnessGate: gate,
      onProgress(progress) {
        onProgress({
          ...progress,
          repetitionIndex: index,
          repetitions,
        });
      },
    });
    iterations.push(iteration);
  }
  return buildProfilingSummary(iterations, {
    preset: selectedPreset,
    repetitions,
    readbackStrategyId,
    workgroupSize: selectedWorkgroupSize,
    correctnessGate: gate,
  });
}

export function profilingStatisticsForResults(results) {
  const valid = results.filter((entry) => entry.telemetryValidation?.valid);
  return {
    totalElapsedMs: calculateStats(valid.map((entry) => entry.hostPhases.totalBenchmarkElapsedMs)),
    dispatchLoopElapsedMs: calculateStats(valid.map((entry) => entry.hostPhases.dispatchLoopElapsedMs)),
    queueCompletionWaitMs: calculateStats(valid.map((entry) => entry.hostPhases.queueCompletionWaitMs)),
    readbackMs: calculateStats(valid.map((entry) => entry.hostPhases.readbackMs)),
    commandEncodingMs: calculateStats(valid.map((entry) => entry.hostPhases.computePassEncodingMs + safeNumber(entry.hostPhases.copyEncodingMs))),
    cpuSpotCheckMs: calculateStats(valid.map((entry) => entry.hostPhases.cpuGpuComparisonMs)),
    resultDecodingMs: calculateStats(valid.map((entry) => entry.hostPhases.resultDecodingMs)),
    hashesPerSecondIncludingPipeline: calculateStats(valid.map((entry) => entry.verifiedHashesPerSecondIncludingPipeline)),
  };
}

export function buildProfilingSummary(iterations, context = {}) {
  const first = iterations[0];
  const stats = profilingStatisticsForResults(iterations);
  const cv = stats.totalElapsedMs.sampleCoefficientOfVariation;
  return {
    schemaVersion: 1,
    resultType: SYNTHETIC_PROFILING_SUMMARY_RESULT_TYPE,
    configuration: {
      mode: SYNTHETIC_PROFILING_MODE,
      fixtureId: first?.fixtureId || SYNTHETIC_FIXTURE_ID,
      fixtureName: first?.fixtureName || syntheticFixture().name,
      headerHex: first?.fixtureHeaderHex || syntheticFixture().headerHex,
      hashCount: first?.totalRequested || context.preset?.hashCount || 0,
      dispatchBatchSize: first?.dispatchBatchSize || context.preset?.dispatchBatchSize || 0,
      wgslWorkgroupSize: first?.workgroup?.wgslWorkgroupSize ?? context.workgroupSize ?? WGSL_WORKGROUP_SIZE,
      dispatchCount: first?.dispatchCount || 0,
      logicalDispatchCount: first?.logicalDispatchCount || first?.dispatchCount || 0,
      physicalSubmissionCount: first?.physicalSubmissionCount || first?.dispatchCount || 0,
      queueWaitCount: first?.queueWaitCount || first?.dispatchCount || 0,
      readbackCount: first?.readbackCount ?? (first?.outputReadback ? first?.dispatchCount || 0 : 0),
      commandBufferCount: first?.commandBufferCount || first?.dispatchCount || 0,
      readbackStrategy: context.readbackStrategyId || first?.readbackStrategy?.id || DEFAULT_PROFILING_READBACK_STRATEGY,
      repetitionCount: iterations.length,
      algorithmId: SYNTHETIC_ALGORITHM_ID,
    },
    correctness: {
      correctnessGateStatus: context.correctnessGate?.passed ? "passed" : "failed",
      correctnessGateBatchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
      cpuSpotCheckStatus: first?.cpuSpotChecked ? "enabled" : "disabled",
      mismatchCount: sum(iterations.map((entry) => entry.mismatchesAgainstCpuReference)),
      firstMismatch: iterations.find((entry) => entry.firstMismatch)?.firstMismatch || null,
      pipelineError: iterations.find((entry) => entry.pipelineError)?.pipelineError || null,
    },
    runCount: iterations.length,
    validRunCount: iterations.filter((entry) => entry.telemetryValidation?.valid).length,
    invalidRunCount: iterations.filter((entry) => !entry.telemetryValidation?.valid).length,
    statisticsStatus: iterations.length < 2 ? "Insufficient repeated runs for variability statistics" : "Profiling repetition statistics available",
    interpretation: iterations.length < 2 ? "Insufficient repeated runs for variability statistics" : variationLabel(cv),
    statistics: stats,
    iterations,
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      walletSupport: false,
      payoutTracking: false,
      networkSubmission: false,
      remoteTelemetryUpload: false,
      validHashBenchmark: Boolean(first?.validHashBenchmark),
      profilingOnly: Boolean(first?.profilingOnly),
      outputReadback: Boolean(first?.outputReadback),
      resultType: SYNTHETIC_PROFILING_SUMMARY_RESULT_TYPE,
    },
  };
}

function profilingExportFromIteration(iteration, summaryExport = null, sampleIndex = 0) {
  return {
    schemaVersion: 1,
    resultType: "synthetic-browser-profiling-sample",
    telemetryStatus: iteration.telemetryValidation?.status || "invalid profiling telemetry",
    sampleIndex,
    environment: summaryExport?.environment || {
      timestamp: null,
      userAgent: "unavailable",
      webgpuVendor: "unavailable",
      adapterDescription: "unavailable",
      adapterLimits: limitObject(iteration.pipelineDiagnostics?.adapterLimits),
      deviceLimits: limitObject(iteration.pipelineDiagnostics?.deviceLimits),
      shaderUtf8Bytes: iteration.pipelineDiagnostics?.shaderUtf8Bytes ?? null,
      shaderCodeUnits: iteration.pipelineDiagnostics?.shaderCodeUnits ?? null,
      shaderPipelineKey: iteration.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
      pipelineKey: iteration.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
    },
    configuration: {
      mode: SYNTHETIC_PROFILING_MODE,
      fixtureId: iteration.fixtureId,
      fixtureName: iteration.fixtureName,
      headerHex: iteration.fixtureHeaderHex,
      hashCount: iteration.totalRequested,
      hashesCompleted: iteration.resultCount,
      dispatchBatchSize: iteration.dispatchBatchSize,
      dispatchCount: iteration.dispatchCount,
      logicalDispatchCount: iteration.logicalDispatchCount,
      physicalSubmissionCount: iteration.physicalSubmissionCount,
      queueWaitCount: iteration.queueWaitCount,
      readbackCount: iteration.readbackCount,
      commandBufferCount: iteration.commandBufferCount,
      wgslWorkgroupSize: iteration.workgroup?.wgslWorkgroupSize ?? WGSL_WORKGROUP_SIZE,
      readbackStrategy: iteration.readbackStrategy?.id,
      readbackStrategyLabel: iteration.readbackStrategy?.label,
      repetitionCount: 1,
      algorithmId: SYNTHETIC_ALGORITHM_ID,
    },
    correctness: {
      correctnessGateStatus: iteration.correctnessGate?.passed ? "passed" : "failed",
      correctnessGateBatchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
      cpuSpotCheckStatus: iteration.cpuSpotChecked ? "enabled" : "disabled",
      mismatchCount: iteration.mismatchesAgainstCpuReference,
      firstMismatch: iteration.firstMismatch,
      pipelineError: iteration.pipelineError,
      validHashBenchmark: iteration.validHashBenchmark,
    },
    timing: {
      hostPhases: iteration.hostPhases,
    },
    boundaries: {
      liveMining: false,
      targetComparison: false,
      poolConnection: false,
      blockSubmission: false,
      validHashBenchmark: iteration.validHashBenchmark,
      profilingOnly: iteration.profilingOnly,
      outputReadback: iteration.outputReadback,
      cpuSpotChecked: iteration.cpuSpotChecked,
      resultType: "synthetic-browser-profiling-sample",
    },
  };
}

function isValidComparisonSample(sample) {
  return sample?.telemetryStatus === "valid profiling telemetry" &&
    sample?.boundaries?.validHashBenchmark === true &&
    sample?.boundaries?.profilingOnly === false &&
    sample?.boundaries?.outputReadback === true &&
    sample?.boundaries?.cpuSpotChecked === true &&
    sample?.correctness?.correctnessGateStatus === "passed" &&
    sample?.correctness?.mismatchCount === 0 &&
    !sample?.correctness?.firstMismatch &&
    !sample?.correctness?.pipelineError;
}

export function expandProfilingComparisonSamples(exports) {
  const summarySamples = [];
  const standaloneSamples = [];
  for (const entry of exports || []) {
    if (!entry) continue;
    if (entry.resultType === SYNTHETIC_PROFILING_SUMMARY_RESULT_TYPE && Array.isArray(entry.iterations)) {
      for (let index = 0; index < entry.iterations.length; index += 1) {
        const sample = profilingExportFromIteration(entry.iterations[index], entry, index);
        if (isValidComparisonSample(sample)) {
          summarySamples.push(sample);
        }
      }
    } else if (entry.resultType === SYNTHETIC_PROFILING_RESULT_TYPE || entry.resultType === "synthetic-browser-profiling-sample") {
      if (isValidComparisonSample(entry)) {
        standaloneSamples.push(entry);
      }
    }
  }
  if (summarySamples.length === 0) return standaloneSamples;
  const summaryIdentityKeys = new Set(summarySamples.map((sample) => identityKey(profilingRunIdentity(sample))));
  return [
    ...summarySamples,
    ...standaloneSamples.filter((sample) => !summaryIdentityKeys.has(identityKey(profilingRunIdentity(sample)))),
  ];
}

function identityWithoutStrategy(sample) {
  return {
    ...profilingRunIdentity(sample),
    readbackStrategy: undefined,
    physicalSubmissionCount: undefined,
    queueWaitCount: undefined,
    readbackCount: undefined,
    commandBufferCount: undefined,
  };
}

export function compareProfilingStrategyExports(exports, leftStrategyId = "current-per-dispatch", rightStrategyId = "multi-dispatch-single-readback") {
  const valid = expandProfilingComparisonSamples(exports);
  const left = valid.filter((entry) => entry.configuration?.readbackStrategy === leftStrategyId);
  const right = valid.filter((entry) => entry.configuration?.readbackStrategy === rightStrategyId);
  if (left.length === 0 || right.length === 0) {
    return {
      status: "Insufficient compatible runs",
      recommendation: "Insufficient compatible runs",
      repeatabilityBackedRecommendation: false,
      leftCount: left.length,
      rightCount: right.length,
      leftSampleCount: left.length,
      rightSampleCount: right.length,
    };
  }
  const leftIdentity = identityWithoutStrategy(left[0]);
  const compatibleRight = right.filter((entry) => {
    const rightIdentity = identityWithoutStrategy(entry);
    return identityKey(leftIdentity) === identityKey(rightIdentity);
  });
  const compatibleLeft = left.filter((entry) => identityKey(identityWithoutStrategy(entry)) === identityKey(leftIdentity));
  if (compatibleRight.length === 0) {
    return {
      status: "Insufficient compatible runs",
      recommendation: "Insufficient compatible runs",
      repeatabilityBackedRecommendation: false,
      leftCount: left.length,
      rightCount: right.length,
      leftSampleCount: left.length,
      rightSampleCount: 0,
    };
  }
  const leftStats = calculateStats(compatibleLeft.map((entry) => entry.timing.hostPhases.totalBenchmarkElapsedMs));
  const rightStats = calculateStats(compatibleRight.map((entry) => entry.timing.hostPhases.totalBenchmarkElapsedMs));
  const leftQueueStats = calculateStats(compatibleLeft.map((entry) => entry.timing.hostPhases.queueCompletionWaitMs));
  const rightQueueStats = calculateStats(compatibleRight.map((entry) => entry.timing.hostPhases.queueCompletionWaitMs));
  const leftReadbackStats = calculateStats(compatibleLeft.map((entry) => entry.timing.hostPhases.readbackMs));
  const rightReadbackStats = calculateStats(compatibleRight.map((entry) => entry.timing.hostPhases.readbackMs));
  const leftCpuStats = calculateStats(compatibleLeft.map((entry) => entry.timing.hostPhases.cpuGpuComparisonMs));
  const rightCpuStats = calculateStats(compatibleRight.map((entry) => entry.timing.hostPhases.cpuGpuComparisonMs));
  const leftHpsStats = calculateStats(compatibleLeft.map((entry) => entry.timing.hostPhases.totalBenchmarkElapsedMs > 0
    ? (entry.configuration.hashCount * 1000) / entry.timing.hostPhases.totalBenchmarkElapsedMs
    : 0));
  const rightHpsStats = calculateStats(compatibleRight.map((entry) => entry.timing.hostPhases.totalBenchmarkElapsedMs > 0
    ? (entry.configuration.hashCount * 1000) / entry.timing.hostPhases.totalBenchmarkElapsedMs
    : 0));
  const deltaMs = rightStats.mean - leftStats.mean;
  const deltaPercent = leftStats.mean > 0 ? (deltaMs / leftStats.mean) * 100 : 0;
  const sufficientEvidence = compatibleRight.length >= 3 && compatibleLeft.length >= 3;
  const recommendation = sufficientEvidence
    ? deltaPercent < -5
      ? "For this browser, adapter, shader, fixture, 8,192-hash workload, and batch size 512, Variant B is the repeatability-backed preferred profiling baseline."
      : deltaPercent > 5
      ? "Variant B increased elapsed time"
      : "No meaningful difference observed"
    : "At least three valid compatible runs per strategy are required before a recommendation";
  return {
    status: "Compatible profiling comparison available",
    recommendation,
    recommendationScope: "This recommendation is scoped to matching browser, adapter, shader, fixture, hash count, dispatch batch size, workgroup size, correctness gate, full-readback, CPU-spot-checked profiling samples.",
    repeatabilityBackedRecommendation: sufficientEvidence,
    sufficientEvidence,
    leftStrategyId,
    rightStrategyId,
    leftCount: compatibleLeft.length,
    rightCount: compatibleRight.length,
    leftSampleCount: compatibleLeft.length,
    rightSampleCount: compatibleRight.length,
    leftTotalElapsedMs: leftStats,
    rightTotalElapsedMs: rightStats,
    leftQueueWaitMs: leftQueueStats,
    rightQueueWaitMs: rightQueueStats,
    leftReadbackMs: leftReadbackStats,
    rightReadbackMs: rightReadbackStats,
    leftCpuValidationMs: leftCpuStats,
    rightCpuValidationMs: rightCpuStats,
    leftHashesPerSecond: leftHpsStats,
    rightHashesPerSecond: rightHpsStats,
    deltaMs,
    deltaPercent,
    queueWaitDeltaMs: rightQueueStats.mean - leftQueueStats.mean,
    queueWaitDeltaPercent: leftQueueStats.mean > 0 ? ((rightQueueStats.mean - leftQueueStats.mean) / leftQueueStats.mean) * 100 : 0,
    readbackDeltaMs: rightReadbackStats.mean - leftReadbackStats.mean,
    readbackDeltaPercent: leftReadbackStats.mean > 0 ? ((rightReadbackStats.mean - leftReadbackStats.mean) / leftReadbackStats.mean) * 100 : 0,
    cpuValidationDeltaMs: rightCpuStats.mean - leftCpuStats.mean,
    cpuValidationDeltaPercent: leftCpuStats.mean > 0 ? ((rightCpuStats.mean - leftCpuStats.mean) / leftCpuStats.mean) * 100 : 0,
    throughputMultiplier: leftHpsStats.mean > 0 ? rightHpsStats.mean / leftHpsStats.mean : 0,
    compatibleIdentityFields: Object.keys(leftIdentity).filter((key) => leftIdentity[key] !== undefined),
  };
}

export function buildProfilingExport({
  result,
  capabilities = null,
  userAgent = "unavailable",
  projectVersion = "0.1.0",
  gitCommit = null,
  timestamp = new Date().toISOString(),
} = {}) {
  if (!result || result.stage !== SYNTHETIC_PROFILING_MODE) {
    throw new Error("profiling export requires one completed profiling iteration");
  }
  const validation = validateProfilingResult(result);
  const syntheticLikeExport = result.outputReadback ? buildSyntheticBenchmarkExport({
    result: {
      stage: "webgpu-synthetic-nonce-benchmark",
      valid: result.validHashBenchmark,
      correctnessGate: result.correctnessGate,
      fixtureId: result.fixtureId,
      fixtureName: result.fixtureName,
      fixtureHeaderHex: result.fixtureHeaderHex,
      firstPatchedHeaderHex: result.firstPatchedHeaderHex,
      nonceStart: result.nonceStart,
      nonceEnd: result.nonceEnd,
      totalRequested: result.totalRequested,
      resultCount: result.resultCount,
      returnedResultCount: result.returnedResultCount,
      dispatchBatchSize: result.dispatchBatchSize,
      dispatchCount: result.dispatchCount,
      resultsPerDispatch: result.resultsPerDispatch,
      gpuElapsedMs: result.hostPhases.dispatchLoopElapsedMs,
      bufferSetupMs: result.hostPhases.bufferAllocationMs + result.hostPhases.bufferPopulationUploadMs + result.hostPhases.bindGroupCreationMs,
      readbackMs: result.hostPhases.readbackMs,
      cpuComparisonMs: result.hostPhases.cpuGpuComparisonMs,
      pipelineDiagnostics: result.pipelineDiagnostics,
      verifiedHashesPerSecondIncludingPipeline: result.verifiedHashesPerSecondIncludingPipeline,
      verifiedHashesPerSecondExcludingPipeline: result.verifiedHashesPerSecondExcludingPipeline,
      totalElapsedMs: result.totalElapsedMs,
      workgroup: result.workgroup,
      spotCheckCount: result.spotCheckCount,
      mismatchesAgainstCpuReference: result.mismatchesAgainstCpuReference,
      firstMismatch: result.firstMismatch,
    },
    capabilities,
    userAgent,
    projectVersion,
    gitCommit,
    timestamp,
  }) : null;
  return {
    schemaVersion: 1,
    resultType: SYNTHETIC_PROFILING_RESULT_TYPE,
    telemetryStatus: validation.status,
    telemetryValidationIssues: validation.issues,
    environment: {
      timestamp,
      userAgent,
      webgpuVendor: capabilities?.adapterInfo?.vendor || "unavailable",
      adapterDescription: capabilities?.adapterInfo
        ? [capabilities.adapterInfo.vendor, capabilities.adapterInfo.architecture, capabilities.adapterInfo.device, capabilities.adapterInfo.description].filter(Boolean).join(" / ") || "adapter available"
        : "unavailable",
      adapterLimits: limitObject(capabilities?.limits || result.pipelineDiagnostics?.adapterLimits),
      deviceLimits: limitObject(result.pipelineDiagnostics?.deviceLimits),
      shaderUtf8Bytes: result.pipelineDiagnostics?.shaderUtf8Bytes ?? null,
      shaderCodeUnits: result.pipelineDiagnostics?.shaderCodeUnits ?? null,
      shaderPipelineKey: result.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
      pipelineKey: result.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
      projectVersion,
      gitCommit,
      gitCommitSource: gitCommit ? "provided" : "not available in static browser app",
    },
    configuration: {
      mode: SYNTHETIC_PROFILING_MODE,
      fixtureId: result.fixtureId,
      fixtureName: result.fixtureName,
      headerHex: result.fixtureHeaderHex,
      startNonce: result.nonceStart,
      endNonce: result.nonceEnd,
      hashCount: result.totalRequested,
      hashesCompleted: result.resultCount,
      dispatchBatchSize: result.dispatchBatchSize,
      dispatchCount: result.dispatchCount,
      logicalDispatchCount: result.logicalDispatchCount,
      physicalSubmissionCount: result.physicalSubmissionCount,
      queueWaitCount: result.queueWaitCount,
      readbackCount: result.readbackCount,
      commandBufferCount: result.commandBufferCount,
      wgslWorkgroupSize: result.workgroup.wgslWorkgroupSize,
      workgroupsPerRepresentativeDispatch: result.workgroup.workgroupsDispatched,
      totalWorkgroups: result.perDispatch.reduce((total, entry) => total + entry.workgroupCount, 0),
      totalActiveInvocations: result.perDispatch.reduce((total, entry) => total + entry.activeInvocations, 0),
      readbackStrategy: result.readbackStrategy.id,
      readbackStrategyLabel: result.readbackStrategy.label,
      repetitionCount: 1,
      algorithmId: SYNTHETIC_ALGORITHM_ID,
      outputSizeBytes: result.outputSizeBytes,
      combinedOutputByteSize: result.combinedOutputByteSize,
      outputOffsetMap: result.outputOffsetMap,
      deterministicResultOrdering: result.deterministicResultOrdering,
    },
    correctness: {
      correctnessGateStatus: result.correctnessGate?.passed ? "passed" : "failed",
      correctnessGateBatchSize: SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
      cpuSpotCheckStatus: result.cpuSpotChecked ? result.spotCheckStatus : "disabled for profiling-only probe",
      cpuSpotChecksSelected: result.spotCheckCount,
      cpuSpotChecksFailed: result.mismatchesAgainstCpuReference,
      mismatchCount: result.mismatchesAgainstCpuReference,
      firstMismatch: result.firstMismatch,
      pipelineError: result.pipelineError,
      validHashBenchmark: result.validHashBenchmark,
    },
    timing: {
      hostPhases: result.hostPhases,
      perDispatch: result.perDispatch,
      aggregateInterpretation: result.interpretation,
      timingSourceNotes: [
        "Browser-observed elapsed time only.",
        "Queue completion wait is not a shader hardware counter.",
        "WebGPU does not expose occupancy, instruction throughput, power, temperature, or shader-internal bottleneck counters to this page.",
      ],
      syntheticCompatibleExport: syntheticLikeExport,
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
      validHashBenchmark: result.validHashBenchmark,
      profilingOnly: result.profilingOnly,
      outputReadback: result.outputReadback,
      cpuSpotChecked: result.cpuSpotChecked,
      resultType: SYNTHETIC_PROFILING_RESULT_TYPE,
    },
  };
}

export function buildProfilingSummaryExport({
  summary,
  comparison = null,
  capabilities = null,
  userAgent = "unavailable",
  projectVersion = "0.1.0",
  gitCommit = null,
  timestamp = new Date().toISOString(),
} = {}) {
  return {
    ...summary,
    sampleCount: summary.validRunCount,
    profilingComparison: comparison,
    environment: {
      timestamp,
      userAgent,
      webgpuVendor: capabilities?.adapterInfo?.vendor || "unavailable",
      adapterDescription: capabilities?.adapterInfo
        ? [capabilities.adapterInfo.vendor, capabilities.adapterInfo.architecture, capabilities.adapterInfo.device, capabilities.adapterInfo.description].filter(Boolean).join(" / ") || "adapter available"
        : "unavailable",
      adapterLimits: limitObject(capabilities?.limits || summary.iterations?.[0]?.pipelineDiagnostics?.adapterLimits),
      deviceLimits: limitObject(summary.iterations?.[0]?.pipelineDiagnostics?.deviceLimits),
      shaderUtf8Bytes: summary.iterations?.[0]?.pipelineDiagnostics?.shaderUtf8Bytes ?? null,
      shaderCodeUnits: summary.iterations?.[0]?.pipelineDiagnostics?.shaderCodeUnits ?? null,
      shaderPipelineKey: summary.iterations?.[0]?.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
      pipelineKey: summary.iterations?.[0]?.pipelineDiagnostics?.pipelineKey || "whirlpool-batched",
      projectVersion,
      gitCommit,
      gitCommitSource: gitCommit ? "provided" : "not available in static browser app",
    },
  };
}

export function serializeProfilingExport(exportObject) {
  return `${JSON.stringify(exportObject, null, 2)}\n`;
}

export function profilingExportFilename(exportObject) {
  const hashCount = exportObject?.configuration?.hashCount || "unknown";
  const batchSize = exportObject?.configuration?.dispatchBatchSize || "unknown";
  const strategy = exportObject?.configuration?.readbackStrategy || "unknown";
  const timestamp = String(exportObject?.environment?.timestamp || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-zT_Z-]/g, "-");
  return `caps-webgpu-profiling-${hashCount}-batch-${batchSize}-${strategy}-${timestamp}.json`;
}

export function profilingSummaryFilename(exportObject) {
  const hashCount = exportObject?.configuration?.hashCount || "unknown";
  const batchSize = exportObject?.configuration?.dispatchBatchSize || "unknown";
  const repetitions = exportObject?.configuration?.repetitionCount || "unknown";
  const timestamp = String(exportObject?.environment?.timestamp || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-zT_Z-]/g, "-");
  return `caps-webgpu-profiling-summary-${hashCount}-batch-${batchSize}-rep-${repetitions}-${timestamp}.json`;
}

export function profilingHistoryEntry(exportObject) {
  return {
    timestamp: exportObject.environment.timestamp,
    hashCount: exportObject.configuration.hashCount,
    batchSize: exportObject.configuration.dispatchBatchSize,
    readbackStrategy: exportObject.configuration.readbackStrategy,
    dispatchCount: exportObject.configuration.dispatchCount,
    totalElapsedMs: exportObject.timing.hostPhases.totalBenchmarkElapsedMs,
    queueCompletionWaitMs: exportObject.timing.hostPhases.queueCompletionWaitMs,
    readbackMs: exportObject.timing.hostPhases.readbackMs,
    cpuValidationMs: exportObject.timing.hostPhases.cpuGpuComparisonMs,
    interpretation: exportObject.timing.aggregateInterpretation.interpretation,
    pass: exportObject.telemetryStatus === "valid profiling telemetry",
    validHashBenchmark: exportObject.boundaries.validHashBenchmark,
  };
}

export function addProfilingHistoryEntry(history, exportObject, maxEntries = MAX_PROFILING_HISTORY_ENTRIES) {
  return [profilingHistoryEntry(exportObject), ...history].slice(0, maxEntries);
}
