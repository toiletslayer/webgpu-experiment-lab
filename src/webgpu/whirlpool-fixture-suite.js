import { fixtureHeaderBytes, WHIRLPOOL_HEADER_FIXTURES, WHIRLPOOL_NONCE_COUNTS } from "../vectors/whirlpool-fixtures.js";
import { WGSL_WORKGROUP_SIZE, isNonceRangeSafe, runWebGPUWhirlpoolBatch, runWebGPUWhirlpoolMinimal } from "./whirlpool-minimal.js";

export const WGSL_BATCH_SIZE_OPTIONS = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
export const DEFAULT_WGSL_BATCH_SIZE = 1;

export const DEFAULT_WGSL_CORE_VERIFICATION_SUBSET = Object.freeze({
  id: "one-fixture-one-nonce",
  label: "1 fixture x 1 nonce",
  fixtureIds: Object.freeze(["zero-header"]),
  nonceCounts: Object.freeze([1]),
});

export const FULL_CORE_VECTOR_VERIFICATION_PRESET = Object.freeze({
  id: "full-294-core-vectors",
  label: "Full 294 Core vectors",
  fixtureIds: Object.freeze(WHIRLPOOL_HEADER_FIXTURES.map((fixture) => fixture.id)),
  nonceCounts: Object.freeze(WHIRLPOOL_NONCE_COUNTS),
  fullVector: true,
  expectedCoreVectorCount: 294,
});

export const WGSL_CORE_VERIFICATION_PRESETS = Object.freeze([
  DEFAULT_WGSL_CORE_VERIFICATION_SUBSET,
  Object.freeze({
    id: "one-fixture-two-nonces",
    label: "1 fixture x 2 nonces",
    fixtureIds: Object.freeze(["zero-header"]),
    nonceCounts: Object.freeze([2]),
  }),
  Object.freeze({
    id: "one-fixture-four-nonces",
    label: "1 fixture x 4 nonces",
    fixtureIds: Object.freeze(["zero-header"]),
    nonceCounts: Object.freeze([4]),
  }),
  Object.freeze({
    id: "three-fixtures-one-nonce",
    label: "3 fixtures x 1 nonce",
    fixtureIds: Object.freeze(["zero-header", "incrementing-bytes", "high-bit-bytes"]),
    nonceCounts: Object.freeze([1]),
  }),
  Object.freeze({
    id: "three-fixtures-two-nonces",
    label: "3 fixtures x 2 nonces",
    fixtureIds: Object.freeze(["zero-header", "incrementing-bytes", "high-bit-bytes"]),
    nonceCounts: Object.freeze([2]),
  }),
  Object.freeze({
    id: "ten-fixtures-one-nonce",
    label: "10 fixtures x 1 nonce",
    fixtureIds: Object.freeze([
      "zero-header",
      "incrementing-bytes",
      "high-bit-bytes",
      "deterministic-random",
      "realistic-fields",
      "time-mutated",
      "bits-mutated",
      "merkle-mutated",
      "near-overflow-nonce",
      "overflow-rejected",
    ]),
    nonceCounts: Object.freeze([1]),
  }),
  FULL_CORE_VECTOR_VERIFICATION_PRESET,
]);

export function verificationPresetById(id, presets = WGSL_CORE_VERIFICATION_PRESETS) {
  return presets.find((preset) => preset.id === id) || DEFAULT_WGSL_CORE_VERIFICATION_SUBSET;
}

export function selectWhirlpoolFixtures(fixtures = WHIRLPOOL_HEADER_FIXTURES, fixtureIds = null) {
  if (!fixtureIds) return fixtures;
  const wanted = new Set(fixtureIds);
  return fixtures.filter((fixture) => wanted.has(fixture.id));
}

export function buildWhirlpoolFixturePlan({
  fixtures = WHIRLPOOL_HEADER_FIXTURES,
  nonceCounts = WHIRLPOOL_NONCE_COUNTS,
} = {}) {
  const cases = [];
  for (const fixture of fixtures) {
    for (const nonceCount of nonceCounts) {
      const safe = isNonceRangeSafe(fixture.nonceStart, nonceCount);
      cases.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: fixture.nonceStart,
        nonceCount,
        safe,
        rejectionReason: safe
          ? null
          : `nonce range overflows uint32 or exceeds supported count: start=${fixture.nonceStart} count=${nonceCount}`,
      });
    }
  }
  return cases;
}

export function batchDispatchCountForResults(resultCount, batchSize = DEFAULT_WGSL_BATCH_SIZE) {
  if (resultCount <= 0) return 0;
  return Math.ceil(resultCount / Math.max(1, batchSize));
}

export function summarizeWhirlpoolFixtureResults(results) {
  const executed = results.filter((result) => result.executed);
  const rejected = results.filter((result) => !result.executed);
  const failedBeforeDispatch = results.filter((result) => result.failedBeforeDispatch);
  const mismatches = executed.reduce((sum, result) => sum + result.mismatchesAgainstCpuReference, 0);
  const resultCount = executed.reduce((sum, result) => sum + result.resultCount, 0);
  const dispatchIndexes = new Set();
  for (const result of executed) {
    for (const dispatchIndex of result.batchDispatchIndexes || []) {
      dispatchIndexes.add(dispatchIndex);
    }
  }
  const dispatchCount = dispatchIndexes.size > 0
    ? dispatchIndexes.size
    : executed.reduce((sum, result) => sum + result.dispatchCount, 0);
  const readbackMs = executed.reduce((sum, result) => sum + result.readbackMs, 0);
  const gpuElapsedMs = executed.reduce((sum, result) => sum + result.gpuElapsedMs, 0);
  const bufferSetupMs = executed.reduce((sum, result) => sum + (result.bufferSetupMs || 0), 0);
  const cpuComparisonMs = executed.reduce((sum, result) => sum + (result.cpuComparisonMs || 0), 0);
  const pipelineSetupMs = executed.reduce((sum, result) => sum + (result.pipelineSetupMs || 0), 0);
  const hashWorkExcludingPipelineMs = bufferSetupMs + gpuElapsedMs + readbackMs + cpuComparisonMs;
  const totalElapsedMs = executed.reduce((sum, result) => sum + result.totalElapsedMs, 0);
  const firstMismatchCase = executed.find((result) => result.firstMismatch);
  const firstPipelineErrorCase = failedBeforeDispatch[0];
  const firstDiagnostics = executed.find((result) => result.pipelineDiagnostics)?.pipelineDiagnostics
    || firstPipelineErrorCase?.pipelineDiagnostics
    || null;
  const executedCacheStatuses = new Set(executed.map((result) => result.pipelineCacheStatus || "unknown"));

  let shaderStatus = "Real WebGPU Whirlpool hashing: Partial verification only";
  let wgslCoreStatus = "WGSL/Core verification: Pending";
  if (executed.length > 0 && mismatches === 0) {
    shaderStatus = "Real WebGPU Whirlpool hashing: Passed selected subset";
    wgslCoreStatus = "WGSL/Core verification: Passed selected subset";
  }
  if (mismatches > 0) {
    shaderStatus = "Real WebGPU Whirlpool hashing: Failed verification";
    wgslCoreStatus = "WGSL/Core verification: Failed hash comparison";
  }
  if (failedBeforeDispatch.length > 0) {
    shaderStatus = "Real WebGPU Whirlpool hashing: Failed before dispatch";
    wgslCoreStatus = "WGSL/Core verification: Failed before dispatch";
  }

  return {
    stage: "webgpu-whirlpool-minimal",
    shaderStatus,
    wgslCoreStatus,
    fixtureCasesExecuted: executed.length,
    fixtureCasesRejected: rejected.length,
    fixtureCasesFailedBeforeDispatch: failedBeforeDispatch.length,
    fixtureCount: new Set(executed.map((result) => result.fixtureId)).size,
    nonceCountsTested: Array.from(new Set(executed.map((result) => result.nonceCount))).sort((a, b) => a - b),
    testedNonces: executed.map((result) => `${result.fixtureId}:${result.nonceStart}..${result.nonceStart + result.nonceCount - 1}`),
    nonceCount: resultCount,
    resultCount,
    dispatchCount,
    resultsPerDispatch: dispatchCount > 0 ? resultCount / dispatchCount : 0,
    mismatchesAgainstCpuReference: mismatches,
    firstMismatch: firstMismatchCase?.firstMismatch
      ? {
          fixtureId: firstMismatchCase.fixtureId,
          fixtureName: firstMismatchCase.fixtureName,
          nonceCount: firstMismatchCase.nonceCount,
          ...firstMismatchCase.firstMismatch,
        }
      : null,
    rejectedCases: rejected.map((result) => ({
      fixtureId: result.fixtureId,
      fixtureName: result.fixtureName,
      nonceStart: result.nonceStart,
      nonceCount: result.nonceCount,
      rejectionReason: result.rejectionReason,
    })),
    firstPipelineError: firstPipelineErrorCase
      ? {
          fixtureId: firstPipelineErrorCase.fixtureId,
          fixtureName: firstPipelineErrorCase.fixtureName,
          nonceCount: firstPipelineErrorCase.nonceCount,
          error: firstPipelineErrorCase.error,
          pipelineDiagnostics: firstPipelineErrorCase.pipelineDiagnostics,
        }
      : null,
    pipelineDiagnostics: firstDiagnostics,
    gpuElapsedMs,
    bufferSetupMs,
    readbackMs,
    cpuComparisonMs,
    pipelineSetupMs,
    hashWorkExcludingPipelineMs,
    verifiedHashesPerSecondExcludingPipeline: hashWorkExcludingPipelineMs > 0 ? (resultCount * 1000) / hashWorkExcludingPipelineMs : 0,
    verifiedHashesPerSecondIncludingPipeline: totalElapsedMs > 0 ? (resultCount * 1000) / totalElapsedMs : 0,
    pipelineReused: executed.length > 0 ? executed.every((result) => result.pipelineReused) : false,
    pipelineCacheStatus: executed.length === 0
      ? "miss"
      : executedCacheStatuses.size === 1
        ? Array.from(executedCacheStatuses)[0]
        : "mixed",
    totalElapsedMs,
  };
}

export function formatWhirlpoolFixtureFailure(summary) {
  if (!summary.firstMismatch) return "None";
  return JSON.stringify(summary.firstMismatch, null, 2);
}

export async function runWebGPUWhirlpoolFixtureSuite({
  fixtures = WHIRLPOOL_HEADER_FIXTURES,
  nonceCounts = WHIRLPOOL_NONCE_COUNTS,
  subset = null,
  gpu = navigator.gpu,
  onProgress = () => {},
  batchSize = DEFAULT_WGSL_BATCH_SIZE,
  workgroupSize = WGSL_WORKGROUP_SIZE,
} = {}) {
  const selectedFixtures = subset?.fixtureIds ? selectWhirlpoolFixtures(fixtures, subset.fixtureIds) : fixtures;
  const selectedNonceCounts = subset?.nonceCounts || nonceCounts;
  const plan = buildWhirlpoolFixturePlan({ fixtures: selectedFixtures, nonceCounts: selectedNonceCounts });
  const results = [];

  if (batchSize > 1 || workgroupSize !== WGSL_WORKGROUP_SIZE) {
    return runWebGPUWhirlpoolBatchedFixtureSuite({
      fixtures,
      selectedFixtures,
      selectedNonceCounts,
      plan,
      subset,
      gpu,
      onProgress,
      batchSize,
      workgroupSize,
    });
  }

  for (const planned of plan) {
    if (!planned.safe) {
      const rejected = {
        ...planned,
        executed: false,
        resultCount: 0,
        dispatchCount: 0,
        mismatchesAgainstCpuReference: 0,
        firstMismatch: null,
        gpuElapsedMs: 0,
        readbackMs: 0,
        totalElapsedMs: 0,
      };
      results.push(rejected);
      onProgress({ ...rejected, completedCases: results.length, totalCases: plan.length });
      continue;
    }

    const fixture = fixtures.find((entry) => entry.id === planned.fixtureId);
    // CPU hashing is used only after GPU readback to verify results; it is not a fallback output path.
    let result;
    try {
      result = await runWebGPUWhirlpoolMinimal({
        header80: fixtureHeaderBytes(fixture),
        nonceStart: planned.nonceStart,
        nonceCount: planned.nonceCount,
        gpu,
        workgroupSize,
      });
    } catch (error) {
      const failed = {
        ...planned,
        executed: false,
        failedBeforeDispatch: true,
        resultCount: 0,
        dispatchCount: 0,
        mismatchesAgainstCpuReference: 0,
        firstMismatch: null,
        gpuElapsedMs: 0,
        readbackMs: 0,
        totalElapsedMs: 0,
        error: error instanceof Error ? error.message : String(error),
        pipelineDiagnostics: error?.webgpuDiagnostics || null,
      };
      results.push(failed);
      onProgress({ ...failed, completedCases: results.length, totalCases: plan.length });
      break;
    }
    const executed = {
      ...planned,
      ...result,
      fixtureId: fixture.id,
      fixtureName: fixture.name,
      executed: true,
    };
    results.push(executed);
    onProgress({ ...executed, completedCases: results.length, totalCases: plan.length });

    if (executed.mismatchesAgainstCpuReference > 0) {
      break;
    }
  }

  const summary = summarizeWhirlpoolFixtureResults(results);
  return {
    ...summary,
    subset: subset
      ? {
          id: subset.id || "custom",
          label: subset.label || "custom subset",
          fixtureIds: Array.from(subset.fixtureIds || selectedFixtures.map((fixture) => fixture.id)),
          nonceCounts: Array.from(selectedNonceCounts),
          fullVector: Boolean(subset.fullVector),
          expectedCoreVectorCount: subset.expectedCoreVectorCount || null,
          batchSize,
          workgroupSize,
        }
      : {
          id: "full-fixture-plan",
          label: "full fixture plan",
          fixtureIds: selectedFixtures.map((fixture) => fixture.id),
          nonceCounts: Array.from(selectedNonceCounts),
          fullVector: false,
          expectedCoreVectorCount: null,
          batchSize,
          workgroupSize,
        },
    results,
  };
}

async function runWebGPUWhirlpoolBatchedFixtureSuite({
  fixtures,
  selectedFixtures,
  selectedNonceCounts,
  plan,
  subset,
  gpu,
  onProgress,
  batchSize,
  workgroupSize = WGSL_WORKGROUP_SIZE,
}) {
  const resultsByCase = new Map();
  const tasks = [];
  const rejectedResults = [];

  for (const planned of plan) {
    if (!planned.safe) {
      const rejected = {
        ...planned,
        executed: false,
        resultCount: 0,
        dispatchCount: 0,
        batchSize,
        workgroupSize,
        batchDispatchIndexes: [],
        mismatchesAgainstCpuReference: 0,
        firstMismatch: null,
        gpuElapsedMs: 0,
        bufferSetupMs: 0,
        readbackMs: 0,
        cpuComparisonMs: 0,
        totalElapsedMs: 0,
      };
      rejectedResults.push(rejected);
      continue;
    }
    const fixture = fixtures.find((entry) => entry.id === planned.fixtureId);
    const caseKey = `${planned.fixtureId}:${planned.nonceStart}:${planned.nonceCount}`;
    resultsByCase.set(caseKey, {
      ...planned,
      executed: true,
      stage: "webgpu-whirlpool-batched",
      batchSize,
      workgroupSize,
      batchDispatchIndexes: [],
      resultCount: 0,
      dispatchCount: 0,
      resultsPerDispatch: batchSize,
      results: [],
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
      gpuElapsedMs: 0,
      bufferSetupMs: 0,
      readbackMs: 0,
      cpuComparisonMs: 0,
      pipelineSetupMs: 0,
      totalElapsedMs: 0,
      pipelineReused: false,
      pipelineCacheStatus: "miss",
      pipelineDiagnostics: null,
    });
    for (let offset = 0; offset < planned.nonceCount; offset += 1) {
      tasks.push({
        header80: fixtureHeaderBytes(fixture),
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: planned.nonceStart,
        nonceCount: planned.nonceCount,
        nonce: (planned.nonceStart + offset) >>> 0,
        caseKey,
      });
    }
  }

  let completedTasks = 0;
  let firstPipelineError = null;
  for (let start = 0; start < tasks.length; start += batchSize) {
    const dispatchIndex = Math.floor(start / batchSize);
    const chunk = tasks.slice(start, start + batchSize);
    let batchResult;
    try {
      batchResult = await runWebGPUWhirlpoolBatch({ tasks: chunk, gpu, workgroupSize });
    } catch (error) {
      firstPipelineError = {
        ...chunk[0],
        executed: false,
        failedBeforeDispatch: true,
        resultCount: 0,
        dispatchCount: 0,
        batchSize,
        workgroupSize,
        batchDispatchIndexes: [dispatchIndex],
        mismatchesAgainstCpuReference: 0,
        firstMismatch: null,
        gpuElapsedMs: 0,
        bufferSetupMs: 0,
        readbackMs: 0,
        cpuComparisonMs: 0,
        totalElapsedMs: 0,
        error: error instanceof Error ? error.message : String(error),
        pipelineDiagnostics: error?.webgpuDiagnostics || null,
      };
      break;
    }

    for (const row of batchResult.results) {
      const caseResult = resultsByCase.get(row.caseKey);
      const rowWithBatch = {
        ...row,
        batchSize,
        dispatchIndex,
        indexWithinDispatch: row.index,
      };
      caseResult.results.push(rowWithBatch);
      caseResult.resultCount += 1;
      caseResult.batchDispatchIndexes.push(dispatchIndex);
      if (!rowWithBatch.match) {
        caseResult.mismatchesAgainstCpuReference += 1;
        caseResult.firstMismatch ||= rowWithBatch;
      }
    }

    const firstCase = resultsByCase.get(chunk[0].caseKey);
    firstCase.gpuElapsedMs += batchResult.gpuElapsedMs;
    firstCase.bufferSetupMs += batchResult.bufferSetupMs;
    firstCase.readbackMs += batchResult.readbackMs;
    firstCase.cpuComparisonMs += batchResult.cpuComparisonMs;
    firstCase.pipelineSetupMs += batchResult.pipelineSetupMs;
    firstCase.totalElapsedMs += batchResult.totalElapsedMs;
    firstCase.pipelineReused = batchResult.pipelineReused;
    firstCase.pipelineCacheStatus = batchResult.pipelineCacheStatus;
    firstCase.pipelineDiagnostics = batchResult.pipelineDiagnostics;
    firstCase.dispatchCount = 1;
    firstCase.resultsPerDispatch = batchResult.resultsPerDispatch;

    completedTasks += chunk.length;
    onProgress({
      ...chunk[chunk.length - 1],
      fixtureName: chunk[chunk.length - 1].fixtureName,
      completedCases: completedTasks,
      totalCases: tasks.length,
      nonceCount: chunk.length,
      batchSize,
    });

    if (batchResult.mismatchesAgainstCpuReference > 0) {
      break;
    }
  }

  const results = [
    ...Array.from(resultsByCase.values()).filter((result) => result.resultCount > 0),
    ...rejectedResults,
  ];
  if (firstPipelineError) {
    results.push(firstPipelineError);
  }

  for (const result of results) {
    if (result.executed) {
      result.batchDispatchIndexes = Array.from(new Set(result.batchDispatchIndexes));
      result.dispatchCount = result.batchDispatchIndexes.length;
      result.results.sort((a, b) => a.nonce - b.nonce);
    }
  }

  const summary = summarizeWhirlpoolFixtureResults(results);
  return {
    ...summary,
    stage: "webgpu-whirlpool-batched",
    shaderStatus: summary.mismatchesAgainstCpuReference === 0 && summary.fixtureCasesFailedBeforeDispatch === 0
      ? "Real WebGPU Whirlpool hashing: Passed batched selected subset"
      : summary.shaderStatus,
    batchSize,
    subset: subset
      ? {
          id: subset.id || "custom",
          label: subset.label || "custom subset",
          fixtureIds: Array.from(subset.fixtureIds || selectedFixtures.map((fixture) => fixture.id)),
          nonceCounts: Array.from(selectedNonceCounts),
          fullVector: Boolean(subset.fullVector),
          expectedCoreVectorCount: subset.expectedCoreVectorCount || null,
          batchSize,
          workgroupSize,
        }
      : {
          id: "full-fixture-plan",
          label: "full fixture plan",
          fixtureIds: selectedFixtures.map((fixture) => fixture.id),
          nonceCounts: Array.from(selectedNonceCounts),
          fullVector: false,
          expectedCoreVectorCount: null,
          batchSize,
          workgroupSize,
        },
    results,
  };
}
