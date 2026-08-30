import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  EXECUTION_MODES,
  benchmarkSnapshot,
  canRunHashBenchmark,
  createBenchmarkState,
} from "../src/benchmark/benchmark-engine.js";
import {
  buildHeader80,
  bytesToHex,
  capstashPoWHashHex,
  capstashPoWInternalHex,
  hexToBytes,
  parseHeader80,
  patchBits,
  patchMerkleRoot,
  patchNonce,
  patchTime,
  readLe32,
} from "../src/cpu/capstash-pow.js";
import { runCorrectnessTests } from "../src/cpu/correctness.js";
import { whirlpool512 } from "../src/cpu/whirlpool.js";
import { CAPSTASH_POW_TEST_VECTORS, WHIRLPOOL_TEST_VECTORS } from "../src/vectors/consensus-vectors.js";
import {
  compareCoreVectorsToCpu,
  compareCoreVectorsToWgslSuite,
  summarizeCoreVectorData,
} from "../src/vectors/core-vector-compare.js";
import {
  fixtureHeaderBytes,
  WHIRLPOOL_HEADER_FIXTURES,
  WHIRLPOOL_NONCE_COUNTS,
} from "../src/vectors/whirlpool-fixtures.js";
import {
  buildCpuReferenceRows,
  comparePlumbingRowsToCpuReference,
  fakePlumbingHashHex,
  fakePlumbingHashWords,
  headerBytesToWords,
  wordsToInternalHashHex,
} from "../src/webgpu/plumbing-proof.js";
import { formatPipelineTimingView } from "../src/ui/pipeline-timing.js";
import {
  assertMinimalWhirlpoolInputs,
  buildBatchedWhirlpoolShader,
  buildMinimalWhirlpoolShader,
  buildWhirlpoolBatchCpuRows,
  buildWhirlpool80CpuCheckpoints,
  buildLogicalDispatchPlan,
  buildWhirlpoolCpuReferenceRows,
  compareWhirlpoolGpuRows,
  isNonceRangeSafe,
  MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT,
  MAX_WHIRLPOOL_BATCH_TASKS,
  outputOffsetRangesOverlap,
  validateWebGPUWorkgroupSize,
  whirlpoolPipelineKey,
  workgroupInvocationPlan,
  WORKGROUP_SIZE_OPTIONS,
} from "../src/webgpu/whirlpool-minimal.js";
import {
  DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE,
  DEFAULT_SYNTHETIC_HASH_COUNT,
  SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE,
  SYNTHETIC_CORRECTNESS_GATE_PRESET_ID,
  SYNTHETIC_DOCUMENTED_RESULT,
  SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS,
  SYNTHETIC_FIXTURE_ID,
  SYNTHETIC_HASH_COUNT_OPTIONS,
  SYNTHETIC_8192_REPEATED_RUNS,
  SYNTHETIC_LADDER_RESULTS,
  addSyntheticHistoryEntry,
  buildSyntheticRepeatedRunSummary,
  buildSyntheticBenchmarkExport,
  buildSyntheticNonceRange,
  buildSyntheticTasks,
  calculateStats,
  clearSyntheticHistory,
  compatibleSyntheticRuns,
  formatSyntheticMismatch,
  serializeSyntheticRepeatedRunSummary,
  serializeSyntheticBenchmarkExport,
  selectSyntheticSpotCheckIndexes,
  syntheticBatchPlan,
  syntheticBenchmarkExportFilename,
  syntheticDispatchCount,
  syntheticFixture,
  syntheticRepeatedRunSummaryFilename,
  syntheticWorkgroupPlan,
  validateSyntheticBenchmarkResult,
  validateWorkgroupLimit,
  variationLabel,
} from "../src/webgpu/synthetic-benchmark.js";
import {
  DEFAULT_PROFILING_PRESET,
  DEFAULT_PROFILING_READBACK_STRATEGY,
  DEFAULT_PROFILING_REPETITIONS,
  MAX_PROFILING_HISTORY_ENTRIES,
  PROFILING_PRESETS,
  PROFILING_READBACK_STRATEGIES,
  PROFILING_REPETITION_OPTIONS,
  addProfilingHistoryEntry,
  buildProfilingOutputOffsetMap,
  buildProfilingExport,
  buildProfilingSummary,
  buildProfilingSummaryExport,
  compareProfilingStrategyExports,
  compatibleProfilingRuns,
  expandProfilingComparisonSamples,
  interpretProfilingPhases,
  profilingPhysicalAccounting,
  profilingExportFilename,
  profilingOutputSizeBytes,
  profilingPresetById,
  profilingReadbackStrategyById,
  profilingSummaryFilename,
  serializeProfilingExport,
  validateProfilingResult,
} from "../src/webgpu/synthetic-profiling.js";
import {
  DEFAULT_WGSL_BATCH_SIZE,
  DEFAULT_WGSL_CORE_VERIFICATION_SUBSET,
  FULL_CORE_VECTOR_VERIFICATION_PRESET,
  WGSL_BATCH_SIZE_OPTIONS,
  WGSL_CORE_VERIFICATION_PRESETS,
  batchDispatchCountForResults,
  buildWhirlpoolFixturePlan,
  formatWhirlpoolFixtureFailure,
  selectWhirlpoolFixtures,
  summarizeWhirlpoolFixtureResults,
  verificationPresetById,
} from "../src/webgpu/whirlpool-fixture-suite.js";
import {
  DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  FULL_294_WORKGROUP_EXPERIMENT_BATCH_SIZE,
  WORKGROUP_EXPERIMENT_ACTIONS,
  WORKGROUP_EXPERIMENT_ACTION_LABELS,
  WORKGROUP_EXPERIMENT_MODE,
  buildMatchedWorkgroupComparison,
  buildWorkgroupExperimentExport,
  completeWorkgroupActionTelemetry,
  createWorkgroupActionTelemetry,
  compareWorkgroupPerformance,
  createWorkgroupStatusMap,
  matchedWorkgroupComparisonFilename,
  matchedWorkgroupComparisonPrerequisites,
  matchedWorkgroupExecutionOrder,
  normalizeWorkgroupExperimentAction,
  performanceComparisonCandidates,
  serializeMatchedWorkgroupComparison,
  serializeWorkgroupExperimentExport,
  summarizeWorkgroupProfilingResult,
  validateMatchedWorkgroupProfileSample,
  workgroupChunkAccounting,
  workgroupDeviceSupportRows,
  workgroupExperimentFilename,
  workgroupExecutedVerificationAccounting,
  workgroupExperimentInvocationAccounting,
  workgroupProfilingInvocationAccounting,
  workgroupExperimentStatusTemplate,
  workgroupPerformanceActionAvailable,
  workgroupPerformanceEligible,
} from "../src/webgpu/workgroup-experiment.js";
import {
  WEBMCP_TOOL_SCHEMAS,
  WEBMCP_VERIFICATION_LEVELS,
  buildComputeEnvironmentResult,
  buildExperimentStatusResult,
  buildVerificationResult,
  createWebMCPChallengeTools,
  registerWebMCPChallengeTools,
} from "../src/webmcp/challenge-tools.js";

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomHex32(next) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 4) {
    const value = next();
    bytes[i] = value & 0xff;
    bytes[i + 1] = (value >>> 8) & 0xff;
    bytes[i + 2] = (value >>> 16) & 0xff;
    bytes[i + 3] = (value >>> 24) & 0xff;
  }
  return bytesToHex(bytes);
}

function makeRandomHeader(next) {
  return {
    version: next(),
    previousBlockHash: randomHex32(next),
    merkleRoot: randomHex32(next),
    time: next(),
    bits: next(),
    nonce: next(),
  };
}

function loadCoreVectorJson() {
  return JSON.parse(readFileSync(new URL("../vectors/capstash-core-pow-vectors.json", import.meta.url), "utf8"));
}

function loadPackageJson() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
}

function mockSyntheticResult(overrides = {}) {
  const fixture = syntheticFixture();
  return {
    stage: "webgpu-synthetic-nonce-benchmark",
    valid: true,
    blocked: false,
    correctnessGate: {
      passed: true,
      presetLabel: "10 fixtures x 1 nonce",
      batchSize: 64,
      result: {
        fixtureCasesExecuted: 10,
        resultCount: 10,
        mismatchesAgainstCpuReference: 0,
      },
    },
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    fixtureHeaderHex: fixture.headerHex,
    firstPatchedHeaderHex: fixture.headerHex,
    nonceStart: fixture.nonceStart,
    nonceEnd: fixture.nonceStart + 255,
    totalRequested: 256,
    resultCount: 256,
    returnedResultCount: 256,
    dispatchBatchSize: 64,
    dispatchCount: 4,
    resultsPerDispatch: 64,
    gpuElapsedMs: 13.6,
    bufferSetupMs: 0.8,
    readbackMs: 3.7,
    cpuComparisonMs: 2.9,
    pipelineSetupMs: 0,
    hashWorkExcludingPipelineMs: 18.1,
    verifiedHashesPerSecondExcludingPipeline: 14100,
    verifiedHashesPerSecondIncludingPipeline: 10800,
    totalElapsedMs: 23.6,
    pipelineReused: true,
    pipelineCacheStatus: "hit",
    pipelineDiagnostics: {
      pipelineKey: "whirlpool-batched",
      coldPipelineCreationMs: 26462.9,
      coldPipelineCreationAppliesToCurrentRun: false,
      coldPipelineCreationObservedAt: "2026-07-18T00:00:00.000Z",
      pipelineCacheStatus: "hit",
      thisRunPipelineCreationMs: 0,
      thisRunTotalElapsedMs: 23.6,
      deviceLimits: {
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupsPerDimension: 65535,
        maxStorageBufferBindingSize: 134217728,
      },
    },
    workgroup: {
      wgslWorkgroupSize: 1,
      hashesInDispatch: 64,
      workgroupsDispatched: 64,
      activeInvocationsInPartialFinalWorkgroup: 1,
      maxComputeInvocationsPerWorkgroup: 256,
      workgroupLimitValid: true,
    },
    spotCheckIndexes: [0, 1, 128, 193, 255],
    spotCheckCount: 5,
    spotCheckStatus: "CPU spot-check passed for 5 selected nonces",
    spotCheckResults: [],
    mismatchesAgainstCpuReference: 0,
    firstMismatch: null,
    ...overrides,
  };
}

function mockProfilingResult(overrides = {}) {
  const fixture = syntheticFixture();
  const baseHostPhases = {
    fixtureHeaderPreparationMs: 0.1,
    nonceRangePlanningMs: 0.1,
    outputSizeCalculationMs: 0.1,
    bufferAllocationMs: 1,
    bufferPopulationUploadMs: 2,
    bufferPopulationMs: 0.7,
    bufferUploadMs: 1.3,
    bindGroupCreationMs: 0.5,
    commandEncoderCreationMs: 0.1,
    computePassEncodingMs: 0.4,
    commandFinishMs: 0.1,
    queueSubmissionMs: 0.2,
    queueCompletionWaitMs: 58,
    dispatchLoopElapsedMs: 59,
    mapReadbackWaitMs: 4,
    readbackMs: 5,
    resultDecodingMs: 1,
    cpuSpotCheckSelectionMs: 0.1,
    cpuReferenceHashingMs: 3,
    cpuGpuComparisonMs: 3.5,
    resultObjectConstructionMs: 0.2,
    uiRenderingMs: null,
    totalBenchmarkElapsedMs: 110,
    timingSourceNote: "Browser-observed wall-clock timing; queue completion wait is not a direct shader hardware counter.",
  };
  const base = {
    stage: "webgpu-synthetic-profiling",
    modeLabel: "Synthetic profiling run",
    valid: true,
    validHashBenchmark: true,
    profilingOnly: false,
    outputReadback: true,
    cpuSpotChecked: true,
    readbackStrategy: PROFILING_READBACK_STRATEGIES["current-per-dispatch"],
    correctnessGate: mockSyntheticResult().correctnessGate,
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    fixtureHeaderHex: fixture.headerHex,
    firstPatchedHeaderHex: fixture.headerHex,
    firstSpotCheckCpuInternalHex: "00".repeat(32),
    nonceStart: fixture.nonceStart,
    nonceEnd: fixture.nonceStart + 8191,
    totalRequested: 8192,
    resultCount: 8192,
    returnedResultCount: 8192,
    dispatchBatchSize: 512,
    dispatchCount: 16,
    logicalDispatchCount: 16,
    physicalSubmissionCount: 16,
    queueWaitCount: 16,
    readbackCount: 16,
    commandBufferCount: 16,
    combinedOutputByteSize: 8192 * 32,
    outputOffsetMap: [],
    deterministicResultOrdering: "Each logical dispatch decodes in ascending synthetic nonce order.",
    resultsPerDispatch: 512,
    outputSizeBytes: 8192 * 32,
    spotCheckIndexes: [0, 1, 4096, 8191],
    spotCheckCount: 4,
    spotCheckStatus: "CPU spot-check passed for 4 selected nonces",
    spotCheckResults: [],
    mismatchesAgainstCpuReference: 0,
    firstMismatch: null,
    pipelineError: null,
    pipelineDiagnostics: {
      pipelineKey: "whirlpool-batched",
      deviceLimits: {
        maxComputeInvocationsPerWorkgroup: 256,
      },
    },
    pipelineReused: true,
    pipelineCacheStatus: "hit",
    workgroup: {
      wgslWorkgroupSize: 1,
      hashesInDispatch: 512,
      workgroupsDispatched: 512,
      activeInvocationsInPartialFinalWorkgroup: 1,
      maxComputeInvocationsPerWorkgroup: 256,
      workgroupLimitValid: true,
    },
    hostPhases: baseHostPhases,
    perDispatch: [
      {
        dispatchIndex: 0,
        nonceStart: fixture.nonceStart,
        nonceEnd: fixture.nonceStart + 511,
        hashesSubmitted: 512,
        workgroupCount: 512,
        activeInvocations: 512,
        partialFinalWorkgroupInvocations: 1,
        outputReadback: true,
        timing: {
          taskPreparationMs: 0.1,
          bufferSetupMs: 1,
          bufferPopulationMs: 0.1,
          bufferAllocationMs: 0.5,
          bufferUploadMs: 0.2,
          bindGroupCreationMs: 0.1,
          commandEncoderCreationMs: 0.1,
          computePassEncodingMs: 0.2,
          commandFinishMs: 0.1,
          queueSubmissionMs: 0.1,
          queueCompletionWaitMs: 3,
          dispatchElapsedMs: 3.1,
          mapReadbackWaitMs: 0.2,
          resultDecodingMs: 0.1,
          readbackMs: 0.3,
          cpuReferenceHashingAndComparisonMs: 0.2,
          cpuComparisonMs: 0.2,
          totalDispatchElapsedMs: 4,
        },
      },
    ],
    interpretation: interpretProfilingPhases(baseHostPhases),
    verifiedHashesPerSecondIncludingPipeline: 74400,
    verifiedHashesPerSecondExcludingPipeline: 117000,
    totalElapsedMs: 110,
    telemetryValidation: { valid: true, status: "valid profiling telemetry", issues: [] },
  };
  const merged = { ...base, ...overrides };
  if (overrides.hostPhases) {
    merged.hostPhases = { ...baseHostPhases, ...overrides.hostPhases };
    merged.interpretation = interpretProfilingPhases(merged.hostPhases);
  }
  return merged;
}

function mockVariantBProfilingResult(overrides = {}) {
  return mockProfilingResult({
    readbackStrategy: PROFILING_READBACK_STRATEGIES["multi-dispatch-single-readback"],
    physicalSubmissionCount: 1,
    queueWaitCount: 1,
    readbackCount: 1,
    commandBufferCount: 1,
    outputOffsetMap: buildProfilingOutputOffsetMap(8192, 512),
    deterministicResultOrdering: "Output index equals global task index, preserving ascending synthetic nonce order across one combined readback.",
    perDispatch: buildProfilingOutputOffsetMap(8192, 512).map((entry) => ({
      dispatchIndex: entry.dispatchIndex,
      nonceStart: syntheticFixture().nonceStart + entry.taskOffset,
      nonceEnd: syntheticFixture().nonceStart + entry.taskOffset + entry.hashesSubmitted - 1,
      hashesSubmitted: entry.hashesSubmitted,
      outputDestinationOffset: entry.outputOffset,
      outputByteOffset: entry.outputByteOffset,
      outputByteLength: entry.outputByteLength,
      workgroupCount: entry.hashesSubmitted,
      activeInvocations: entry.hashesSubmitted,
      partialFinalWorkgroupInvocations: 1,
      outputReadback: true,
      timingScope: "combined-submission",
      timingOwner: "aggregate",
      logicalDispatchTimingIndividuallyMeasured: false,
      timing: {},
    })),
    ...overrides,
  });
}

function mockWorkgroup32VariantBProfilingResult(overrides = {}) {
  const offsetMap = buildProfilingOutputOffsetMap(8192, 512, 32);
  return mockVariantBProfilingResult({
    pipelineDiagnostics: {
      pipelineKey: "whirlpool-batched-wg32",
      deviceLimitValidation: { valid: true, workgroupSize: 32 },
      deviceLimits: {
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
      },
    },
    workgroup: {
      wgslWorkgroupSize: 32,
      hashesInDispatch: 512,
      workgroupsDispatched: 16,
      totalLaunchedInvocations: 512,
      activeInvocations: 512,
      paddedInactiveInvocations: 0,
      activeInvocationsInPartialFinalWorkgroup: 32,
      maxComputeInvocationsPerWorkgroup: 256,
      workgroupLimitValid: true,
    },
    outputOffsetMap: offsetMap,
    perDispatch: offsetMap.map((entry) => ({
      dispatchIndex: entry.dispatchIndex,
      nonceStart: syntheticFixture().nonceStart + entry.taskOffset,
      nonceEnd: syntheticFixture().nonceStart + entry.taskOffset + entry.hashesSubmitted - 1,
      hashesSubmitted: entry.hashesSubmitted,
      outputDestinationOffset: entry.outputOffset,
      outputByteOffset: entry.outputByteOffset,
      outputByteLength: entry.outputByteLength,
      workgroupCount: entry.workgroupCount,
      activeInvocations: entry.activeInvocations,
      totalLaunchedInvocations: entry.totalLaunchedInvocations,
      paddedInactiveInvocations: entry.paddedInactiveInvocations,
      partialFinalWorkgroupInvocations: 32,
      outputReadback: true,
      timingScope: "combined-submission",
      timingOwner: "aggregate",
      logicalDispatchTimingIndividuallyMeasured: false,
      timing: {},
    })),
    ...overrides,
  });
}

function mockWorkgroupVariantBProfilingResult(workgroupSize, overrides = {}) {
  if (workgroupSize === 32) return mockWorkgroup32VariantBProfilingResult(overrides);
  const offsetMap = buildProfilingOutputOffsetMap(8192, 512, workgroupSize);
  return mockVariantBProfilingResult({
    pipelineDiagnostics: {
      pipelineKey: whirlpoolPipelineKey(workgroupSize),
      deviceLimitValidation: { valid: true, workgroupSize },
      deviceLimits: {
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
      },
    },
    workgroup: {
      wgslWorkgroupSize: workgroupSize,
      hashesInDispatch: 512,
      workgroupsDispatched: workgroupSize === 1 ? 512 : 512 / workgroupSize,
      totalLaunchedInvocations: 512,
      activeInvocations: 512,
      paddedInactiveInvocations: 0,
      activeInvocationsInPartialFinalWorkgroup: workgroupSize,
      maxComputeInvocationsPerWorkgroup: 256,
      workgroupLimitValid: true,
    },
    outputOffsetMap: offsetMap,
    perDispatch: offsetMap.map((entry) => ({
      dispatchIndex: entry.dispatchIndex,
      nonceStart: syntheticFixture().nonceStart + entry.taskOffset,
      nonceEnd: syntheticFixture().nonceStart + entry.taskOffset + entry.hashesSubmitted - 1,
      hashesSubmitted: entry.hashesSubmitted,
      outputDestinationOffset: entry.outputOffset,
      outputByteOffset: entry.outputByteOffset,
      outputByteLength: entry.outputByteLength,
      workgroupCount: entry.workgroupCount,
      activeInvocations: entry.activeInvocations,
      totalLaunchedInvocations: entry.totalLaunchedInvocations,
      paddedInactiveInvocations: entry.paddedInactiveInvocations,
      partialFinalWorkgroupInvocations: workgroupSize,
      outputReadback: true,
      timingScope: "combined-submission",
      timingOwner: "aggregate",
      logicalDispatchTimingIndividuallyMeasured: false,
      timing: {},
    })),
    ...overrides,
  });
}

function buildMockProfilingSummaryExport(strategyId, totals, overrides = {}) {
  const iterations = totals.map((totalElapsedMs, index) => {
    const isVariantB = strategyId === "multi-dispatch-single-readback";
    const result = isVariantB
      ? mockVariantBProfilingResult({
          hostPhases: {
            totalBenchmarkElapsedMs: totalElapsedMs,
            queueCompletionWaitMs: 4.5,
            readbackMs: 0.4,
            cpuGpuComparisonMs: 24.8,
          },
        })
      : mockProfilingResult({
          hostPhases: {
            totalBenchmarkElapsedMs: totalElapsedMs,
            queueCompletionWaitMs: 59.2,
            readbackMs: 5.8,
            cpuGpuComparisonMs: 24.8,
          },
        });
    return {
      ...result,
      sampleLabel: `${strategyId}-${index}`,
      ...overrides.iterationOverrides?.[index],
    };
  });
  const summary = buildProfilingSummary(iterations, {
    preset: DEFAULT_PROFILING_PRESET,
    repetitions: iterations.length,
    readbackStrategyId: strategyId,
    correctnessGate: mockSyntheticResult().correctnessGate,
  });
  return buildProfilingSummaryExport({
    summary,
    capabilities: {
      adapterInfo: { vendor: "nvidia", architecture: "blackwell" },
      limits: { maxComputeInvocationsPerWorkgroup: 256 },
    },
    userAgent: "UnitTest Browser 150",
    timestamp: overrides.timestamp || `2026-07-19T14:00:${strategyId === "current-per-dispatch" ? "00" : "01"}.000Z`,
  });
}

test("published Whirlpool vectors match", () => {
  for (const vector of WHIRLPOOL_TEST_VECTORS) {
    const bytes = Object.hasOwn(vector, "messageText")
      ? new TextEncoder().encode(vector.messageText)
      : hexToBytes(vector.messageHex);
    assert.equal(bytesToHex(whirlpool512(bytes)), vector.whirlpoolHex, vector.name);
  }
});

test("deterministic CapStash vectors match", () => {
  const result = runCorrectnessTests();
  assert.equal(result.pass, true, JSON.stringify(result.results.filter((entry) => !entry.pass), null, 2));
});

test("canonical serialization exactly matches vector bytes", () => {
  for (const vector of CAPSTASH_POW_TEST_VECTORS) {
    assert.equal(bytesToHex(buildHeader80(vector.header)), vector.headerHex, vector.name);
    assert.deepEqual(parseHeader80(hexToBytes(vector.headerHex)), vector.header, vector.name);
  }
});

test("nonce mutation affects only bytes 76..79 and changes hash", () => {
  const vector = CAPSTASH_POW_TEST_VECTORS[1];
  const header = hexToBytes(vector.headerHex);
  const before = bytesToHex(header);
  const beforeHash = capstashPoWHashHex(header);
  patchNonce(header, 0x78563412);
  assert.equal(readLe32(header, 76), 0x78563412);
  assert.equal(bytesToHex(header.subarray(0, 76)), before.slice(0, 152));
  assert.equal(bytesToHex(header.subarray(76)), "12345678");
  assert.notEqual(capstashPoWHashHex(header), beforeHash);
});

test("timestamp mutation affects only bytes 68..71 and changes hash", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const beforePrefix = bytesToHex(header.subarray(0, 68));
  const beforeSuffix = bytesToHex(header.subarray(72));
  const beforeHash = capstashPoWHashHex(header);
  patchTime(header, 0x01020304);
  assert.equal(bytesToHex(header.subarray(0, 68)), beforePrefix);
  assert.equal(bytesToHex(header.subarray(68, 72)), "04030201");
  assert.equal(bytesToHex(header.subarray(72)), beforeSuffix);
  assert.notEqual(capstashPoWHashHex(header), beforeHash);
});

test("bits mutation affects only bytes 72..75 and changes hash", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const beforePrefix = bytesToHex(header.subarray(0, 72));
  const beforeSuffix = bytesToHex(header.subarray(76));
  const beforeHash = capstashPoWHashHex(header);
  patchBits(header, 0x1d00ffff);
  assert.equal(bytesToHex(header.subarray(0, 72)), beforePrefix);
  assert.equal(bytesToHex(header.subarray(72, 76)), "ffff001d");
  assert.equal(bytesToHex(header.subarray(76)), beforeSuffix);
  assert.notEqual(capstashPoWHashHex(header), beforeHash);
});

test("merkle mutation affects only bytes 36..67 and changes hash", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const beforePrefix = bytesToHex(header.subarray(0, 36));
  const beforeSuffix = bytesToHex(header.subarray(68));
  const beforeHash = capstashPoWHashHex(header);
  const nextMerkle = "f".repeat(64);
  patchMerkleRoot(header, nextMerkle);
  assert.equal(bytesToHex(header.subarray(0, 36)), beforePrefix);
  assert.equal(bytesToHex(header.subarray(36, 68)), "f".repeat(64));
  assert.equal(bytesToHex(header.subarray(68)), beforeSuffix);
  assert.notEqual(capstashPoWHashHex(header), beforeHash);
});

test("randomized headers serialize, parse, and hash repeatably", () => {
  const next = lcg(0xc0ffee);
  for (let i = 0; i < 128; i += 1) {
    const headerObject = makeRandomHeader(next);
    const header = buildHeader80(headerObject);
    const reparsed = parseHeader80(header);
    assert.deepEqual(reparsed, headerObject, `parse roundtrip ${i}`);
    assert.equal(capstashPoWHashHex(header), capstashPoWHashHex(header), `repeat display hash ${i}`);
    assert.equal(capstashPoWInternalHex(header), capstashPoWInternalHex(header), `repeat internal hash ${i}`);
  }
});

test("browser-facing correctness entrypoint matches CPU reference", () => {
  const result = runCorrectnessTests();
  assert.equal(result.results.length >= 8, true);
  assert.equal(result.results.every((entry) => entry.pass), true);
});

test("benchmark execution mode labels are accurate", () => {
  assert.equal(EXECUTION_MODES["cpu-js"].label, "CPU JavaScript");
  assert.equal(EXECUTION_MODES.wasm.label, "WASM");
  assert.equal(EXECUTION_MODES["webgpu-detect-only"].label, "WebGPU detected only");
  assert.equal(EXECUTION_MODES["webgpu-plumbing-only"].label, "WebGPU plumbing only");
  assert.equal(EXECUTION_MODES["webgpu-whirlpool-minimal"].label, "WebGPU Whirlpool minimal");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-nonce-benchmark"].label, "Controlled synthetic nonce-batch benchmark");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-profiling"].label, "Synthetic profiling run");
  assert.equal(EXECUTION_MODES["webgpu-compute-real"].label, "WebGPU compute real");
  assert.equal(EXECUTION_MODES["cpu-js"].hashingBackend, "CPU JavaScript");
  assert.equal(EXECUTION_MODES.wasm.hashingBackend, "Not implemented (no hashing)");
  assert.equal(EXECUTION_MODES["webgpu-detect-only"].hashingBackend, "None (detection only)");
  assert.equal(EXECUTION_MODES["webgpu-plumbing-only"].hashingBackend, "Temporary fake shader (not CapStash hashing)");
  assert.equal(EXECUTION_MODES["webgpu-whirlpool-minimal"].hashingBackend, "Minimal real WGSL Whirlpool proof");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-nonce-benchmark"].hashingBackend, "WGSL Whirlpool synthetic nonce batches");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-profiling"].hashingBackend, "WGSL Whirlpool synthetic profiling");
  assert.equal(EXECUTION_MODES["webgpu-compute-real"].hashingBackend, "Not implemented (no real Whirlpool hashing)");
});

test("package exposes a local environment doctor command", () => {
  const pkg = loadPackageJson();
  assert.equal(pkg.scripts.doctor, "node scripts/doctor.js");
  const doctor = readFileSync(new URL("../scripts/doctor.js", import.meta.url), "utf8");
  assert.match(doctor, /Node\.js/);
  assert.match(doctor, /npm/);
  assert.match(doctor, /capstash-core-pow-vectors\.json/);
  assert.match(doctor, /LOCAL_DEV_SETUP\.md/);
});

test("manual browser verification result is recorded as subset-only correctness evidence", () => {
  const results = readFileSync(new URL("../BROWSER_VERIFICATION_RESULTS.md", import.meta.url), "utf8");
  assert.match(results, /2026-06-28 manual 1x1/);
  assert.match(results, /2026-06-28 manual 10x1/);
  assert.match(results, /2026-06-28 manual full 294/);
  assert.match(results, /nvidia \/ blackwell/);
  assert.match(results, /1 fixture x 1 nonce/);
  assert.match(results, /10 fixtures x 1 nonce/);
  assert.match(results, /294 matches \/ 0 mismatches/);
  assert.match(results, /Passed selected subset; 1 \/ 1 selected matches/);
  assert.match(results, /Passed selected subset; 10 \/ 10 selected matches/);
  assert.match(results, /Full 294-vector pass; 294 \/ 294 selected matches/);
  assert.match(results, /fixture cases `49 executed \/ 1 rejected overflow cases`/);
  assert.match(results, /hashes per dispatch `1`/);
  assert.match(results, /not production miner results/i);
  assert.match(results, /Batched Verification Matrix/);
  assert.match(results, /2026-06-29 manual batched 10x1 b2/);
  assert.match(results, /2026-06-29 manual batched full b16/);
  assert.match(results, /2026-06-29 manual batched full b32/);
  assert.match(results, /2026-06-29 manual batched full b64/);
  assert.match(results, /10 fixtures x 1 nonce`\s+\| 2 \| 10 \| 5 \| 2\.00 \| `10 \/ 10 matches`/);
  assert.match(results, /Full 294 Core vectors`\s+\| 16 \| 294 \| 19 \| 15\.47 \| `294 \/ 294 matches`/);
  assert.match(results, /Full 294 Core vectors`\s+\| 32 \| 294 \| 10 \| 29\.40 \| `294 \/ 294 matches`/);
  assert.match(results, /Full 294 Core vectors`\s+\| 64 \| 294 \| 5 \| 58\.80 \| `294 \/ 294 matches`/);
  assert.match(results, /\| 64 \| 5 \| 294 \/ 294 \| 0 \|/);
  assert.match(results, /33,526\.7 ms/);
});

test("browser UI documents preset order and subset-only status", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Minimal\/Core WGSL verification preset/);
  assert.match(html, /Preset order: 1x1, 1x2, 1x4, 3x1, 3x2, 10x1/);
  assert.match(html, /Full 294-vector WGSL\/Core verification may take longer than subset checks/);
  assert.match(html, /This is a correctness test, not a mining benchmark/);
  assert.match(html, /Subset checks are not full-vector verification/);
  assert.match(html, /selected-subset results unless the Core panel explicitly says `WGSL\/Core verification: Full 294-vector pass`/);
  assert.match(html, /WGSL batch size/);
  assert.match(html, /Correctness-only batched verification; not optimized mining performance/);
  assert.match(html, /Batch size 1 keeps the known-good single-dispatch-per-hash path/);
  assert.match(html, /Controlled Synthetic Nonce-Batch Benchmark/);
  assert.match(html, /Correctness-gated local browser research only/);
  assert.match(html, /CPU spot-checks selected nonces/);
  assert.match(html, /does not compare targets, connect to pools, submit blocks, use wallets, track payouts/);
  assert.match(html, /not selected by default and does not run unless Start is clicked/);
  assert.match(html, /Copy benchmark result/);
  assert.match(html, /Download benchmark result JSON/);
  assert.match(html, /Download repeated-run summary JSON/);
  assert.match(html, /Clear session history/);
  assert.match(html, /Session History/);
  assert.match(html, /Compatible Repeated-Run Summary/);
  assert.match(html, /Synthetic Benchmark Diagnostics/);
  assert.match(html, /Automatic Correctness-Gate Diagnostics/);
  assert.match(html, /Workgroup Dispatch Model/);
  assert.match(html, /Device Workgroup Limit/);
  assert.match(html, /Native Projection Disabled/);
  assert.match(html, /Browser Efficiency Projection/);
  assert.doesNotMatch(html, /Estimated Native Performance/);
  assert.doesNotMatch(html, />Browser Efficiency Estimate</);
  assert.match(html, /Current Run Pipeline Creation/);
  assert.match(html, /Historical Cold Compile Observation/);
  assert.match(html, /Historical Cold Compile Applies To Current Run/);
  assert.match(html, /Documented WGSL\/Core Verification/);
  assert.match(html, /This Session WGSL\/Core Verification/);
  assert.match(html, /Synthetic WGSL Whirlpool/);
  assert.match(html, /Telemetry Consistency/);
  assert.doesNotMatch(html, /Real WebGPU Whirlpool Status/);
  assert.doesNotMatch(html, />Warm-up</);
  assert.match(html, /This Run Total Elapsed/);
  assert.doesNotMatch(html, /mining-ready/i);
});

test("pipeline timing view separates cold compile from cached this-run timing", () => {
  const diagnostics = {
    pipelineKey: "whirlpool-batched",
    pipelineCacheHit: true,
    pipelineCacheStatus: "hit",
    pipelineReused: true,
    pipelineCreationMs: 33526.7,
    coldPipelineCreationMs: 33526.7,
    coldPipelineCreationObservedAt: "2026-06-29T00:00:00.000Z",
    coldPipelineCreationAppliesToCurrentRun: false,
    thisRunUsedCachedPipeline: true,
    thisRunPipelineCreationMs: 0,
    thisRunShaderGenerationMs: 0,
    thisRunShaderModuleCreationMs: 0,
    thisRunTotalElapsedMs: 170,
  };
  const view = formatPipelineTimingView({ pipelineReused: true, pipelineCacheStatus: "hit", totalElapsedMs: 170 }, diagnostics);
  assert.match(view.pipelineStatus, /reused cached pipeline/);
  assert.match(view.pipelineStatus, /whirlpool-batched/);
  assert.equal(view.thisRunPipelineCreation, "0.0 ms / not recreated");
  assert.match(view.originalColdCompile, /33,526\.7 ms|33526\.7 ms/);
  assert.match(view.originalColdCompile, /page-session historical observation/);
  assert.match(view.originalColdCompile, /does not apply to this cached run/);
  assert.equal(view.historicalColdCompileTimestamp, "2026-06-29T00:00:00.000Z");
  assert.equal(view.historicalColdCompileApplies, "no");
  assert.equal(view.shaderGeneration, "0.0 ms");
  assert.equal(view.shaderModuleCreation, "0.0 ms");
  assert.equal(view.totalElapsed, "170.0 ms");
});

test("pipeline timing view reports cold compile as this-run pipeline creation on cache miss", () => {
  const diagnostics = {
    pipelineKey: "whirlpool-single",
    pipelineCacheHit: false,
    pipelineCacheStatus: "miss",
    pipelineReused: false,
    pipelineCreationMs: 31112.4,
    coldPipelineCreationMs: 31112.4,
    coldPipelineCreationObservedAt: "2026-06-28T00:00:00.000Z",
    coldPipelineCreationAppliesToCurrentRun: true,
    thisRunUsedCachedPipeline: false,
    thisRunPipelineCreationMs: 31112.4,
    thisRunShaderGenerationMs: 0.3,
    thisRunShaderModuleCreationMs: 0.1,
    thisRunTotalElapsedMs: 31290,
  };
  const view = formatPipelineTimingView({ pipelineReused: false, pipelineCacheStatus: "miss", totalElapsedMs: 31290 }, diagnostics);
  assert.match(view.pipelineStatus, /cold compile/);
  assert.equal(view.thisRunPipelineCreation, "31112.4 ms");
  assert.match(view.originalColdCompile, /applies to this run/);
  assert.equal(view.historicalColdCompileApplies, "yes");
  assert.equal(view.shaderGeneration, "0.3 ms");
  assert.equal(view.shaderModuleCreation, "0.1 ms");
  assert.equal(view.totalElapsed, "31290.0 ms");
});

test("pipeline timing view safely renders missing or null diagnostics", () => {
  assert.deepEqual(formatPipelineTimingView(null, null), {
    pipelineStatus: "Not run",
    thisRunPipelineCreation: "Not run",
    originalColdCompile: "Not run",
    historicalColdCompileTimestamp: "Not run",
    historicalColdCompileApplies: "Not run",
    shaderGeneration: "Not run",
    shaderModuleCreation: "Not run",
    totalElapsed: "Not run",
  });

  const view = formatPipelineTimingView({ totalElapsedMs: 0, pipelineReused: false }, null);
  assert.match(view.pipelineStatus, /cold compile/);
  assert.equal(view.thisRunPipelineCreation, "Not run");
  assert.equal(view.originalColdCompile, "Not run");
  assert.equal(view.totalElapsed, "0.0 ms");
});

test("Whirlpool timing diagnostics declare totalElapsedMs before using it", () => {
  const source = readFileSync(new URL("../src/webgpu/whirlpool-minimal.js", import.meta.url), "utf8");
  const singleStart = source.indexOf("export async function runWebGPUWhirlpoolMinimal");
  const batchStart = source.indexOf("export async function runWebGPUWhirlpoolBatch");
  assert.notEqual(singleStart, -1);
  assert.notEqual(batchStart, -1);

  const singleBody = source.slice(singleStart, batchStart);
  const batchBody = source.slice(batchStart);
  for (const [name, body] of [["single", singleBody], ["batch", batchBody]]) {
    const declaration = body.indexOf("const totalElapsedMs = performance.now() - totalStart;");
    const diagnosticsUse = body.indexOf("const pipelineDiagnostics = withThisRunTimings");
    assert.notEqual(declaration, -1, `${name} totalElapsedMs declaration`);
    assert.notEqual(diagnosticsUse, -1, `${name} pipeline diagnostics use`);
    assert.equal(declaration < diagnosticsUse, true, `${name} declares totalElapsedMs before diagnostics shaping`);
  }
});

test("only CPU JavaScript can currently run the hash benchmark", () => {
  assert.equal(canRunHashBenchmark("cpu-js"), true);
  assert.equal(canRunHashBenchmark("wasm"), false);
  assert.equal(canRunHashBenchmark("webgpu-detect-only"), false);
  assert.equal(canRunHashBenchmark("webgpu-plumbing-only"), false);
  assert.equal(canRunHashBenchmark("webgpu-whirlpool-minimal"), false);
  assert.equal(canRunHashBenchmark("webgpu-synthetic-nonce-benchmark"), false);
  assert.equal(canRunHashBenchmark("webgpu-compute-real"), false);
});

test("WebGPU real compute mode cannot claim GPU hashing without Whirlpool WGSL", () => {
  const mode = EXECUTION_MODES["webgpu-compute-real"];
  assert.equal(mode.available, false);
  assert.equal(mode.hashesOnGpu, false);
  assert.equal(mode.hasComputeShader, false);
  assert.equal(mode.wgslShader, null);
  assert.equal(mode.hashesPerDispatch, 0);
  assert.match(mode.note, /hashing is not yet running on the GPU/);

  const state = createBenchmarkState({ executionMode: "webgpu-compute-real" });
  const snapshot = benchmarkSnapshot(state);
  assert.equal(snapshot.hashesOnGpu, false);
  assert.equal(snapshot.hasComputeShader, false);
  assert.equal(snapshot.hashesPerDispatch, 0);
});

test("WebGPU Whirlpool minimal mode is correctness-only real Whirlpool, not production mining", () => {
  const mode = EXECUTION_MODES["webgpu-whirlpool-minimal"];
  assert.equal(mode.available, true);
  assert.equal(mode.hashesOnGpu, false);
  assert.equal(mode.hasComputeShader, true);
  assert.equal(mode.hashesPerDispatch, 1);
  assert.match(mode.note, /Correctness-only Stage B proof/);
});

test("synthetic nonce benchmark mode is explicit and correctness-gated", () => {
  const mode = EXECUTION_MODES["webgpu-synthetic-nonce-benchmark"];
  assert.equal(mode.available, true);
  assert.equal(mode.hashesOnGpu, true);
  assert.equal(mode.hasComputeShader, true);
  assert.equal(mode.hashesPerDispatch, 64);
  assert.match(mode.note, /Correctness-gated local browser research mode/);
  assert.match(mode.note, /not live mining/);
  assert.match(mode.note, /pool mining/);
  assert.match(mode.note, /target comparison/);
  assert.match(mode.note, /wallet support/);
  assert.match(mode.note, /payout tracking/);
  assert.doesNotMatch(mode.note, /production miner/i);
});

test("WebGPU plumbing-only mode is labeled as fake shader, not CapStash hashing", () => {
  const mode = EXECUTION_MODES["webgpu-plumbing-only"];
  assert.equal(mode.available, true);
  assert.equal(mode.hashesOnGpu, false);
  assert.equal(mode.hasComputeShader, true);
  assert.equal(mode.hashesPerDispatch, 64);
  assert.match(mode.note, /not CapStash hashing/);
});

test("WebGPU plumbing-only mode exposes fake result dispatch metadata", () => {
  const mode = EXECUTION_MODES["webgpu-plumbing-only"];
  assert.equal(mode.wgslShader, "temporary deterministic fake shader");
  assert.equal(mode.hashingBackend, "Temporary fake shader (not CapStash hashing)");
  assert.equal(mode.hashesPerDispatch, 64);
});

test("WebGPU plumbing buffer layout maps the 80-byte header to 20 little-endian u32 words", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const words = headerBytesToWords(header);
  assert.equal(words.length, 20);
  assert.equal(words[0], CAPSTASH_POW_TEST_VECTORS[1].header.version);
  assert.equal(words[17], CAPSTASH_POW_TEST_VECTORS[1].header.time);
  assert.equal(words[18], CAPSTASH_POW_TEST_VECTORS[1].header.bits);
  assert.equal(words[19], CAPSTASH_POW_TEST_VECTORS[1].header.nonce);
});

test("WebGPU plumbing fake outputs are deterministic and nonce-index dependent", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const a = fakePlumbingHashWords(header, 7, 0, 4);
  const b = fakePlumbingHashWords(header, 7, 0, 4);
  const c = fakePlumbingHashWords(header, 8, 1, 4);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.notEqual(wordsToInternalHashHex(a), wordsToInternalHashHex(c));
  assert.equal(fakePlumbingHashHex(header, 7, 0, 4), wordsToInternalHashHex(a));
});

test("WebGPU plumbing CPU comparison harness reports fake-output mismatches against real CapStash hashes", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const rows = comparePlumbingRowsToCpuReference(buildCpuReferenceRows(header, 0, 8));
  assert.equal(rows.length, 8);
  assert.equal(rows.every((row, index) => row.index === index && row.nonce === index), true);
  assert.equal(rows.every((row) => row.plumbingInternalHex.length === 64), true);
  assert.equal(rows.every((row) => row.cpuInternalHex.length === 64), true);
  assert.equal(rows.some((row) => row.matchesCpuReference), false);
});

test("minimal Whirlpool WGSL shader is Whirlpool-specific and does not contain SHA-256 language", () => {
  const shader = buildMinimalWhirlpoolShader();
  assert.match(shader, /whirlpool80_folded/);
  assert.match(shader, /T0/);
  assert.doesNotMatch(shader.toLowerCase(), /sha/);
  assert.doesNotMatch(shader.toLowerCase(), /bitcoin/);
});

test("batched Whirlpool WGSL shader is Whirlpool-specific and task-buffer driven", () => {
  const shader = buildBatchedWhirlpoolShader();
  assert.match(shader, /whirlpool80_folded_at/);
  assert.match(shader, /taskWords/);
  assert.match(shader, /headerWords/);
  assert.match(shader, /global_invocation_id/);
  assert.match(shader, /T0/);
  assert.doesNotMatch(shader.toLowerCase(), /sha/);
  assert.doesNotMatch(shader.toLowerCase(), /bitcoin/);
});

test("minimal Whirlpool fixture metadata covers required 80-byte headers", () => {
  const requiredIds = [
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
  ];
  assert.deepEqual(WHIRLPOOL_HEADER_FIXTURES.map((fixture) => fixture.id), requiredIds);
  assert.deepEqual(WHIRLPOOL_NONCE_COUNTS, [1, 2, 4, 8, 16]);
  for (const fixture of WHIRLPOOL_HEADER_FIXTURES) {
    const header = fixtureHeaderBytes(fixture);
    assert.equal(header.length, 80, fixture.id);
    assert.equal(fixture.headerHex.length, 160, fixture.id);
    assert.equal(typeof fixture.description, "string", fixture.id);
    assert.equal(fixture.description.length > 0, true, fixture.id);
  }
});

test("minimal Whirlpool fixture field mutations touch only intended serialized ranges", () => {
  const byId = Object.fromEntries(WHIRLPOOL_HEADER_FIXTURES.map((fixture) => [fixture.id, fixtureHeaderBytes(fixture)]));
  assert.notDeepEqual(Array.from(byId["realistic-fields"]), Array.from(byId["time-mutated"]));
  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(0, 68)), Array.from(byId["time-mutated"].subarray(0, 68)));
  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(72)), Array.from(byId["time-mutated"].subarray(72)));

  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(0, 72)), Array.from(byId["bits-mutated"].subarray(0, 72)));
  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(76)), Array.from(byId["bits-mutated"].subarray(76)));

  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(0, 36)), Array.from(byId["merkle-mutated"].subarray(0, 36)));
  assert.deepEqual(Array.from(byId["realistic-fields"].subarray(68)), Array.from(byId["merkle-mutated"].subarray(68)));
});

test("minimal Whirlpool nonce range handling accepts safe high nonces and rejects overflow", () => {
  assert.equal(MAX_MINIMAL_WHIRLPOOL_NONCE_COUNT, 16);
  assert.equal(isNonceRangeSafe(0xfffffff0, 16), true);
  assert.equal(isNonceRangeSafe(0xfffffff8, 8), true);
  assert.equal(isNonceRangeSafe(0xfffffff8, 16), false);
  assert.throws(
    () => assertMinimalWhirlpoolInputs(fixtureHeaderBytes(WHIRLPOOL_HEADER_FIXTURES[0]), 0xfffffff8, 16),
    /overflows uint32/,
  );
});

test("minimal Whirlpool fixture plan marks only unsafe overflow cases as rejected", () => {
  const plan = buildWhirlpoolFixturePlan();
  assert.equal(plan.length, WHIRLPOOL_HEADER_FIXTURES.length * WHIRLPOOL_NONCE_COUNTS.length);
  const rejected = plan.filter((entry) => !entry.safe);
  assert.deepEqual(rejected.map((entry) => `${entry.fixtureId}:${entry.nonceCount}`), ["overflow-rejected:16"]);
  assert.match(rejected[0].rejectionReason, /overflows uint32/);
});

test("minimal Whirlpool default Core verification subset starts with one fixture and one nonce", () => {
  assert.equal(DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.label, "1 fixture x 1 nonce");
  assert.deepEqual(DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.fixtureIds, ["zero-header"]);
  assert.deepEqual(DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.nonceCounts, [1]);
  const fixtures = selectWhirlpoolFixtures(WHIRLPOOL_HEADER_FIXTURES, DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.fixtureIds);
  const plan = buildWhirlpoolFixturePlan({
    fixtures,
    nonceCounts: DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.nonceCounts,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].fixtureId, "zero-header");
  assert.equal(plan[0].nonceCount, 1);
  assert.equal(plan[0].safe, true);
});

test("minimal Whirlpool exposes ordered WGSL/Core verification presets", () => {
  assert.deepEqual(WGSL_CORE_VERIFICATION_PRESETS.map((preset) => preset.label), [
    "1 fixture x 1 nonce",
    "1 fixture x 2 nonces",
    "1 fixture x 4 nonces",
    "3 fixtures x 1 nonce",
    "3 fixtures x 2 nonces",
    "10 fixtures x 1 nonce",
    "Full 294 Core vectors",
  ]);
  const expectedCases = {
    "one-fixture-one-nonce": 1,
    "one-fixture-two-nonces": 1,
    "one-fixture-four-nonces": 1,
    "three-fixtures-one-nonce": 3,
    "three-fixtures-two-nonces": 3,
    "ten-fixtures-one-nonce": 10,
    "full-294-core-vectors": 50,
  };
  for (const preset of WGSL_CORE_VERIFICATION_PRESETS) {
    const fixtures = selectWhirlpoolFixtures(WHIRLPOOL_HEADER_FIXTURES, preset.fixtureIds);
    const plan = buildWhirlpoolFixturePlan({ fixtures, nonceCounts: preset.nonceCounts });
    assert.equal(plan.length, expectedCases[preset.id], preset.id);
    if (preset.fullVector) {
      assert.equal(plan.filter((entry) => entry.safe).reduce((sum, entry) => sum + entry.nonceCount, 0), 294);
      assert.equal(plan.filter((entry) => !entry.safe).length, 1);
      assert.equal(preset.expectedCoreVectorCount, 294);
    } else {
      assert.equal(plan.every((entry) => entry.safe), true, preset.id);
    }
  }
  assert.equal(verificationPresetById("missing").id, DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.id);
  assert.equal(verificationPresetById(FULL_CORE_VECTOR_VERIFICATION_PRESET.id).fullVector, true);
});

test("WGSL batch size options are explicit and default to the known-good single path", () => {
  assert.deepEqual(WGSL_BATCH_SIZE_OPTIONS, [1, 2, 4, 8, 16, 32, 64]);
  assert.equal(DEFAULT_WGSL_BATCH_SIZE, 1);
});

test("batched verification dispatch count calculation is conservative", () => {
  assert.equal(batchDispatchCountForResults(0, 8), 0);
  assert.equal(batchDispatchCountForResults(1, 1), 1);
  assert.equal(batchDispatchCountForResults(10, 2), 5);
  assert.equal(batchDispatchCountForResults(10, 4), 3);
  assert.equal(batchDispatchCountForResults(10, 8), 2);
  assert.equal(batchDispatchCountForResults(294, 16), 19);
});

test("synthetic benchmark options are conservative and not the default CPU benchmark", () => {
  assert.deepEqual(SYNTHETIC_HASH_COUNT_OPTIONS, [256, 512, 1024, 2048, 4096, 8192]);
  assert.equal(DEFAULT_SYNTHETIC_HASH_COUNT, 1024);
  assert.deepEqual(SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS, [64, 128, 256, 512, 1024]);
  assert.equal(DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE, 64);
  assert.equal(SYNTHETIC_FIXTURE_ID, "realistic-fields");
  assert.equal(SYNTHETIC_CORRECTNESS_GATE_PRESET_ID, "ten-fixtures-one-nonce");
  assert.equal(SYNTHETIC_CORRECTNESS_GATE_BATCH_SIZE, 64);
  assert.equal(MAX_WHIRLPOOL_BATCH_TASKS, 1024);
  assert.equal(createBenchmarkState().executionMode, "cpu-js");
});

test("synthetic nonce range generation rejects overflow and preserves uint32 order", () => {
  assert.deepEqual(buildSyntheticNonceRange({ nonceStart: 5, hashCount: 4 }), {
    nonceStart: 5,
    nonceEnd: 8,
    hashCount: 4,
  });
  assert.throws(() => buildSyntheticNonceRange({ nonceStart: 0xfffffffe, hashCount: 4 }), /overflows uint32/);
});

test("synthetic dispatch count and task ordering are deterministic", () => {
  assert.equal(syntheticDispatchCount(0, 64), 0);
  assert.equal(syntheticDispatchCount(1024, 64), 16);
  assert.equal(syntheticDispatchCount(8192, 1024), 8);
  assert.deepEqual(syntheticBatchPlan(130, 64), [
    { dispatchIndex: 0, startIndex: 0, count: 64, endIndex: 63, partial: false },
    { dispatchIndex: 1, startIndex: 64, count: 64, endIndex: 127, partial: false },
    { dispatchIndex: 2, startIndex: 128, count: 2, endIndex: 129, partial: true },
  ]);
  const fixture = syntheticFixture();
  const tasks = buildSyntheticTasks({ fixture, nonceStart: fixture.nonceStart, hashCount: 8, startIndex: 2, count: 4 });
  assert.deepEqual(tasks.map((task) => task.syntheticIndex), [2, 3, 4, 5]);
  assert.deepEqual(tasks.map((task) => task.nonce), [fixture.nonceStart + 2, fixture.nonceStart + 3, fixture.nonceStart + 4, fixture.nonceStart + 5]);
  assert.equal(tasks.every((task) => task.fixtureId === SYNTHETIC_FIXTURE_ID), true);
});

test("synthetic dispatch batch size is separate from WGSL workgroup size", () => {
  assert.deepEqual(syntheticWorkgroupPlan(512, 1), {
    wgslWorkgroupSize: 1,
    hashesInDispatch: 512,
    workgroupsDispatched: 512,
    totalLaunchedInvocations: 512,
    activeInvocations: 512,
    paddedInactiveInvocations: 0,
    activeInvocationsInPartialFinalWorkgroup: 1,
  });
  assert.deepEqual(syntheticWorkgroupPlan(512, 256), {
    wgslWorkgroupSize: 256,
    hashesInDispatch: 512,
    workgroupsDispatched: 2,
    totalLaunchedInvocations: 512,
    activeInvocations: 512,
    paddedInactiveInvocations: 0,
    activeInvocationsInPartialFinalWorkgroup: 256,
  });
  assert.deepEqual(syntheticWorkgroupPlan(513, 256), {
    wgslWorkgroupSize: 256,
    hashesInDispatch: 513,
    workgroupsDispatched: 3,
    totalLaunchedInvocations: 768,
    activeInvocations: 513,
    paddedInactiveInvocations: 255,
    activeInvocationsInPartialFinalWorkgroup: 1,
  });
  assert.deepEqual(validateWorkgroupLimit(1, { maxComputeInvocationsPerWorkgroup: 256 }), {
    valid: true,
    workgroupSize: 1,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: null,
    reason: null,
  });
  assert.equal(validateWorkgroupLimit(512, { maxComputeInvocationsPerWorkgroup: 256 }).valid, false);
});

test("synthetic CPU spot-check selection is stable and covers boundary nonces", () => {
  const indexes = selectSyntheticSpotCheckIndexes(1024);
  assert.equal(indexes[0], 0);
  assert.equal(indexes.includes(1), true);
  assert.equal(indexes.includes(512), true);
  assert.equal(indexes.includes(1023), true);
  assert.equal(new Set(indexes).size, indexes.length);
  assert.deepEqual(selectSyntheticSpotCheckIndexes(1024), indexes);
});

test("synthetic mismatch formatting includes dispatch and byte-order context", () => {
  const formatted = formatSyntheticMismatch({
    syntheticIndex: 7,
    index: 3,
    fixtureId: "realistic-fields",
    fixtureName: "Realistic-looking CapStash fields",
    nonce: 12,
    dispatchIndex: 1,
    batchSize: 4,
    patchedHeaderHex: "00".repeat(80),
    cpuInternalHex: "11".repeat(32),
    gpuInternalHex: "22".repeat(32),
  });
  assert.equal(formatted.syntheticIndex, 7);
  assert.equal(formatted.dispatchIndex, 1);
  assert.equal(formatted.indexWithinDispatch, 3);
  assert.equal(formatted.batchSize, 4);
  assert.match(formatted.byteOrderNote, /internal byte order/);
});

test("synthetic benchmark export schema is stable and boundary flags forbid live mining", () => {
  const exportObject = buildSyntheticBenchmarkExport({
    result: mockSyntheticResult(),
    capabilities: {
      adapterInfo: {
        vendor: "nvidia",
        architecture: "blackwell",
        device: "",
        description: "",
      },
      limits: {
        maxComputeWorkgroupsPerDimension: 65535,
        maxStorageBufferBindingSize: 134217728,
      },
    },
    userAgent: "UnitTest Browser",
    projectVersion: "0.1.0",
    gitCommit: "abcdef0",
    timestamp: "2026-07-13T12:00:00.000Z",
  });
  assert.equal(exportObject.schemaVersion, 1);
  assert.equal(exportObject.resultType, "synthetic-browser-research");
  assert.equal(exportObject.environment.userAgent, "UnitTest Browser");
  assert.equal(exportObject.environment.webgpuVendor, "nvidia");
  assert.equal(exportObject.mode.executionMode, "webgpu-synthetic-nonce-benchmark");
  assert.equal(exportObject.mode.hashesRequested, 256);
  assert.equal(exportObject.mode.hashesCompleted, 256);
  assert.equal(exportObject.mode.dispatchCount, 4);
  assert.equal(exportObject.mode.algorithmId, "capstash-whirlpool80-fold-v1");
  assert.equal(exportObject.mode.wgslWorkgroupSize, 1);
  assert.equal(exportObject.mode.workgroupsInRepresentativeDispatch, 64);
  assert.equal(exportObject.mode.workgroupLimitValid, true);
  assert.equal(exportObject.telemetryStatus, "valid telemetry");
  assert.equal(exportObject.correctness.correctnessGateStatus, "passed");
  assert.equal(exportObject.correctness.correctnessGateMatches, 10);
  assert.equal(exportObject.correctness.cpuSpotChecksSelected, 5);
  assert.equal(exportObject.correctness.cpuSpotChecksFailed, 0);
  assert.equal(exportObject.timing.cpuSpotCheckMs, 2.9);
  assert.equal(exportObject.timing.dispatchMs, 13.6);
  assert.equal(exportObject.timing.pipelineKey, "whirlpool-batched");
  assert.equal(exportObject.timing.syntheticDispatchLoopMs, 13.6);
  assert.equal(exportObject.timing.syntheticTotalElapsedMs, 23.6);
  assert.equal(exportObject.timing.gateTotalElapsedMs, 0);
  assert.equal(exportObject.timing.thisRunPipelineCreationMs, 0);
  assert.equal(exportObject.timing.originalColdCompileMs, 26462.9);
  assert.equal(exportObject.timing.coldCompileAppliesToThisRun, false);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
  assert.equal(exportObject.boundaries.poolConnection, false);
  assert.equal(exportObject.boundaries.blockSubmission, false);
  assert.equal(exportObject.boundaries.walletSupport, false);
  assert.equal(exportObject.boundaries.payoutTracking, false);
  assert.equal(exportObject.boundaries.remoteTelemetryUpload, false);
});

test("synthetic UI status is separate from Core-vector session status", () => {
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(app, /Synthetic WGSL Whirlpool: completed/);
  assert.match(app, /Core-vector WGSL verification this session: not run in synthetic mode/);
  assert.match(app, /Documented project verification: full 294-vector pass/);
  assert.match(app, /invalid telemetry/);
  assert.doesNotMatch(app, /Real WebGPU Whirlpool hashing: Not run/);
});

test("synthetic benchmark JSON serialization and filename are safe", () => {
  const exportObject = buildSyntheticBenchmarkExport({
    result: mockSyntheticResult(),
    userAgent: "UnitTest Browser",
    timestamp: "2026-07-13T12:00:00.000Z",
  });
  const json = serializeSyntheticBenchmarkExport(exportObject);
  assert.equal(json.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(json), exportObject);
  const filename = syntheticBenchmarkExportFilename(exportObject);
  assert.equal(filename, "caps-webgpu-synthetic-256-batch-64-2026-07-13T12-00-00-000Z.json");
  assert.doesNotMatch(json, /C:\\|\/Users\/|walletAddress|walletPrivate|privateKey|seedPhrase|password|secret/i);
  assert.doesNotMatch(filename, /[\\/:*?"<>|]/);
});

test("synthetic session history insertion and clearing are deterministic", () => {
  const exportObject = buildSyntheticBenchmarkExport({
    result: mockSyntheticResult(),
    timestamp: "2026-07-13T12:00:00.000Z",
  });
  const history = addSyntheticHistoryEntry([], exportObject);
  assert.equal(history.length, 1);
  assert.equal(history[0].hashCount, 256);
  assert.equal(history[0].batchSize, 64);
  assert.equal(history[0].gateStatus, "passed");
  assert.equal(history[0].spotCheckStatus, "passed");
  assert.equal(history[0].dispatchCount, 4);
  assert.equal(history[0].pass, true);
  assert.deepEqual(clearSyntheticHistory(), []);
});

test("documented first synthetic browser result is recorded conservatively", () => {
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.hashCount, 256);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.dispatchBatchSize, 64);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.dispatchCount, 4);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.spotChecksSelected, 5);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.spotChecksPassed, 5);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.mismatches, 0);
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.pipelineError, "none");
  assert.equal(SYNTHETIC_DOCUMENTED_RESULT.historicalColdCompileAppliesToCurrentRun, false);
  assert.equal(SYNTHETIC_LADDER_RESULTS.length, 7);
  assert.deepEqual(SYNTHETIC_LADDER_RESULTS.map((entry) => [entry.hashCount, entry.batchSize, entry.dispatchCount]), [
    [256, 64, 4],
    [512, 64, 8],
    [1024, 64, 16],
    [1024, 128, 8],
    [2048, 128, 16],
    [4096, 256, 16],
    [8192, 512, 16],
  ]);
  assert.equal(SYNTHETIC_8192_REPEATED_RUNS.length, 5);
});

test("synthetic repeated-run statistics summarize compatible valid runs only", () => {
  const exports = SYNTHETIC_8192_REPEATED_RUNS.map((run, index) => buildSyntheticBenchmarkExport({
    result: mockSyntheticResult({
      totalRequested: 8192,
      resultCount: 8192,
      returnedResultCount: 8192,
      dispatchBatchSize: 512,
      dispatchCount: 16,
      resultsPerDispatch: 512,
      gpuElapsedMs: run.dispatchMs,
      totalElapsedMs: run.totalElapsedMs,
      verifiedHashesPerSecondIncludingPipeline: run.hpsIncluding,
      verifiedHashesPerSecondExcludingPipeline: run.hpsExcluding,
      workgroup: {
        wgslWorkgroupSize: 1,
        hashesInDispatch: 512,
        workgroupsDispatched: 512,
        activeInvocationsInPartialFinalWorkgroup: 1,
        maxComputeInvocationsPerWorkgroup: 256,
        workgroupLimitValid: true,
      },
    }),
    timestamp: `2026-07-18T12:00:0${index}.000Z`,
  }));
  const incompatible = buildSyntheticBenchmarkExport({
    result: mockSyntheticResult({ totalRequested: 4096, resultCount: 4096, dispatchBatchSize: 256, dispatchCount: 16 }),
    timestamp: "2026-07-18T12:01:00.000Z",
  });
  const invalid = buildSyntheticBenchmarkExport({
    result: mockSyntheticResult({
      totalRequested: 8192,
      resultCount: 8191,
      returnedResultCount: 8191,
      dispatchBatchSize: 512,
      dispatchCount: 16,
      resultsPerDispatch: 511.9375,
      verifiedHashesPerSecondIncludingPipeline: 70000,
      verifiedHashesPerSecondExcludingPipeline: 100000,
    }),
    timestamp: "2026-07-18T12:01:01.000Z",
  });
  const pool = [invalid, incompatible, ...exports];
  assert.equal(compatibleSyntheticRuns(pool, exports[0]).length, 6);
  const summary = buildSyntheticRepeatedRunSummary(pool, exports[0]);
  assert.equal(summary.resultType, "synthetic-browser-repeated-run-summary");
  assert.equal(summary.runCount, 6);
  assert.equal(summary.validRunCount, 5);
  assert.equal(summary.invalidRunCount, 1);
  assert.equal(summary.configuration.hashesRequested, 8192);
  assert.equal(summary.configuration.dispatchBatchSize, 512);
  assert.equal(Math.round(summary.statistics.hpsIncludingPipeline.mean), 74360);
  assert.equal(summary.statistics.hpsIncludingPipeline.median, 74700);
  assert.equal(summary.statistics.hpsIncludingPipeline.minimum, 72100);
  assert.equal(summary.statistics.hpsIncludingPipeline.maximum, 75300);
  assert.equal((summary.statistics.hpsIncludingPipeline.sampleCoefficientOfVariation * 100).toFixed(2), "1.76");
  assert.equal(Math.round(summary.statistics.hpsExcludingPipelineAndCpuSpotCheck.mean), 117400);
  assert.equal((summary.statistics.hpsExcludingPipelineAndCpuSpotCheck.sampleCoefficientOfVariation * 100).toFixed(2), "2.73");
  assert.equal(summary.interpretation, "low observed variation");
  assert.equal(summary.boundaries.liveMining, false);
  assert.equal(summary.boundaries.targetComparison, false);
  const json = serializeSyntheticRepeatedRunSummary(summary);
  assert.deepEqual(JSON.parse(json), summary);
  assert.doesNotMatch(json, /C:\\|\/Users\/|walletAddress|walletPrivate|privateKey|seedPhrase|password|secret/i);
  assert.doesNotMatch(syntheticRepeatedRunSummaryFilename(summary), /[\\/:*?"<>|]/);
});

test("synthetic repeated-run statistics report insufficient data for one run", () => {
  const stats = calculateStats([10800]);
  assert.equal(stats.count, 1);
  assert.equal(stats.insufficient, true);
  const exportObject = buildSyntheticBenchmarkExport({ result: mockSyntheticResult() });
  const summary = buildSyntheticRepeatedRunSummary([exportObject], exportObject);
  assert.equal(summary.validRunCount, 1);
  assert.match(summary.statisticsStatus, /Insufficient/);
  assert.match(summary.interpretation, /Insufficient/);
  assert.equal(variationLabel(Number.NaN), "insufficient repeated runs for variability statistics");
});

test("synthetic result validation detects inconsistent telemetry", () => {
  assert.deepEqual(validateSyntheticBenchmarkResult(mockSyntheticResult()), {
    valid: true,
    status: "valid telemetry",
    issues: [],
  });

  const invalidCases = [
    ["completed count", { resultCount: 255 }, /requested hash count/],
    ["dispatch count", { dispatchCount: 3 }, /dispatch count/],
    ["gate status", { correctnessGate: { ...mockSyntheticResult().correctnessGate, passed: false } }, /correctness gate/],
    ["spot checks", { mismatchesAgainstCpuReference: 1 }, /spot-check failures/],
    ["mismatch", { firstMismatch: { nonce: 5 } }, /first mismatch/],
    ["pipeline error", { pipelineDiagnostics: { validationError: "bad pipeline" } }, /pipeline error/],
    ["negative timing", { gpuElapsedMs: -1 }, /dispatch timing/],
    ["H\/s scope", { verifiedHashesPerSecondIncludingPipeline: 200, verifiedHashesPerSecondExcludingPipeline: 100 }, /including-overhead/],
    ["elapsed scope", { totalElapsedMs: 1, gpuElapsedMs: 2 }, /total elapsed/],
  ];
  for (const [name, overrides, pattern] of invalidCases) {
    const validation = validateSyntheticBenchmarkResult(mockSyntheticResult(overrides));
    assert.equal(validation.status, "invalid telemetry", name);
    assert.match(validation.issues.join("\n"), pattern, name);
    const exported = buildSyntheticBenchmarkExport({ result: mockSyntheticResult(overrides) });
    assert.equal(exported.telemetryStatus, "invalid telemetry", name);
    assert.equal(exported.correctness.valid, false, name);
  }
});

test("synthetic H/s excluding pipeline does not include CPU spot-check time", () => {
  const result = mockSyntheticResult({
    resultCount: 100,
    bufferSetupMs: 5,
    gpuElapsedMs: 10,
    readbackMs: 5,
    cpuComparisonMs: 1000,
    hashWorkExcludingPipelineMs: 20,
    verifiedHashesPerSecondExcludingPipeline: 5000,
  });
  const exportObject = buildSyntheticBenchmarkExport({ result });
  assert.equal(exportObject.timing.cpuSpotCheckMs, 1000);
  assert.equal(exportObject.timing.hashesPerSecondExcludingPipeline, 5000);
});

test("synthetic profiling mode is explicit, default-off, and correctness-gated", () => {
  assert.equal(EXECUTION_MODES["webgpu-synthetic-profiling"].label, "Synthetic profiling run");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-profiling"].hashingBackend, "WGSL Whirlpool synthetic profiling");
  assert.equal(EXECUTION_MODES["webgpu-synthetic-profiling"].hashesOnGpu, true);
  assert.equal(canRunHashBenchmark("webgpu-synthetic-profiling"), false);
  assert.equal(createBenchmarkState().executionMode, "cpu-js");
  assert.equal(DEFAULT_PROFILING_PRESET.id, "8192-b512");
  assert.equal(DEFAULT_PROFILING_READBACK_STRATEGY, "multi-dispatch-single-readback");
  assert.equal(DEFAULT_PROFILING_REPETITIONS, 1);
  assert.deepEqual(PROFILING_REPETITION_OPTIONS, [1, 3, 5, 10]);
  assert.deepEqual(PROFILING_PRESETS.map((preset) => [preset.hashCount, preset.dispatchBatchSize]), [
    [1024, 128],
    [2048, 128],
    [4096, 256],
    [8192, 512],
  ]);
});

test("profiling readback strategies are explicit and conservative", () => {
  assert.equal(profilingReadbackStrategyById(DEFAULT_PROFILING_READBACK_STRATEGY).id, "multi-dispatch-single-readback");
  assert.equal(profilingReadbackStrategyById("current-per-dispatch").implemented, true);
  assert.equal(profilingReadbackStrategyById("current-per-dispatch").outputReadback, true);
  assert.equal(profilingReadbackStrategyById("dispatch-timing-probe-no-readback").implemented, true);
  assert.equal(profilingReadbackStrategyById("dispatch-timing-probe-no-readback").outputReadback, false);
  assert.equal(profilingReadbackStrategyById("multi-dispatch-single-readback").implemented, true);
  assert.match(profilingReadbackStrategyById("multi-dispatch-single-readback").label, /Variant B/);
  assert.equal(profilingReadbackStrategyById("single-large-dispatch").implemented, false);
  assert.equal(profilingPresetById("2048-b128").hashCount, 2048);
  assert.equal(profilingOutputSizeBytes(8192), 8192 * 32);
});

test("Variant B physical accounting maps many logical dispatches to one submission", () => {
  const accounting = profilingPhysicalAccounting({
    hashCount: 8192,
    dispatchBatchSize: 512,
    readbackStrategyId: "multi-dispatch-single-readback",
  });
  assert.equal(accounting.logicalDispatchCount, 16);
  assert.equal(accounting.physicalSubmissionCount, 1);
  assert.equal(accounting.queueWaitCount, 1);
  assert.equal(accounting.readbackCount, 1);
  assert.equal(accounting.commandBufferCount, 1);
  assert.equal(accounting.combinedOutputByteSize, 8192 * 32);

  const current = profilingPhysicalAccounting({
    hashCount: 8192,
    dispatchBatchSize: 512,
    readbackStrategyId: "current-per-dispatch",
  });
  assert.equal(current.physicalSubmissionCount, 16);
  assert.equal(current.queueWaitCount, 16);
  assert.equal(current.readbackCount, 16);
});

test("Variant B output offsets are deterministic, non-overlapping, and nonce ordered", () => {
  const logical = buildLogicalDispatchPlan(8192, 512);
  assert.equal(logical.length, 16);
  assert.equal(logical[0].taskOffset, 0);
  assert.equal(logical[0].outputByteOffset, 0);
  assert.equal(logical[15].taskOffset, 7680);
  assert.equal(logical[15].outputByteOffset, 7680 * 32);
  assert.equal(outputOffsetRangesOverlap(logical), false);

  const map = buildProfilingOutputOffsetMap(1025, 512);
  assert.deepEqual(map.map((entry) => entry.hashesSubmitted), [512, 512, 1]);
  assert.deepEqual(map.map((entry) => entry.outputOffset), [0, 512, 1024]);
  assert.deepEqual(map.map((entry) => entry.outputByteLength), [512 * 32, 512 * 32, 32]);
});

test("profiling phase interpretation uses browser-observed categories only", () => {
  const dispatch = interpretProfilingPhases({
    dispatchLoopElapsedMs: 80,
    mapReadbackWaitMs: 5,
    resultDecodingMs: 1,
    cpuReferenceHashingAndComparisonMs: 3,
    cpuSpotCheckSelectionMs: 0,
    bufferAllocationMs: 2,
    bufferPopulationMs: 1,
    bufferUploadMs: 1,
    bindGroupCreationMs: 1,
    totalBenchmarkElapsedMs: 100,
  });
  assert.equal(dispatch.interpretation, "dispatch-dominated");
  assert.match(dispatch.note, /shader-internal bottleneck remains unknown/);

  const readback = interpretProfilingPhases({
    dispatchLoopElapsedMs: 5,
    mapReadbackWaitMs: 60,
    resultDecodingMs: 5,
    cpuReferenceHashingAndComparisonMs: 5,
    cpuSpotCheckSelectionMs: 0,
    bufferAllocationMs: 1,
    bufferPopulationMs: 1,
    bufferUploadMs: 1,
    bindGroupCreationMs: 1,
    totalBenchmarkElapsedMs: 100,
  });
  assert.equal(readback.interpretation, "readback-dominated");
});

test("profiling result validation enforces readback and no-readback boundaries", () => {
  assert.equal(validateProfilingResult(mockProfilingResult()).status, "valid profiling telemetry");
  const invalidDispatch = validateProfilingResult(mockProfilingResult({ dispatchCount: 15 }));
  assert.equal(invalidDispatch.status, "invalid profiling telemetry");
  assert.match(invalidDispatch.issues.join("\n"), /dispatch count/);

  const probe = mockProfilingResult({
    modeLabel: "Dispatch timing probe - output correctness not established by this run alone",
    validHashBenchmark: false,
    profilingOnly: true,
    outputReadback: false,
    cpuSpotChecked: false,
    readbackStrategy: PROFILING_READBACK_STRATEGIES["dispatch-timing-probe-no-readback"],
    readbackCount: 0,
    returnedResultCount: 0,
    spotCheckIndexes: [],
    spotCheckCount: 0,
    spotCheckStatus: "CPU spot-check skipped for no-readback profiling probe",
    hostPhases: { readbackMs: 0, mapReadbackWaitMs: 0, resultDecodingMs: 0, cpuGpuComparisonMs: 0 },
  });
  assert.equal(validateProfilingResult(probe).status, "valid profiling telemetry");
  assert.equal(probe.outputReadback, false);
  assert.equal(probe.cpuSpotChecked, false);
  assert.equal(probe.validHashBenchmark, false);
  assert.equal(probe.profilingOnly, true);

  const badProbe = validateProfilingResult({ ...probe, validHashBenchmark: true });
  assert.equal(badProbe.status, "invalid profiling telemetry");
  assert.match(badProbe.issues.join("\n"), /no-readback probe/);
});

test("Variant B telemetry validation requires one submission, one wait, one readback, and ordered offsets", () => {
  const variantB = mockProfilingResult({
    readbackStrategy: PROFILING_READBACK_STRATEGIES["multi-dispatch-single-readback"],
    physicalSubmissionCount: 1,
    queueWaitCount: 1,
    readbackCount: 1,
    commandBufferCount: 1,
    outputOffsetMap: buildProfilingOutputOffsetMap(8192, 512),
    deterministicResultOrdering: "Output index equals global task index, preserving ascending synthetic nonce order across one combined readback.",
  });
  assert.equal(validateProfilingResult(variantB).status, "valid profiling telemetry");

  const badSubmission = validateProfilingResult({ ...variantB, physicalSubmissionCount: 16 });
  assert.equal(badSubmission.status, "invalid profiling telemetry");
  assert.match(badSubmission.issues.join("\n"), /physicalSubmissionCount/);

  const badOffset = validateProfilingResult({ ...variantB, outputOffsetMap: [{ dispatchIndex: 0, outputOffset: 9 }] });
  assert.equal(badOffset.status, "invalid profiling telemetry");
  assert.match(badOffset.issues.join("\n"), /output offsets/);

  const mismatch = validateProfilingResult({ ...variantB, mismatchesAgainstCpuReference: 1 });
  assert.equal(mismatch.status, "invalid profiling telemetry");
  assert.match(mismatch.issues.join("\n"), /zero CPU\/GPU/);

  const pipeline = validateProfilingResult({ ...variantB, pipelineError: "test validation error" });
  assert.equal(pipeline.status, "invalid profiling telemetry");
  assert.match(pipeline.issues.join("\n"), /pipeline error/);
});

test("profiling export schema is safe and includes phase timing plus boundaries", () => {
  const exportObject = buildProfilingExport({
    result: mockProfilingResult(),
    capabilities: {
      adapterInfo: { vendor: "nvidia", architecture: "blackwell" },
      limits: { maxComputeInvocationsPerWorkgroup: 256 },
    },
    userAgent: "UnitTest Browser",
    timestamp: "2026-07-18T13:00:00.000Z",
  });
  assert.equal(exportObject.resultType, "synthetic-browser-profiling");
  assert.equal(exportObject.telemetryStatus, "valid profiling telemetry");
  assert.equal(exportObject.configuration.mode, "webgpu-synthetic-profiling");
  assert.equal(exportObject.configuration.hashCount, 8192);
  assert.equal(exportObject.configuration.dispatchBatchSize, 512);
  assert.equal(exportObject.configuration.readbackStrategy, "current-per-dispatch");
  assert.equal(exportObject.configuration.logicalDispatchCount, 16);
  assert.equal(exportObject.configuration.physicalSubmissionCount, 16);
  assert.equal(exportObject.configuration.queueWaitCount, 16);
  assert.equal(exportObject.configuration.readbackCount, 16);
  assert.equal(exportObject.configuration.commandBufferCount, 16);
  assert.equal(exportObject.correctness.correctnessGateStatus, "passed");
  assert.equal(exportObject.correctness.validHashBenchmark, true);
  assert.equal(exportObject.timing.hostPhases.queueCompletionWaitMs, 58);
  assert.equal(exportObject.timing.perDispatch[0].dispatchIndex, 0);
  assert.equal(exportObject.timing.perDispatch[0].nonceEnd, syntheticFixture().nonceStart + 511);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
  assert.equal(exportObject.boundaries.poolConnection, false);
  assert.equal(exportObject.boundaries.blockSubmission, false);
  assert.equal(exportObject.boundaries.validHashBenchmark, true);
  assert.equal(exportObject.boundaries.profilingOnly, false);
  assert.equal(exportObject.boundaries.outputReadback, true);
  const json = serializeProfilingExport(exportObject);
  assert.deepEqual(JSON.parse(json), exportObject);
  assert.doesNotMatch(json, /C:\\|\/Users\/|walletAddress|walletPrivate|privateKey|seedPhrase|password|secret|profitability/i);
  assert.doesNotMatch(profilingExportFilename(exportObject), /[\\/:*?"<>|]/);
});

test("Variant B profiling export includes combined submission metadata", () => {
  const result = mockProfilingResult({
    readbackStrategy: PROFILING_READBACK_STRATEGIES["multi-dispatch-single-readback"],
    physicalSubmissionCount: 1,
    queueWaitCount: 1,
    readbackCount: 1,
    commandBufferCount: 1,
    outputOffsetMap: buildProfilingOutputOffsetMap(8192, 512),
    deterministicResultOrdering: "Output index equals global task index, preserving ascending synthetic nonce order across one combined readback.",
    hostPhases: {
      copyEncodingMs: 0.3,
    },
  });
  const exportObject = buildProfilingExport({ result, timestamp: "2026-07-19T12:00:00.000Z" });
  assert.equal(exportObject.configuration.readbackStrategy, "multi-dispatch-single-readback");
  assert.equal(exportObject.configuration.logicalDispatchCount, 16);
  assert.equal(exportObject.configuration.physicalSubmissionCount, 1);
  assert.equal(exportObject.configuration.queueWaitCount, 1);
  assert.equal(exportObject.configuration.readbackCount, 1);
  assert.equal(exportObject.configuration.commandBufferCount, 1);
  assert.equal(exportObject.configuration.outputOffsetMap.length, 16);
  assert.equal(exportObject.boundaries.outputReadback, true);
  assert.equal(exportObject.boundaries.cpuSpotChecked, true);
  assert.equal(exportObject.boundaries.validHashBenchmark, true);
});

test("profiling repetition aggregation groups only compatible runs", () => {
  const first = buildProfilingExport({ result: mockProfilingResult({ totalElapsedMs: 100, hostPhases: { totalBenchmarkElapsedMs: 100 } }), timestamp: "2026-07-18T13:00:00.000Z" });
  const second = buildProfilingExport({ result: mockProfilingResult({ totalElapsedMs: 120, hostPhases: { totalBenchmarkElapsedMs: 120, queueCompletionWaitMs: 60 } }), timestamp: "2026-07-18T13:00:01.000Z" });
  const incompatible = buildProfilingExport({ result: mockProfilingResult({ totalRequested: 4096, resultCount: 4096, dispatchBatchSize: 256, dispatchCount: 16 }), timestamp: "2026-07-18T13:00:02.000Z" });
  assert.equal(compatibleProfilingRuns([first, second, incompatible], first).length, 2);
  const summary = buildProfilingSummary([mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 100 } }), mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 120 } })], {
    preset: DEFAULT_PROFILING_PRESET,
    repetitions: 2,
    readbackStrategyId: "current-per-dispatch",
    correctnessGate: mockSyntheticResult().correctnessGate,
  });
  assert.equal(summary.resultType, "synthetic-browser-profiling-summary");
  assert.equal(summary.validRunCount, 2);
  assert.equal(summary.statistics.totalElapsedMs.mean, 110);
  assert.equal(summary.boundaries.liveMining, false);
  assert.equal(summary.boundaries.outputReadback, true);
  const summaryExport = buildProfilingSummaryExport({ summary, userAgent: "UnitTest Browser", timestamp: "2026-07-18T13:00:03.000Z" });
  assert.equal(summaryExport.environment.userAgent, "UnitTest Browser");
  assert.doesNotMatch(profilingSummaryFilename(summaryExport), /[\\/:*?"<>|]/);
});

test("Variant A and Variant B comparison requires matching configurations and repeated runs", () => {
  const variantA = buildProfilingExport({
    result: mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 110 } }),
    timestamp: "2026-07-19T12:10:00.000Z",
  });
  const variantBResult = mockProfilingResult({
    readbackStrategy: PROFILING_READBACK_STRATEGIES["multi-dispatch-single-readback"],
    physicalSubmissionCount: 1,
    queueWaitCount: 1,
    readbackCount: 1,
    commandBufferCount: 1,
    outputOffsetMap: buildProfilingOutputOffsetMap(8192, 512),
    deterministicResultOrdering: "Output index equals global task index, preserving ascending synthetic nonce order across one combined readback.",
    hostPhases: { totalBenchmarkElapsedMs: 90 },
  });
  const variantB = buildProfilingExport({ result: variantBResult, timestamp: "2026-07-19T12:10:01.000Z" });
  const comparison = compareProfilingStrategyExports([variantA, variantB]);
  assert.equal(comparison.status, "Compatible profiling comparison available");
  assert.equal(comparison.repeatabilityBackedRecommendation, false);
  assert.match(comparison.recommendation, /At least three valid compatible runs/);

  const repeated = [
    variantA,
    buildProfilingExport({ result: mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 112 } }), timestamp: "2026-07-19T12:10:02.000Z" }),
    buildProfilingExport({ result: mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 111 } }), timestamp: "2026-07-19T12:10:03.000Z" }),
    variantB,
    buildProfilingExport({ result: { ...variantBResult, hostPhases: { ...variantBResult.hostPhases, totalBenchmarkElapsedMs: 91 }, interpretation: interpretProfilingPhases({ ...variantBResult.hostPhases, totalBenchmarkElapsedMs: 91 }) }, timestamp: "2026-07-19T12:10:04.000Z" }),
    buildProfilingExport({ result: { ...variantBResult, hostPhases: { ...variantBResult.hostPhases, totalBenchmarkElapsedMs: 92 }, interpretation: interpretProfilingPhases({ ...variantBResult.hostPhases, totalBenchmarkElapsedMs: 92 }) }, timestamp: "2026-07-19T12:10:05.000Z" }),
  ];
  const repeatedComparison = compareProfilingStrategyExports(repeated);
  assert.equal(repeatedComparison.repeatabilityBackedRecommendation, true);
  assert.match(repeatedComparison.recommendation, /Variant B is the repeatability-backed preferred profiling baseline/);
});

test("profiling comparison counts internal repetitions as samples without double-counting aggregates", () => {
  const variantASummary = buildMockProfilingSummaryExport("current-per-dispatch", [108.2, 110.8, 111.1]);
  const variantBSummary = buildMockProfilingSummaryExport("multi-dispatch-single-readback", [36.4, 36.4, 36.6]);
  const duplicateFirstIteration = buildProfilingExport({
    result: mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 108.2, queueCompletionWaitMs: 59.2, readbackMs: 5.8, cpuGpuComparisonMs: 24.8 } }),
    capabilities: {
      adapterInfo: { vendor: "nvidia", architecture: "blackwell" },
      limits: { maxComputeInvocationsPerWorkgroup: 256 },
    },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T14:00:02.000Z",
  });
  const samples = expandProfilingComparisonSamples([variantASummary, variantBSummary, duplicateFirstIteration]);
  assert.equal(samples.filter((sample) => sample.configuration.readbackStrategy === "current-per-dispatch").length, 3);
  assert.equal(samples.filter((sample) => sample.configuration.readbackStrategy === "multi-dispatch-single-readback").length, 3);

  const comparison = compareProfilingStrategyExports([variantASummary, variantBSummary, duplicateFirstIteration]);
  assert.equal(comparison.leftSampleCount, 3);
  assert.equal(comparison.rightSampleCount, 3);
  assert.equal(comparison.sufficientEvidence, true);
  assert.equal(comparison.repeatabilityBackedRecommendation, true);
  assert.match(comparison.recommendation, /For this browser, adapter, shader, fixture, 8,192-hash workload, and batch size 512/);
  assert.ok(comparison.deltaPercent < -66 && comparison.deltaPercent > -68);
  assert.equal(Math.round(comparison.queueWaitDeltaPercent * 10) / 10, -92.4);
  assert.equal(Math.round(comparison.readbackDeltaPercent * 10) / 10, -93.1);
  assert.equal(Math.round(comparison.throughputMultiplier * 10) / 10, 3.0);
});

test("profiling comparison excludes invalid, mismatched, pipeline-error, probe, and incompatible samples", () => {
  const variantASummary = buildMockProfilingSummaryExport("current-per-dispatch", [108.2, 110.8, 111.1]);
  const badVariantB = buildMockProfilingSummaryExport("multi-dispatch-single-readback", [36.4, 36.5, 36.6], {
    iterationOverrides: {
      0: { mismatchesAgainstCpuReference: 1, telemetryValidation: { valid: false, status: "invalid profiling telemetry", issues: ["normal profiling requires zero CPU/GPU spot-check mismatches"] } },
      1: { pipelineError: "test pipeline error", telemetryValidation: { valid: false, status: "invalid profiling telemetry", issues: ["profiling result must not include a pipeline error"] } },
      2: { validHashBenchmark: false, telemetryValidation: { valid: false, status: "invalid profiling telemetry", issues: ["normal profiling must complete exactly the requested hash count"] } },
    },
  });
  const probe = buildMockProfilingSummaryExport("dispatch-timing-probe-no-readback", [69.6], {
    iterationOverrides: {
      0: {
        validHashBenchmark: false,
        profilingOnly: true,
        outputReadback: false,
        cpuSpotChecked: false,
        returnedResultCount: 0,
      },
    },
  });
  const samples = expandProfilingComparisonSamples([variantASummary, badVariantB, probe]);
  assert.equal(samples.filter((sample) => sample.configuration.readbackStrategy === "current-per-dispatch").length, 3);
  assert.equal(samples.filter((sample) => sample.configuration.readbackStrategy === "multi-dispatch-single-readback").length, 0);
  assert.equal(samples.some((sample) => sample.configuration.readbackStrategy === "dispatch-timing-probe-no-readback"), false);

  const incompatible = buildMockProfilingSummaryExport("multi-dispatch-single-readback", [36.4, 36.4, 36.6]);
  incompatible.environment.userAgent = "Different Browser";
  const comparison = compareProfilingStrategyExports([variantASummary, incompatible]);
  assert.equal(comparison.repeatabilityBackedRecommendation, false);
  assert.equal(comparison.rightSampleCount, 0);
});

test("Variant B logical dispatch rows carry aggregate timing scope instead of individual timing", () => {
  const result = mockVariantBProfilingResult();
  assert.equal(result.perDispatch.length, 16);
  assert.equal(result.perDispatch.every((entry) => entry.timingScope === "combined-submission"), true);
  assert.equal(result.perDispatch.every((entry) => entry.timingOwner === "aggregate"), true);
  assert.equal(result.perDispatch.every((entry) => entry.logicalDispatchTimingIndividuallyMeasured === false), true);
  assert.equal(result.perDispatch.every((entry) => Object.keys(entry.timing).length === 0), true);
});

test("workgroup experiment mode is explicit and does not promote hashing benchmark defaults", () => {
  assert.equal(EXECUTION_MODES["webgpu-workgroup-experiment"].label, "WGSL workgroup-size experiment");
  assert.equal(canRunHashBenchmark("webgpu-workgroup-experiment"), false);
  assert.equal(DEFAULT_EXPERIMENT_WORKGROUP_SIZE, 1);
  assert.deepEqual(WORKGROUP_SIZE_OPTIONS, [1, 32, 64, 128, 256]);
  assert.equal(WORKGROUP_EXPERIMENT_MODE, "webgpu-workgroup-experiment");
  assert.deepEqual(Object.values(WORKGROUP_EXPERIMENT_ACTIONS), [
    "compile-selected-variant",
    "small-correctness-gate",
    "full-294-vector-verification",
    "performance-profile",
    "matched-wg1-wg32-comparison",
  ]);
  assert.equal(WORKGROUP_EXPERIMENT_ACTION_LABELS[WORKGROUP_EXPERIMENT_ACTIONS.full294], "Full 294-vector verification");
  assert.equal(WORKGROUP_EXPERIMENT_ACTION_LABELS[WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison], "Matched WG1 vs WG32 comparison");
  assert.equal(normalizeWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.full294), WORKGROUP_EXPERIMENT_ACTIONS.full294);
  assert.throws(() => normalizeWorkgroupExperimentAction("full-294"), /Unknown workgroup experiment action/);
});

test("workgroup action telemetry validates requested started and completed action routing", () => {
  const telemetry = createWorkgroupActionTelemetry({
    requestedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    runId: 7,
    timestamp: "2026-07-19T18:00:00.000Z",
  });
  assert.equal(telemetry.requestedActionType, WORKGROUP_EXPERIMENT_ACTIONS.full294);
  assert.equal(telemetry.startedActionType, WORKGROUP_EXPERIMENT_ACTIONS.full294);
  assert.equal(telemetry.completedActionType, null);
  assert.equal(telemetry.workgroupActionRunId, 7);
  const completed = completeWorkgroupActionTelemetry(telemetry, WORKGROUP_EXPERIMENT_ACTIONS.full294, {
    runId: 7,
    timestamp: "2026-07-19T18:00:10.000Z",
  });
  assert.equal(completed.completedActionType, WORKGROUP_EXPERIMENT_ACTIONS.full294);
  assert.equal(completed.actionRoutingConsistency, true);
  const mismatch = completeWorkgroupActionTelemetry(telemetry, WORKGROUP_EXPERIMENT_ACTIONS.smallGate, {
    runId: 7,
    timestamp: "2026-07-19T18:00:10.000Z",
  });
  assert.equal(mismatch.actionRoutingConsistency, false);
  assert.match(mismatch.actionRoutingMessage, /did not match/);
});

test("workgroup-size shader generation uses selected literal global index and bounds check", () => {
  const shader64 = buildBatchedWhirlpoolShader({ workgroupSize: 64 });
  assert.match(shader64, /@compute @workgroup_size\(64\)/);
  assert.match(shader64, /let index = gid\.x;/);
  assert.match(shader64, /if \(index >= params\.taskCount\)/);
  assert.doesNotMatch(shader64, /local_invocation_id/);
  assert.match(buildMinimalWhirlpoolShader({ workgroupSize: 32 }), /@compute @workgroup_size\(32\)/);
});

test("workgroup sizes use distinct pipeline keys and reject unsupported values without clamping", () => {
  assert.deepEqual(WORKGROUP_SIZE_OPTIONS.map((size) => whirlpoolPipelineKey(size)), [
    "whirlpool-batched-wg1",
    "whirlpool-batched-wg32",
    "whirlpool-batched-wg64",
    "whirlpool-batched-wg128",
    "whirlpool-batched-wg256",
  ]);
  assert.throws(() => buildBatchedWhirlpoolShader({ workgroupSize: 16 }), /unsupported WGSL workgroup size 16/);
  assert.throws(() => whirlpoolPipelineKey(999), /unsupported WGSL workgroup size 999/);
});

test("alternate workgroup sizes force the batched fixture-suite shader path", () => {
  const source = readFileSync("src/webgpu/whirlpool-fixture-suite.js", "utf8");
  assert.match(source, /batchSize > 1 \|\| workgroupSize !== WGSL_WORKGROUP_SIZE/);
  assert.match(source, /runWebGPUWhirlpoolBatchedFixtureSuite/);
});

test("device-limit validation reports unsupported workgroup sizes without silent clamping", () => {
  assert.equal(validateWebGPUWorkgroupSize(64, {
    maxComputeInvocationsPerWorkgroup: 128,
    maxComputeWorkgroupSizeX: 128,
  }).valid, true);
  const unsupported = validateWebGPUWorkgroupSize(256, {
    maxComputeInvocationsPerWorkgroup: 128,
    maxComputeWorkgroupSizeX: 128,
  });
  assert.equal(unsupported.valid, false);
  assert.equal(unsupported.reason, "Unsupported by current WebGPU device limits");
  const rows = workgroupDeviceSupportRows({
    maxComputeInvocationsPerWorkgroup: 64,
    maxComputeWorkgroupSizeX: 64,
  });
  assert.equal(rows.find((row) => row.workgroupSize === 128).deviceSupport, "Unsupported by current WebGPU device limits");
});

test("workgroup invocation accounting handles divisible and padded dispatches", () => {
  assert.deepEqual(workgroupInvocationPlan(512, 64), {
    wgslWorkgroupSize: 64,
    hashesSubmitted: 512,
    workgroupCount: 8,
    totalLaunchedInvocations: 512,
    activeInvocations: 512,
    paddedInactiveInvocations: 0,
    partialFinalWorkgroupInvocations: 64,
  });
  assert.deepEqual(workgroupChunkAccounting(513, 256), {
    workgroupSize: 256,
    hashesSubmitted: 513,
    workgroupCount: 3,
    totalLaunchedInvocations: 768,
    activeInvocations: 513,
    paddedInactiveInvocations: 255,
    hasPartialFinalWorkgroup: true,
    finalWorkgroupActiveInvocations: 1,
    partialFinalWorkgroupActiveInvocations: 1,
  });
  assert.deepEqual(workgroupChunkAccounting(512, 64), {
    workgroupSize: 64,
    hashesSubmitted: 512,
    workgroupCount: 8,
    totalLaunchedInvocations: 512,
    activeInvocations: 512,
    paddedInactiveInvocations: 0,
    hasPartialFinalWorkgroup: false,
    finalWorkgroupActiveInvocations: 64,
    partialFinalWorkgroupActiveInvocations: 0,
  });
  const plan = buildLogicalDispatchPlan(1025, 512, 256);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].workgroupCount, 2);
  assert.equal(plan[2].count, 1);
  assert.equal(plan[2].paddedInactiveInvocations, 255);
  assert.equal(outputOffsetRangesOverlap(plan), false);
});

test("workgroup full-294 verification accounting is executed accounting, not planned profiling", () => {
  assert.equal(FULL_294_WORKGROUP_EXPERIMENT_BATCH_SIZE, 294);
  const wg32 = workgroupExecutedVerificationAccounting({ vectorCount: 294, batchSize: 294, workgroupSize: 32 });
  assert.equal(wg32.accountingScope, "executed-full-core-vector-verification");
  assert.equal(wg32.hashCount, 294);
  assert.equal(wg32.logicalBatchSize, 294);
  assert.equal(wg32.logicalDispatchCount, 1);
  assert.equal(wg32.totalWorkgroups, 10);
  assert.equal(wg32.totalLaunchedInvocations, 320);
  assert.equal(wg32.activeInvocations, 294);
  assert.equal(wg32.paddedInactiveInvocations, 26);
  assert.equal(wg32.chunks[0].hasPartialFinalWorkgroup, true);
  assert.equal(wg32.chunks[0].finalWorkgroupActiveInvocations, 6);
  assert.equal(wg32.chunks[0].partialFinalWorkgroupActiveInvocations, 6);

  const planned = workgroupExperimentInvocationAccounting({ workgroupSize: 32 });
  assert.equal(planned.hashCount, 8192);
  assert.equal(planned.logicalBatchSize, 512);
  assert.notEqual(planned.hashCount, wg32.hashCount);
});

test("profiling physical accounting includes selected workgroup-size launch counts", () => {
  const wg1 = profilingPhysicalAccounting({ hashCount: 8192, dispatchBatchSize: 512, workgroupSize: 1 });
  const wg64 = profilingPhysicalAccounting({ hashCount: 8192, dispatchBatchSize: 512, workgroupSize: 64 });
  assert.equal(wg1.totalWorkgroups, 8192);
  assert.equal(wg64.totalWorkgroups, 128);
  assert.equal(wg64.totalLaunchedInvocations, 8192);
  assert.equal(wg64.paddedInactiveInvocations, 0);
  assert.equal(buildProfilingOutputOffsetMap(1025, 512, 256)[2].paddedInactiveInvocations, 255);
});

test("workgroup profiling accounting maps wg32 performance to Variant B execution counts", () => {
  const accounting = workgroupProfilingInvocationAccounting({
    hashCount: 8192,
    logicalBatchSize: 512,
    workgroupSize: 32,
  });
  assert.equal(accounting.accountingScope, "executed-workgroup-performance-profile");
  assert.equal(accounting.hashCount, 8192);
  assert.equal(accounting.requestedHashes, 8192);
  assert.equal(accounting.completedHashes, 8192);
  assert.equal(accounting.logicalDispatchCount, 16);
  assert.equal(accounting.physicalSubmissionCount, 1);
  assert.equal(accounting.queueWaitCount, 1);
  assert.equal(accounting.readbackCount, 1);
  assert.equal(accounting.commandBufferCount, 1);
  assert.equal(accounting.workgroupsPerLogicalDispatch, 16);
  assert.equal(accounting.totalWorkgroups, 256);
  assert.equal(accounting.totalLaunchedInvocations, 8192);
  assert.equal(accounting.activeInvocations, 8192);
  assert.equal(accounting.totalActiveInvocations, 8192);
  assert.equal(accounting.paddedInactiveInvocations, 0);
});

test("workgroup profiling summary preserves selected wg32 pipeline and rejects zero-hash placeholders", () => {
  const iteration = mockWorkgroup32VariantBProfilingResult();
  const summary = buildProfilingSummary([iteration], {
    preset: DEFAULT_PROFILING_PRESET,
    repetitions: 1,
    readbackStrategyId: DEFAULT_PROFILING_READBACK_STRATEGY,
    correctnessGate: mockSyntheticResult().correctnessGate,
    workgroupSize: 32,
  });
  assert.equal(summary.configuration.wgslWorkgroupSize, 32);
  const profiling = summarizeWorkgroupProfilingResult({
    profilingSummary: summary,
    workgroupSize: 32,
    full294: { status: "passed", passed: true, matches: 294, mismatches: 0 },
  });
  assert.equal(profiling.profilingExecuted, true);
  assert.equal(profiling.validProfilingRun, true);
  assert.equal(profiling.pipelineKey, "whirlpool-batched-wg32");
  assert.equal(profiling.hashesCompleted, 8192);
  assert.equal(profiling.resultCount, 8192);
  assert.equal(profiling.returnedResultCount, 8192);
  assert.equal(profiling.logicalDispatchCount, 16);
  assert.equal(profiling.physicalSubmissionCount, 1);
  assert.equal(profiling.queueWaitCount, 1);
  assert.equal(profiling.readbackCount, 1);
  assert.equal(profiling.totalWorkgroups, 256);
  assert.equal(profiling.activeInvocations, 8192);
  assert.equal(profiling.paddedInactiveInvocations, 0);
  assert.equal(profiling.cpuSpotCheckStatus, "passed");
  assert.equal(profiling.mismatchCount, 0);
  assert.equal(profiling.telemetryConsistency.valid, true);

  const zeroIteration = mockWorkgroup32VariantBProfilingResult({
    resultCount: 0,
    returnedResultCount: 0,
    validHashBenchmark: false,
    telemetryValidation: { valid: false, status: "invalid profiling telemetry", issues: ["normal profiling must complete exactly the requested hash count"] },
  });
  const zeroSummary = buildProfilingSummary([zeroIteration], {
    preset: DEFAULT_PROFILING_PRESET,
    repetitions: 1,
    readbackStrategyId: DEFAULT_PROFILING_READBACK_STRATEGY,
    correctnessGate: mockSyntheticResult().correctnessGate,
    workgroupSize: 32,
  });
  const zeroProfiling = summarizeWorkgroupProfilingResult({
    profilingSummary: zeroSummary,
    workgroupSize: 32,
    full294: { status: "passed", passed: true, matches: 294, mismatches: 0 },
  });
  assert.equal(zeroProfiling.profilingExecuted, true);
  assert.equal(zeroProfiling.validProfilingRun, false);
  assert.equal(zeroProfiling.hashesCompleted, 0);
  assert.equal(zeroProfiling.returnedResultCount, 0);
  assert.match(zeroProfiling.telemetryConsistency.issues.join("; "), /requested hash count/);
});

test("matched workgroup comparison locks without current-session full passes and records alternating order", () => {
  const locked = matchedWorkgroupComparisonPrerequisites({
    statuses: createWorkgroupStatusMap(),
    repetitions: 3,
    deviceLimits: { maxComputeInvocationsPerWorkgroup: 256, maxComputeWorkgroupSizeX: 256 },
  });
  assert.equal(locked.available, false);
  assert.match(locked.missing.join("; "), /WG1 current-session full 294 verification not passed/);
  assert.match(locked.missing.join("; "), /WG32 pipeline not compiled/);
  const readyStatuses = createWorkgroupStatusMap();
  for (const size of [1, 32]) {
    readyStatuses[size] = {
      ...readyStatuses[size],
      deviceSupport: "supported",
      pipeline: "compiled",
      smallGate: "passed",
      full294: "passed",
      currentSessionFull294Passed: true,
    };
  }
  const ready = matchedWorkgroupComparisonPrerequisites({
    statuses: readyStatuses,
    repetitions: 3,
    deviceLimits: { maxComputeInvocationsPerWorkgroup: 256, maxComputeWorkgroupSizeX: 256 },
  });
  assert.equal(ready.available, true);
  assert.deepEqual(matchedWorkgroupExecutionOrder({ repetitions: 3 }).map((entry) => `${entry.workgroupSize}:${entry.repetitionIndex}`), [
    "1:1",
    "32:1",
    "32:2",
    "1:2",
    "1:3",
    "32:3",
  ]);
});

test("matched workgroup samples enforce pipeline identity and Variant B accounting", () => {
  const wg1 = validateMatchedWorkgroupProfileSample({
    iteration: mockWorkgroupVariantBProfilingResult(1),
    requestedWorkgroupSize: 1,
    repetitionIndex: 1,
    executionOrderIndex: 0,
    actionRunId: 44,
  });
  assert.equal(wg1.valid, true);
  assert.equal(wg1.requestedPipelineKey, "whirlpool-batched-wg1");
  assert.equal(wg1.executedPipelineKey, "whirlpool-batched-wg1");
  assert.equal(wg1.totalWorkgroups, 8192);
  assert.equal(wg1.activeInvocations, 8192);
  assert.equal(wg1.paddedInactiveInvocations, 0);
  assert.equal(wg1.logicalDispatchCount, 16);
  assert.equal(wg1.physicalSubmissionCount, 1);
  assert.equal(wg1.queueWaitCount, 1);
  assert.equal(wg1.readbackCount, 1);

  const wg32 = validateMatchedWorkgroupProfileSample({
    iteration: mockWorkgroupVariantBProfilingResult(32),
    requestedWorkgroupSize: 32,
    repetitionIndex: 1,
    executionOrderIndex: 1,
    actionRunId: 44,
  });
  assert.equal(wg32.valid, true);
  assert.equal(wg32.requestedPipelineKey, "whirlpool-batched-wg32");
  assert.equal(wg32.executedPipelineKey, "whirlpool-batched-wg32");
  assert.equal(wg32.totalWorkgroups, 256);
  assert.equal(wg32.activeInvocations, 8192);
  assert.equal(wg32.paddedInactiveInvocations, 0);

  const wrongPipeline = validateMatchedWorkgroupProfileSample({
    iteration: mockWorkgroupVariantBProfilingResult(1),
    requestedWorkgroupSize: 32,
    repetitionIndex: 1,
    executionOrderIndex: 2,
  });
  assert.equal(wrongPipeline.valid, false);
  assert.match(wrongPipeline.issues.join("; "), /pipeline identity mismatch/);

  const zeroResult = validateMatchedWorkgroupProfileSample({
    iteration: mockWorkgroupVariantBProfilingResult(32, {
      resultCount: 0,
      returnedResultCount: 0,
      validHashBenchmark: false,
      telemetryValidation: { valid: false, status: "invalid profiling telemetry", issues: ["normal profiling must complete exactly the requested hash count"] },
    }),
    requestedWorkgroupSize: 32,
    repetitionIndex: 2,
    executionOrderIndex: 3,
  });
  assert.equal(zeroResult.valid, false);
  assert.match(zeroResult.issues.join("; "), /8,192/);
});

test("matched WG1 vs WG32 comparison aggregates samples and blocks high variability recommendations", () => {
  const wg1Totals = [50.0, 51.0, 51.67];
  const wg32Totals = [38.0, 41.8, 51.9];
  const wg1Throughput = [165000, 169000, 172300];
  const wg32Throughput = [217870, 196920, 159070];
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push(validateMatchedWorkgroupProfileSample({
      iteration: mockWorkgroupVariantBProfilingResult(1, {
        hostPhases: { totalBenchmarkElapsedMs: wg1Totals[index], queueCompletionWaitMs: 4.5, readbackMs: 0.4, cpuGpuComparisonMs: 25 },
        verifiedHashesPerSecondIncludingPipeline: wg1Throughput[index],
        verifiedHashesPerSecondExcludingPipeline: (8192 * 1000) / 30,
      }),
      requestedWorkgroupSize: 1,
      repetitionIndex: index + 1,
      executionOrderIndex: index * 2,
    }));
    samples.push(validateMatchedWorkgroupProfileSample({
      iteration: mockWorkgroupVariantBProfilingResult(32, {
        hostPhases: { totalBenchmarkElapsedMs: wg32Totals[index], queueCompletionWaitMs: 5.93, readbackMs: 0.4, cpuGpuComparisonMs: 29.1 },
        verifiedHashesPerSecondIncludingPipeline: wg32Throughput[index],
        verifiedHashesPerSecondExcludingPipeline: (8192 * 1000) / 30,
      }),
      requestedWorkgroupSize: 32,
      repetitionIndex: index + 1,
      executionOrderIndex: index * 2 + 1,
    }));
  }
  const comparison = buildMatchedWorkgroupComparison({
    samples,
    executionOrder: matchedWorkgroupExecutionOrder({ repetitions: 3 }),
    repetitions: 3,
    capabilities: { adapterInfo: { vendor: "nvidia", architecture: "blackwell" }, limits: { maxComputeInvocationsPerWorkgroup: 256 } },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T18:00:00.000Z",
  });
  assert.equal(comparison.aggregate[1].validRepetitionCount, 3);
  assert.equal(comparison.aggregate[32].validRepetitionCount, 3);
  assert.equal(comparison.compatible, true);
  assert.equal(comparison.matchedComparisonStatus.valid, true);
  assert.equal(comparison.matchedComparisonStatus.recommendationEligible, false);
  assert.equal(comparison.matchedComparisonStatus.variabilityEligible, false);
  assert.equal(comparison.recommendationEligible, false);
  assert.equal(comparison.interpretation.message, "Observed variability is too high for a workgroup-size recommendation.");
  assert.match(comparison.differences.direction, /WG32 relative to WG1/);
  assert.ok(comparison.differences.meanThroughputPercent > 13);
  assert.ok(comparison.differences.meanThroughputPercent < 14);
  assert.equal(comparison.summary.action, "matched WG1 vs WG32 comparison");
  assert.equal(comparison.summary.totalValidSamples, 6);
  assert.equal(comparison.summary.totalInvalidSamples, 0);
  assert.equal(comparison.summary.comparisonValidity, "valid matched comparison");
  assert.equal(comparison.summary.recommendationEligibility, "no recommendation");
  assert.equal(comparison.currentSessionFull294[1].matches, 294);
  assert.equal(comparison.currentSessionFull294[32].matches, 294);
  assert.equal(comparison.executedInvocationAccounting.wg1.perRepetition[0].totalWorkgroups, 8192);
  assert.equal(comparison.executedInvocationAccounting.wg32.perRepetition[0].totalWorkgroups, 256);
  assert.equal(comparison.executedInvocationAccounting.wg1.aggregate.activeInvocations, 24576);
  assert.equal(comparison.executedInvocationAccounting.wg32.aggregate.activeInvocations, 24576);
  assert.equal(comparison.executedProfilingAccounting.wg1.totalCompletedHashes, 24576);
  assert.equal(comparison.executedProfilingAccounting.wg32.totalCompletedHashes, 24576);
  assert.equal(comparison.executedProfilingAccounting.combined.totalCompletedHashes, 49152);
  assert.equal(comparison.executedProfilingAccounting.combined.totalReturnedResults, 49152);
  assert.equal(comparison.executedProfilingAccounting.combined.totalLogicalDispatches, 96);
  assert.equal(comparison.executedProfilingAccounting.combined.totalSubmissions, 6);
  assert.equal(comparison.executedProfilingAccounting.combined.totalQueueWaits, 6);
  assert.equal(comparison.executedProfilingAccounting.combined.totalReadbacks, 6);
  assert.equal(comparison.executedProfilingAccounting.combined.totalCommandBuffers, 6);
  assert.equal(comparison.executedProfilingAccounting.combined.totalCpuSpotChecks, 24);
  assert.ok(comparison.recommendationBlockers.some((blocker) => blocker.metric === "wg32.totalElapsedCv"));
  assert.ok(comparison.recommendationBlockers.some((blocker) => blocker.metric === "wg32.throughputCv"));
  assert.equal(comparison.boundaries.matchedWorkgroupComparison, true);
  assert.equal(comparison.boundaries.liveMining, false);
  assert.equal(comparison.boundaries.targetComparison, false);
  assert.equal(comparison.boundaries.nativePerformance, false);
  assert.doesNotMatch(serializeMatchedWorkgroupComparison(comparison), /walletAddress|privateKey|profitability|native CUDA/i);
  assert.doesNotMatch(matchedWorkgroupComparisonFilename(comparison), /[\\/:*?"<>|]/);
});

test("matched workgroup export keeps valid comparison separate from recommendation eligibility", () => {
  const samples = matchedWorkgroupExecutionOrder({ repetitions: 3 }).map((step) => validateMatchedWorkgroupProfileSample({
    iteration: mockWorkgroupVariantBProfilingResult(step.workgroupSize, {
      hostPhases: {
        totalBenchmarkElapsedMs: step.workgroupSize === 1 ? [50.0, 51.0, 51.67][step.repetitionIndex - 1] : [38.0, 41.8, 51.9][step.repetitionIndex - 1],
        queueCompletionWaitMs: step.workgroupSize === 1 ? 4.5 : 5.93,
        readbackMs: 0.4,
        cpuGpuComparisonMs: step.workgroupSize === 1 ? 25 : 29.1,
      },
      verifiedHashesPerSecondIncludingPipeline: step.workgroupSize === 1
        ? [165000, 169000, 172300][step.repetitionIndex - 1]
        : [217870, 196920, 159070][step.repetitionIndex - 1],
    }),
    requestedWorkgroupSize: step.workgroupSize,
    repetitionIndex: step.repetitionIndex,
    executionOrderIndex: step.executionOrderIndex,
    actionRunId: 500,
  }));
  const comparison = buildMatchedWorkgroupComparison({
    samples,
    executionOrder: matchedWorkgroupExecutionOrder({ repetitions: 3 }),
    repetitions: 3,
    timestamp: "2026-07-19T18:30:00.000Z",
  });
  const exportObject = buildWorkgroupExperimentExport({
    actionResult: {
      actionType: WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison,
      workgroupSize: 32,
      pipelineKey: "whirlpool-batched-wg32",
      compileGate: "compiled",
      deviceValidation: { valid: true },
      smallGate: { status: "passed", passed: true },
      full294: { status: "passed", passed: true, matches: 294, mismatches: 0 },
      matchedComparison: comparison,
      executedInvocationAccounting: comparison.executedInvocationAccounting,
      executedProfilingAccounting: comparison.executedProfilingAccounting,
    },
    capabilities: { adapterInfo: { vendor: "nvidia", architecture: "blackwell" }, limits: { maxComputeInvocationsPerWorkgroup: 256 } },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T18:30:00.000Z",
  });
  assert.equal(exportObject.matchedComparisonStatus.valid, true);
  assert.equal(exportObject.matchedComparisonStatus.recommendationEligible, false);
  assert.equal(exportObject.matchedComparisonSummary.totalValidSamples, 6);
  assert.equal(exportObject.executedInvocationAccounting.wg1.aggregate.totalWorkgroups, 24576);
  assert.equal(exportObject.executedInvocationAccounting.wg32.aggregate.totalWorkgroups, 768);
  assert.equal(exportObject.executedVerificationAccounting.wg1.aggregate.totalWorkgroups, 24576);
  assert.equal(exportObject.executedVerificationAccounting.wg32.aggregate.totalWorkgroups, 768);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalCompletedHashes, 49152);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalReturnedResults, 49152);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalLogicalDispatches, 96);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalSubmissions, 6);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalQueueWaits, 6);
  assert.equal(exportObject.executedProfilingAccounting.combined.totalReadbacks, 6);
  assert.equal(exportObject.boundaries.matchedWorkgroupComparison, true);
  assert.equal(exportObject.boundaries.browserObservedProfiling, true);
  assert.equal(exportObject.boundaries.walletUse, false);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
});

test("matched comparison rendering uses safe accounting and preserves completed results on display failure", () => {
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(app, /function formatNumberSafe/);
  assert.match(app, /function formatIntegerSafe/);
  assert.match(app, /function formatPercentSafe/);
  assert.match(app, /function formatMillisecondsSafe/);
  assert.match(app, /function formatRateSafe/);
  assert.match(app, /function workgroupDisplayAccounting/);
  assert.match(app, /matched WG1\/WG32 executed accounting/);
  assert.doesNotMatch(app, /displayAccounting\.activeInvocations\.toLocaleString\(\)/);
  assert.doesNotMatch(app, /displayAccounting\.paddedInactiveInvocations\.toLocaleString\(\)/);
  assert.match(app, /Matched comparison completed, but one summary field could not be formatted\. Raw result preserved\./);
  assert.match(app, /state\.workgroupResult\.matchedComparison/);
  assert.match(app, /state\.workgroupMatchedComparisonExport = state\.workgroupResult\.matchedComparison/);
  assert.match(app, /status: "completed; render failed"/);
  assert.match(app, /executionStatus/);
  assert.match(app, /renderStatus/);
});

test("matched comparison schema tolerates absent optional timing without losing accounting", () => {
  const samples = matchedWorkgroupExecutionOrder({ repetitions: 3 }).map((step) => {
    const iteration = mockWorkgroupVariantBProfilingResult(step.workgroupSize, {
      hostPhases: {
        totalBenchmarkElapsedMs: step.workgroupSize === 1 ? 50 + step.repetitionIndex : 40 + step.repetitionIndex,
        queueCompletionWaitMs: step.workgroupSize === 1 ? 4.5 : 4.2,
        readbackMs: 0.4,
        cpuGpuComparisonMs: step.workgroupSize === 1 ? 25 : 24,
      },
    });
    delete iteration.hostPhases.resultDecodingMs;
    return validateMatchedWorkgroupProfileSample({
      iteration,
      requestedWorkgroupSize: step.workgroupSize,
      repetitionIndex: step.repetitionIndex,
      executionOrderIndex: step.executionOrderIndex,
      actionRunId: 777,
    });
  });
  const comparison = buildMatchedWorkgroupComparison({
    samples,
    executionOrder: matchedWorkgroupExecutionOrder({ repetitions: 3 }),
    repetitions: 3,
    timestamp: "2026-07-19T19:10:00.000Z",
  });
  assert.equal(comparison.matchedComparisonStatus.valid, true);
  assert.equal(comparison.matchedComparisonStatus.recommendationEligible, false);
  assert.ok(comparison.recommendationBlockers.length > 0);
  assert.equal(comparison.executedInvocationAccounting.wg1.perRepetition.length, 3);
  assert.equal(comparison.executedInvocationAccounting.wg32.perRepetition.length, 3);
  assert.equal(comparison.executedProfilingAccounting.combined.totalCompletedHashes, 49152);
  assert.equal(comparison.executedProfilingAccounting.combined.totalReturnedResults, 49152);
  assert.equal(comparison.samples.at(-1).actionRunId, 777);
  assert.doesNotThrow(() => serializeMatchedWorkgroupComparison(comparison));
});

test("workgroup-size statuses are isolated per variant", () => {
  const map = createWorkgroupStatusMap();
  map[32].smallGate = "passed";
  map[32].full294 = "pending";
  assert.equal(map[64].smallGate, "not run");
  assert.equal(map[1].documentedPriorFull294Passed, true);
  assert.equal(workgroupExperimentStatusTemplate(128).pipelineKey, "whirlpool-batched-wg128");
});

test("workgroup performance eligibility requires full 294 current-session verification", () => {
  assert.equal(workgroupPerformanceActionAvailable({
    deviceSupport: "supported",
    pipeline: "compiled",
    smallGate: "passed",
    full294: "passed",
    profiling: "not run",
    currentSessionFull294Passed: true,
  }), true);
  assert.equal(workgroupPerformanceEligible({
    deviceSupport: "supported",
    pipeline: "compiled",
    smallGate: "passed",
    full294: "pending",
    profiling: "valid",
    currentSessionFull294Passed: false,
  }), false);
  assert.equal(workgroupPerformanceEligible({
    deviceSupport: "supported",
    pipeline: "compiled",
    smallGate: "passed",
    full294: "passed",
    profiling: "valid",
    currentSessionFull294Passed: true,
  }), true);
});

test("workgroup full-294 export records selected pipeline and does not claim performance benchmark", () => {
  const actionTelemetry = completeWorkgroupActionTelemetry(createWorkgroupActionTelemetry({
    requestedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    runId: 11,
    timestamp: "2026-07-19T16:00:00.000Z",
  }), WORKGROUP_EXPERIMENT_ACTIONS.full294, {
    runId: 11,
    timestamp: "2026-07-19T16:00:20.000Z",
  });
  const fullResult = {
    actionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    requestedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    startedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    completedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    actionRoutingConsistency: true,
    actionTelemetry,
    workgroupSize: 32,
    pipelineKey: "whirlpool-batched-wg32",
    compileGate: "compiled",
    deviceValidation: { valid: true, workgroupSize: 32 },
    pipelineDiagnostics: {
      pipelineKey: "whirlpool-batched-wg32",
      workgroupSize: 32,
      shaderCodeUnits: 13763,
      shaderUtf8Bytes: 13763,
      thisRunPipelineCreationMs: 0,
      deviceLimits: { maxComputeInvocationsPerWorkgroup: 256, maxComputeWorkgroupSizeX: 256 },
    },
    smallGate: { status: "passed", passed: true },
    full294: {
      status: "passed",
      passed: true,
      matches: 294,
      mismatches: 0,
      resultCount: 294,
      selectedVectorCount: 294,
      vectorCount: 294,
      firstMismatch: null,
    },
    deterministicOrderingStatus: "preserved",
    executedInvocationAccounting: workgroupExecutedVerificationAccounting({ vectorCount: 294, batchSize: 294, workgroupSize: 32 }),
  };
  const exportObject = buildWorkgroupExperimentExport({
    actionResult: fullResult,
    capabilities: { adapterInfo: { vendor: "nvidia", architecture: "blackwell" } },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T16:00:00.000Z",
  });
  assert.equal(exportObject.actionType, "full-294-vector-verification");
  assert.equal(exportObject.actionTelemetry.requestedActionType, "full-294-vector-verification");
  assert.equal(exportObject.actionTelemetry.completedActionType, "full-294-vector-verification");
  assert.equal(exportObject.correctness.actionRoutingConsistency, true);
  assert.equal(exportObject.configuration.pipelineKey, "whirlpool-batched-wg32");
  assert.equal(exportObject.executedVerificationAccounting.totalWorkgroups, 10);
  assert.equal(exportObject.executedVerificationAccounting.paddedInactiveInvocations, 26);
  assert.equal(exportObject.plannedProfilingAccounting.hashCount, 8192);
  assert.equal(exportObject.correctness.full294Status, "passed");
  assert.equal(exportObject.correctness.full294Matches, 294);
  assert.equal(exportObject.correctness.performanceActionAvailable, true);
  assert.equal(exportObject.correctness.performanceEligible, false);
  assert.equal(exportObject.boundaries.fullCoreVerificationPassed, true);
  assert.equal(exportObject.boundaries.actionRoutingConsistency, true);
  assert.equal(exportObject.boundaries.performanceBenchmark, false);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
});

test("workgroup performance export carries real Variant B wg32 profiling telemetry", () => {
  const actionTelemetry = completeWorkgroupActionTelemetry(createWorkgroupActionTelemetry({
    requestedActionType: WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile,
    runId: 12,
    timestamp: "2026-07-19T17:00:00.000Z",
  }), WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile, {
    runId: 12,
    timestamp: "2026-07-19T17:00:04.000Z",
  });
  const iteration = mockWorkgroup32VariantBProfilingResult({
    hostPhases: {
      totalBenchmarkElapsedMs: 38.9,
      queueCompletionWaitMs: 3.7,
      readbackMs: 0.4,
      cpuGpuComparisonMs: 26.0,
    },
    verifiedHashesPerSecondIncludingPipeline: 214000,
  });
  const profilingSummary = buildProfilingSummary([iteration], {
    preset: DEFAULT_PROFILING_PRESET,
    repetitions: 1,
    readbackStrategyId: DEFAULT_PROFILING_READBACK_STRATEGY,
    correctnessGate: mockSyntheticResult().correctnessGate,
    workgroupSize: 32,
  });
  const full294 = {
    status: "passed",
    passed: true,
    matches: 294,
    mismatches: 0,
    resultCount: 294,
    selectedVectorCount: 294,
    prerequisiteSource: "current-session workgroup status",
  };
  const profiling = summarizeWorkgroupProfilingResult({ profilingSummary, workgroupSize: 32, full294 });
  const actionResult = {
    actionType: WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile,
    actionTelemetry,
    workgroupSize: 32,
    pipelineKey: "whirlpool-batched-wg32",
    compileGate: "compiled",
    deviceValidation: { valid: true, workgroupSize: 32 },
    pipelineDiagnostics: iteration.pipelineDiagnostics,
    smallGate: { status: "passed", passed: true },
    full294,
    profiling,
    profilingExecuted: profiling.profilingExecuted,
    validProfilingRun: profiling.validProfilingRun,
    performanceEligible: profiling.performanceEligible,
    hashesCompleted: profiling.hashesCompleted,
    resultCount: profiling.resultCount,
    returnedResultCount: profiling.returnedResultCount,
    executedProfilingAccounting: workgroupProfilingInvocationAccounting({
      hashCount: 8192,
      logicalBatchSize: 512,
      workgroupSize: 32,
    }),
    plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: 32 }),
    profilingSummary,
    result: iteration,
  };
  const exportObject = buildWorkgroupExperimentExport({
    actionResult,
    profilingSummary,
    capabilities: { adapterInfo: { vendor: "nvidia", architecture: "blackwell" } },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T17:00:00.000Z",
  });
  assert.equal(exportObject.actionType, "performance-profile");
  assert.equal(exportObject.actionTelemetry.actionRoutingConsistency, true);
  assert.equal(exportObject.configuration.pipelineKey, "whirlpool-batched-wg32");
  assert.equal(exportObject.configuration.workgroupSize, 32);
  assert.equal(exportObject.configuration.repetitionCount, 1);
  assert.equal(exportObject.correctness.full294Status, "passed");
  assert.equal(exportObject.correctness.full294Matches, 294);
  assert.equal(exportObject.correctness.syntheticProfilingStatus, "valid");
  assert.equal(exportObject.correctness.profilingExecuted, true);
  assert.equal(exportObject.correctness.validProfilingRun, true);
  assert.equal(exportObject.correctness.cpuSpotCheckStatus, "passed");
  assert.equal(exportObject.correctness.mismatchCount, 0);
  assert.equal(exportObject.correctness.pipelineError, null);
  assert.equal(exportObject.profiling.hashesCompleted, 8192);
  assert.equal(exportObject.profiling.resultCount, 8192);
  assert.equal(exportObject.profiling.returnedResultCount, 8192);
  assert.equal(exportObject.executedProfilingAccounting.logicalDispatchCount, 16);
  assert.equal(exportObject.executedProfilingAccounting.physicalSubmissionCount, 1);
  assert.equal(exportObject.executedProfilingAccounting.queueWaitCount, 1);
  assert.equal(exportObject.executedProfilingAccounting.readbackCount, 1);
  assert.equal(exportObject.executedProfilingAccounting.totalWorkgroups, 256);
  assert.equal(exportObject.executedProfilingAccounting.activeInvocations, 8192);
  assert.equal(exportObject.executedProfilingAccounting.paddedInactiveInvocations, 0);
  assert.equal(exportObject.timing.totalElapsedMs, 38.9);
  assert.equal(exportObject.timing.queueWaitMs, 3.7);
  assert.equal(exportObject.timing.readbackMs, 0.4);
  assert.equal(exportObject.timing.cpuValidationMs, 26.0);
  assert.equal(exportObject.timing.hashesPerSecondIncludingPipeline, 214000);
  assert.equal(exportObject.boundaries.performanceBenchmark, true);
  assert.equal(exportObject.boundaries.nativePerformance, false);
  assert.equal(exportObject.boundaries.outputReadback, true);
  assert.equal(exportObject.boundaries.cpuSpotChecked, true);
  assert.equal(exportObject.boundaries.validProfilingRun, true);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
  assert.doesNotMatch(serializeWorkgroupExperimentExport(exportObject), /walletAddress|privateKey|filesystem|profitability/i);
});

test("workgroup experiment UI exposes explicit actions and full-294 selected-size path", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /id="compileWorkgroupVariant" type="button"/);
  assert.match(html, /id="runWorkgroupSmallGate" type="button"/);
  assert.match(html, /id="runWorkgroupFull294" type="button"/);
  assert.match(html, /id="runWorkgroupPerformance" type="button"/);
  assert.match(html, /id="runMatchedWorkgroupComparison" type="button"/);
  assert.match(html, /id="clearSelectedWorkgroupHistory" type="button"/);
  assert.match(html, /id="clearWorkgroupHistory" type="button"/);
  assert.match(html, /id="clearMatchedWorkgroupComparison" type="button"/);
  assert.match(html, /Compile selected variant/);
  assert.match(html, /Run small correctness gate/);
  assert.match(html, /Run full 294-vector verification/);
  assert.match(html, /Run performance profile/);
  assert.match(html, /Run matched WG1 vs WG32 comparison/);
  assert.match(html, /Selecting Full 294 here does not change a workgroup experiment button action/);
  assert.match(app, /runWorkgroupFullVerification/);
  assert.match(app, /function runWorkgroupFull294Action\(event\)/);
  assert.match(app, /prepareWorkgroupActionEvent\(event\)/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /event\.stopPropagation\(\)/);
  assert.match(app, /event\.stopImmediatePropagation\(\)/);
  assert.match(app, /els\.runWorkgroupFull294\.addEventListener\("click", runWorkgroupFull294Action\)/);
  assert.doesNotMatch(app, /runWorkgroupFull294\.addEventListener\("click", \(\) => runWorkgroupExperimentAction/);
  assert.match(app, /coreVectorData: state\.coreVectorData/);
  assert.match(app, /workgroupPerformanceActionAvailable/);
  assert.match(app, /state\.activeWorkgroupActionRunId !== runId/);
  assert.match(app, /runWorkgroupSyntheticProfiling/);
  assert.match(app, /summarizeWorkgroupProfilingResult/);
  assert.match(app, /workgroupProfilingInvocationAccounting/);
  assert.match(app, /matchedWorkgroupComparisonPrerequisites/);
  assert.match(app, /matchedWorkgroupExecutionOrder/);
  assert.match(app, /validateMatchedWorkgroupProfileSample/);
  assert.match(app, /currentWorkgroupGpuResult/);
  assert.match(app, /WebGPU matched WG1 vs WG32 comparison/);
  assert.match(app, /matchedComparisonStatus/);
  assert.match(app, /recommendationBlockers/);
  assert.match(app, /WG1 current-session workgroup verification/);
  assert.match(app, /WG32 current-session workgroup verification/);
  assert.match(app, /Last executed matched sample/);
  assert.match(app, /WebGPU experimental workgroup-size-/);
  assert.equal(app.includes("logical / ${iteration.physicalSubmissionCount"), true);
  assert.match(app, /workgroupProfileHistoryBySize/);
  assert.match(app, /Cleared current-session WG/);
  assert.match(app, /Cleared current-session matched workgroup comparison/);
  assert.match(app, /profiling\.validProfilingRun/);
  assert.match(app, /performanceTested = profilingValid/);
  assert.match(app, /profiling execution did not start/);
  assert.doesNotMatch(app, /targetComparison: true|liveMining: true|SHA-256/);
});

test("guided workflow UI is default and advanced mode preserves diagnostics", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /Guided Browser Test Workflow/);
  assert.match(html, /id="guidedModeButton" class="active"/);
  assert.match(html, /id="advancedModeButton"/);
  assert.match(html, /data-test-type="correctness"/);
  assert.match(html, /data-test-type="synthetic"/);
  assert.match(html, /data-test-type="profiling"/);
  assert.match(html, /data-test-type="workgroup"/);
  assert.match(html, /data-test-type="matched"/);
  assert.match(html, /class="controls advanced-section"/);
  assert.match(html, /Raw result JSON|Last Workgroup Experiment Result/);
  assert.match(html, /Download matched comparison JSON/);
  assert.match(html, /Session History/);
  assert.match(app, /uiMode: sessionStorage\.getItem\("capsWebgpuUiMode"\) \|\| UI_MODES\.guided/);
  assert.match(app, /function renderWorkflowShell/);
  assert.match(app, /section\.hidden = guided/);
  assert.match(app, /advanced-section/);
  assert.match(app, /setUiMode\(UI_MODES\.guided\)/);
  assert.match(app, /setUiMode\(UI_MODES\.advanced\)/);
});

test("guided workgroup workflow orders prerequisites and keeps matched comparison manual", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /WGSL Workgroup Experiment/);
  assert.match(html, /Run recommended correctness sequence/);
  assert.match(html, /1\. Compile selected variant/);
  assert.match(html, /2\. Run small correctness gate/);
  assert.match(html, /3\. Run full 294-vector verification/);
  assert.match(html, /4\. Run performance profile/);
  assert.match(app, /Compile must precede the small correctness gate/);
  assert.match(app, /Small gate must pass before full 294 verification/);
  assert.match(app, /Full 294 is required before profiling/);
  assert.match(app, /runRecommendedCorrectnessSequence/);
  assert.match(app, /WORKGROUP_EXPERIMENT_ACTIONS\.compile[\s\S]*WORKGROUP_EXPERIMENT_ACTIONS\.smallGate[\s\S]*WORKGROUP_EXPERIMENT_ACTIONS\.full294/);
  assert.doesNotMatch(app.slice(app.indexOf("async function runRecommendedCorrectnessSequence"), app.indexOf("async function prepareMatchedWorkgroups")), /performanceProfile/);
});

test("guided matched workflow prepares WG1 and WG32 before manual comparison", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /Matched WG1 vs WG32 Comparison/);
  assert.match(html, /id="prepareMatchedWorkgroups"/);
  assert.match(html, /id="guidedRunMatchedComparison" type="button" disabled/);
  assert.match(html, /Repetitions per size/);
  assert.match(app, /workgroupRepetitions: 3/);
  assert.match(app, /matchedWorkgroupExecutionOrder\(\{ repetitions: state\.workgroupRepetitions \}\)/);
  assert.match(app, /for \(const size of \[1, 32\]\)/);
  assert.match(app, /WG1 and WG32 are ready for matched comparison/);
  assert.doesNotMatch(app.slice(app.indexOf("async function prepareMatchedWorkgroups"), app.indexOf("async function runWorkgroupExperimentAction")), /matchedComparison/);
});

test("guided summaries reset and matched table profiling status remain explicit", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /Compact Result Summary/);
  assert.match(html, /Reset current browser test session/);
  assert.match(html, /Switching Guided\/Advanced does not reset anything/);
  assert.match(app, /function compactResultSummary/);
  assert.match(app, /Matched WG1 vs WG32 comparison completed/);
  assert.match(app, /matched profile tested; \$\{validMatchedSamples\} valid samples/);
  assert.match(app, /standalone and matched profiling available/);
  assert.match(app, /resetCurrentBrowserTestSession/);
  assert.match(app, /UI mode and selected workflow preserved/);
  assert.match(app, /state\.selectedTestType/);
  assert.doesNotMatch(app, /targetComparison: true|liveMining: true|walletAddress|nativePerformance: true|SHA-256/);
});

test("workgroup full-294 button routing cannot fall through to start or small gate", () => {
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  const fullHandlerStart = app.indexOf("function runWorkgroupFull294Action(event)");
  const fullHandlerEnd = app.indexOf("function runWorkgroupPerformanceAction(event)");
  const fullHandler = app.slice(fullHandlerStart, fullHandlerEnd);
  assert.match(fullHandler, /prepareWorkgroupActionEvent\(event\)/);
  assert.match(fullHandler, /WORKGROUP_EXPERIMENT_ACTIONS\.full294/);
  assert.doesNotMatch(fullHandler, /runWorkgroupSmallGateAction|runWorkgroupExperimentMode|startBenchmark/);

  const bindStart = app.indexOf("els.start.addEventListener");
  const bindEnd = app.indexOf("els.stop.addEventListener");
  const startBinding = app.slice(bindStart, bindEnd);
  assert.match(startBinding, /startBenchmark/);
  assert.doesNotMatch(startBinding, /runWorkgroupFull294Action|runWorkgroupSmallGateAction/);
});

test("workgroup routing mismatch invalidates exported result instead of claiming a pass", () => {
  const requested = createWorkgroupActionTelemetry({
    requestedActionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
    runId: 3,
    timestamp: "2026-07-19T19:00:00.000Z",
  });
  const mismatchedTelemetry = completeWorkgroupActionTelemetry(requested, WORKGROUP_EXPERIMENT_ACTIONS.smallGate, {
    runId: 3,
    timestamp: "2026-07-19T19:00:01.000Z",
  });
  const exportObject = buildWorkgroupExperimentExport({
    actionResult: {
      actionType: WORKGROUP_EXPERIMENT_ACTIONS.full294,
      actionTelemetry: mismatchedTelemetry,
      workgroupSize: 32,
      compileGate: "compiled",
      deviceValidation: { valid: true },
      pipelineDiagnostics: { pipelineKey: "whirlpool-batched-wg32", thisRunPipelineCreationMs: 0 },
      smallGate: { status: "passed", passed: true, matches: 10, mismatches: 0 },
      full294: { status: "pending", passed: false, matches: null, mismatches: null },
    },
  });
  assert.equal(exportObject.actionTelemetry.actionRoutingConsistency, false);
  assert.equal(exportObject.correctness.actionRoutingConsistency, false);
  assert.equal(exportObject.boundaries.actionRoutingConsistency, false);
  assert.equal(exportObject.correctness.full294Status, "pending");
});

test("workgroup experiment export is bounded and not performance eligible before full verification", () => {
  const smallGateResult = {
    workgroupSize: 32,
    pipelineKey: "whirlpool-batched-wg32",
    compileGate: "compiled",
    deviceValidation: { valid: true, workgroupSize: 32 },
    pipelineDiagnostics: {
      pipelineKey: "whirlpool-batched-wg32",
      workgroupSize: 32,
      shaderCodeUnits: 13763,
      shaderUtf8Bytes: 13763,
      thisRunPipelineCreationMs: 12,
      deviceLimits: { maxComputeInvocationsPerWorkgroup: 256, maxComputeWorkgroupSizeX: 256 },
    },
    smallGate: { passed: true, matches: 10, mismatches: 0, firstMismatch: null },
  };
  const exportObject = buildWorkgroupExperimentExport({
    smallGateResult,
    capabilities: { adapterInfo: { vendor: "nvidia", architecture: "blackwell" } },
    userAgent: "UnitTest Browser 150",
    timestamp: "2026-07-19T15:00:00.000Z",
  });
  assert.equal(exportObject.configuration.workgroupSize, 32);
  assert.equal(exportObject.configuration.pipelineKey, "whirlpool-batched-wg32");
  assert.equal(exportObject.correctness.smallGateStatus, "passed");
  assert.equal(exportObject.correctness.full294Status, "pending");
  assert.equal(exportObject.correctness.performanceEligible, false);
  assert.equal(exportObject.boundaries.experimentalWorkgroupVariant, true);
  assert.equal(exportObject.boundaries.liveMining, false);
  assert.equal(exportObject.boundaries.targetComparison, false);
  assert.equal(exportObject.boundaries.fullCoreVerificationPassed, false);
  assert.doesNotMatch(serializeWorkgroupExperimentExport(exportObject), /walletAddress|privateKey|filesystem|profitability/i);
  assert.doesNotMatch(workgroupExperimentFilename(exportObject), /[\\/:*?"<>|]/);
});

test("workgroup performance comparison excludes unverified variants and requires repetitions", () => {
  const base = buildWorkgroupExperimentExport({
    smallGateResult: {
      workgroupSize: 64,
      compileGate: "compiled",
      deviceValidation: { valid: true },
      pipelineDiagnostics: { thisRunPipelineCreationMs: 0 },
      smallGate: { passed: true, matches: 10, mismatches: 0, firstMismatch: null },
    },
  });
  assert.equal(performanceComparisonCandidates([base]).length, 0);
  const eligible = {
    ...base,
    performanceEligible: true,
    correctness: {
      ...base.correctness,
      full294Status: "passed",
      syntheticProfilingStatus: "valid",
      mismatchCount: 0,
      pipelineError: null,
    },
    boundaries: {
      ...base.boundaries,
      outputReadback: true,
    },
  };
  assert.equal(performanceComparisonCandidates([eligible]).length, 1);
  assert.match(compareWorkgroupPerformance([eligible]).status, /At least three valid compatible repetitions/);
});

test("profiling history is bounded", () => {
  let history = [];
  for (let i = 0; i < MAX_PROFILING_HISTORY_ENTRIES + 5; i += 1) {
    const exportObject = buildProfilingExport({
      result: mockProfilingResult({ hostPhases: { totalBenchmarkElapsedMs: 100 + i } }),
      timestamp: `2026-07-18T13:01:${String(i).padStart(2, "0")}.000Z`,
    });
    history = addProfilingHistoryEntry(history, exportObject);
  }
  assert.equal(history.length, MAX_PROFILING_HISTORY_ENTRIES);
  assert.equal(history[0].totalElapsedMs, 124);
});

test("profiling UI and docs avoid unsupported performance claims", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  assert.match(html, /Synthetic profiling run/);
  assert.match(html, /Browser-observed timing only; no GPU hardware counters/);
  assert.match(html, /no-readback probe is profiling-only and is not a valid hash benchmark/i);
  assert.match(app, /output correctness not established by this run alone/);
  assert.doesNotMatch(html, /native CUDA performance|profitable miner|profitability estimate/i);
  assert.doesNotMatch(app, /targetComparison: true|liveMining: true|SHA-256/);
});

test("batched Whirlpool CPU rows preserve task order and metadata", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  const tasks = [0, 1, 2, 3].map((nonce) => ({
    header80: header,
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    nonceStart: 0,
    nonceCount: 4,
    nonce,
    caseKey: `${fixture.id}:0:4`,
  }));
  const rows = buildWhirlpoolBatchCpuRows(tasks);
  assert.deepEqual(rows.map((row) => row.index), [0, 1, 2, 3]);
  assert.deepEqual(rows.map((row) => row.nonce), [0, 1, 2, 3]);
  assert.equal(rows.every((row) => row.caseKey === "zero-header:0:4"), true);
  for (const row of rows) {
    const patched = Uint8Array.from(header);
    patchNonce(patched, row.nonce);
    assert.equal(row.cpuInternalHex, capstashPoWInternalHex(patched));
  }
});

test("minimal Whirlpool CPU reference rows patch nonce consistently", () => {
  const header = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);
  const rows = buildWhirlpoolCpuReferenceRows(header, 3, 4);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const patched = Uint8Array.from(header);
    patchNonce(patched, row.nonce);
    assert.equal(row.cpuInternalHex, capstashPoWInternalHex(patched));
    assert.equal(row.cpuInternalHex.length, 64);
  }
});

test("minimal Whirlpool result comparison reports matches and mismatches explicitly", () => {
  const cpuInternalHex = CAPSTASH_POW_TEST_VECTORS[1].internalFoldHex;
  const rows = compareWhirlpoolGpuRows([
    { nonce: 0, cpuInternalHex, gpuInternalHex: cpuInternalHex },
    { nonce: 1, cpuInternalHex, gpuInternalHex: "0".repeat(64) },
  ]);
  assert.equal(rows[0].match, true);
  assert.equal(rows[1].match, false);
});

test("minimal Whirlpool CPU checkpoints expose padding, constants, final digest, and fold", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "realistic-fields");
  const checkpoints = buildWhirlpool80CpuCheckpoints(fixtureHeaderBytes(fixture), fixture.nonceStart);
  assert.equal(checkpoints.firstBlockWords.length, 16);
  assert.equal(checkpoints.secondBlockWords.length, 16);
  assert.equal(checkpoints.secondBlockWords[4], 0x00000080);
  assert.equal(checkpoints.secondBlockWords[15], 0x80020000);
  assert.equal(checkpoints.initialStateWords64.every((word) => word === "0000000000000000"), true);
  assert.equal(checkpoints.roundConstants64Hex.length, 10);
  assert.equal(checkpoints.finalWhirlpool512Hex.length, 128);
  assert.equal(checkpoints.foldedInternalHex.length, 64);
});

test("minimal Whirlpool suite summary reports success, failure, and first mismatch details", () => {
  const okSummary = summarizeWhirlpoolFixtureResults([
    {
      executed: true,
      fixtureId: "zero-header",
      fixtureName: "All-zero header except nonce",
      nonceStart: 0,
      nonceCount: 2,
      resultCount: 2,
      dispatchCount: 2,
      readbackMs: 1,
      gpuElapsedMs: 2,
      bufferSetupMs: 3,
      cpuComparisonMs: 4,
      pipelineSetupMs: 10,
      verifiedHashesPerSecondExcludingPipeline: 200,
      verifiedHashesPerSecondIncludingPipeline: 100,
      pipelineReused: false,
      pipelineCacheStatus: "miss",
      totalElapsedMs: 20,
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
    {
      executed: false,
      fixtureId: "overflow-rejected",
      fixtureName: "Nonce overflow rejection case",
      nonceStart: 0xfffffff8,
      nonceCount: 16,
      rejectionReason: "nonce range overflows uint32",
      resultCount: 0,
      dispatchCount: 0,
      readbackMs: 0,
      gpuElapsedMs: 0,
      totalElapsedMs: 0,
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
  ]);
  assert.equal(okSummary.shaderStatus, "Real WebGPU Whirlpool hashing: Passed selected subset");
  assert.equal(okSummary.resultCount, 2);
  assert.equal(okSummary.fixtureCasesRejected, 1);
  assert.equal(okSummary.bufferSetupMs, 3);
  assert.equal(okSummary.gpuElapsedMs, 2);
  assert.equal(okSummary.readbackMs, 1);
  assert.equal(okSummary.cpuComparisonMs, 4);
  assert.equal(okSummary.pipelineSetupMs, 10);
  assert.equal(okSummary.hashWorkExcludingPipelineMs, 10);
  assert.equal(okSummary.verifiedHashesPerSecondExcludingPipeline, 200);
  assert.equal(okSummary.verifiedHashesPerSecondIncludingPipeline, 100);
  assert.equal(okSummary.pipelineReused, false);
  assert.equal(okSummary.pipelineCacheStatus, "miss");
  assert.equal(formatWhirlpoolFixtureFailure(okSummary), "None");

  const failSummary = summarizeWhirlpoolFixtureResults([
    {
      executed: true,
      fixtureId: "high-bit-bytes",
      fixtureName: "High-bit byte pattern",
      nonceStart: 0,
      nonceCount: 1,
      resultCount: 1,
      dispatchCount: 1,
      readbackMs: 1,
      gpuElapsedMs: 1,
      totalElapsedMs: 1,
      mismatchesAgainstCpuReference: 1,
      firstMismatch: { index: 0, nonce: 0, cpuInternalHex: "a", gpuInternalHex: "b" },
    },
  ]);
  assert.equal(failSummary.shaderStatus, "Real WebGPU Whirlpool hashing: Failed verification");
  assert.equal(failSummary.firstMismatch.fixtureId, "high-bit-bytes");
  assert.match(formatWhirlpoolFixtureFailure(failSummary), /gpuInternalHex/);
});

test("batched Whirlpool summary counts unique dispatches and keeps mismatch batch metadata", () => {
  const summary = summarizeWhirlpoolFixtureResults([
    {
      executed: true,
      fixtureId: "zero-header",
      fixtureName: "All-zero header except nonce",
      nonceStart: 0,
      nonceCount: 2,
      resultCount: 2,
      dispatchCount: 1,
      batchDispatchIndexes: [0],
      readbackMs: 1,
      gpuElapsedMs: 1,
      bufferSetupMs: 1,
      cpuComparisonMs: 1,
      pipelineSetupMs: 5,
      totalElapsedMs: 9,
      pipelineReused: false,
      pipelineCacheStatus: "miss",
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
    {
      executed: true,
      fixtureId: "incrementing-bytes",
      fixtureName: "Incrementing byte pattern",
      nonceStart: 0,
      nonceCount: 2,
      resultCount: 2,
      dispatchCount: 1,
      batchDispatchIndexes: [0, 1],
      readbackMs: 1,
      gpuElapsedMs: 1,
      bufferSetupMs: 1,
      cpuComparisonMs: 1,
      pipelineSetupMs: 0,
      totalElapsedMs: 4,
      pipelineReused: true,
      pipelineCacheStatus: "hit",
      mismatchesAgainstCpuReference: 1,
      firstMismatch: {
        index: 1,
        nonce: 1,
        batchSize: 2,
        dispatchIndex: 1,
        indexWithinDispatch: 0,
        cpuInternalHex: "a",
        gpuInternalHex: "b",
      },
    },
  ]);
  assert.equal(summary.dispatchCount, 2);
  assert.equal(summary.resultCount, 4);
  assert.equal(summary.resultsPerDispatch, 2);
  assert.equal(summary.firstMismatch.batchSize, 2);
  assert.equal(summary.firstMismatch.dispatchIndex, 1);
  assert.equal(summary.firstMismatch.indexWithinDispatch, 0);
});

test("minimal Whirlpool suite summary reports warm pipeline cache hits", () => {
  const summary = summarizeWhirlpoolFixtureResults([
    {
      executed: true,
      fixtureId: "zero-header",
      fixtureName: "All-zero header except nonce",
      nonceStart: 0,
      nonceCount: 1,
      resultCount: 1,
      dispatchCount: 1,
      bufferSetupMs: 1,
      gpuElapsedMs: 2,
      readbackMs: 3,
      cpuComparisonMs: 4,
      pipelineSetupMs: 0,
      totalElapsedMs: 10,
      pipelineReused: true,
      pipelineCacheStatus: "hit",
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
  ]);
  assert.equal(summary.pipelineReused, true);
  assert.equal(summary.pipelineCacheStatus, "hit");
  assert.equal(summary.pipelineSetupMs, 0);
  assert.equal(summary.hashWorkExcludingPipelineMs, 10);
  assert.equal(summary.verifiedHashesPerSecondExcludingPipeline, 100);
  assert.equal(summary.verifiedHashesPerSecondIncludingPipeline, 100);
});

test("minimal Whirlpool suite summary reports mixed pipeline cache status", () => {
  const summary = summarizeWhirlpoolFixtureResults([
    {
      executed: true,
      fixtureId: "zero-header",
      fixtureName: "All-zero header except nonce",
      nonceStart: 0,
      nonceCount: 1,
      resultCount: 1,
      dispatchCount: 1,
      bufferSetupMs: 1,
      gpuElapsedMs: 1,
      readbackMs: 1,
      cpuComparisonMs: 1,
      pipelineSetupMs: 30,
      totalElapsedMs: 34,
      pipelineReused: false,
      pipelineCacheStatus: "miss",
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
    {
      executed: true,
      fixtureId: "incrementing-bytes",
      fixtureName: "Incrementing byte pattern",
      nonceStart: 0,
      nonceCount: 1,
      resultCount: 1,
      dispatchCount: 1,
      bufferSetupMs: 1,
      gpuElapsedMs: 1,
      readbackMs: 1,
      cpuComparisonMs: 1,
      pipelineSetupMs: 0,
      totalElapsedMs: 4,
      pipelineReused: true,
      pipelineCacheStatus: "hit",
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
    },
  ]);
  assert.equal(summary.pipelineReused, false);
  assert.equal(summary.pipelineCacheStatus, "mixed");
  assert.equal(summary.pipelineSetupMs, 30);
});

test("minimal Whirlpool suite summary reports pipeline failure before dispatch", () => {
  const summary = summarizeWhirlpoolFixtureResults([
    {
      executed: false,
      failedBeforeDispatch: true,
      fixtureId: "zero-header",
      fixtureName: "All-zero header except nonce",
      nonceStart: 0,
      nonceCount: 1,
      resultCount: 0,
      dispatchCount: 0,
      readbackMs: 0,
      gpuElapsedMs: 0,
      totalElapsedMs: 0,
      mismatchesAgainstCpuReference: 0,
      firstMismatch: null,
      error: "createComputePipelineAsync timed out after 60000 ms",
      pipelineDiagnostics: {
        shaderUtf8Bytes: 123456,
        pipelineTimeoutMs: 60000,
        pipelineCreationMs: 60001,
        pipelineCreationCompleted: false,
      },
    },
  ]);
  assert.equal(summary.shaderStatus, "Real WebGPU Whirlpool hashing: Failed before dispatch");
  assert.equal(summary.wgslCoreStatus, "WGSL/Core verification: Failed before dispatch");
  assert.equal(summary.fixtureCasesFailedBeforeDispatch, 1);
  assert.match(summary.firstPipelineError.error, /timed out/);
  assert.equal(summary.pipelineDiagnostics.pipelineTimeoutMs, 60000);
});

test("CapStash Core vector JSON loads generated Core metadata and vectors", () => {
  const coreData = loadCoreVectorJson();
  const summary = summarizeCoreVectorData(coreData);
  assert.equal(summary.status, "generated");
  assert.equal(summary.pending, false);
  assert.equal(summary.vectorCount, 294);
  assert.equal(coreData.generator.capstashCoreRepoUrl, "https://github.com/CapStash/CapStash-Core");
  assert.equal(coreData.generator.capstashCoreBranch, "main");
  assert.equal(coreData.generator.capstashCoreCommit, "d5443789469376ca3cad2a892ab99978b88a4471");
  assert.match(coreData.generator.sourceNote, /CBlockHeader::GetPoWHash/);
  assert.deepEqual(coreData.limitations, []);
});

test("pending CapStash Core vectors do not claim consensus verification", () => {
  const result = compareCoreVectorsToCpu({
    schemaVersion: 1,
    status: "pending",
    generator: { sourceNote: "Pending manual generation" },
    limitations: ["No CapStash Core vectors have been generated."],
    vectors: [],
  });
  assert.equal(result.pending, true);
  assert.equal(result.vectorCount, 0);
  assert.equal(result.matches, 0);
  assert.deepEqual(result.mismatches, []);
  assert.equal(result.message, "CapStash Core vectors: pending");
});

test("generated Core vector comparison checks patched header, internal hash, and display hash", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, 7);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    generator: { capstashCoreCommit: "test-only" },
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 8,
        nonce: 7,
        patchedHeaderHex: bytesToHex(header),
        whirlpool512Hex: null,
        foldedInternalHex: capstashPoWInternalHex(header),
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const result = compareCoreVectorsToCpu(generated);
  assert.equal(result.pending, false);
  assert.equal(result.matches, 1);
  assert.deepEqual(result.mismatches, []);

  generated.vectors[0].foldedHashHex = "0".repeat(64);
  const mismatch = compareCoreVectorsToCpu(generated);
  assert.equal(mismatch.matches, 0);
  assert.equal(mismatch.mismatches.length, 1);
  assert.match(mismatch.mismatches[0].reason, /byte order|hash differs/i);
});

test("Core vector comparison rejects unsafe overflow fixture ranges", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "overflow-rejected");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, fixture.nonceStart);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: fixture.nonceStart,
        nonceCount: 16,
        nonce: fixture.nonceStart,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: capstashPoWInternalHex(header),
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const result = compareCoreVectorsToCpu(generated);
  assert.equal(result.matches, 0);
  assert.equal(result.mismatches.length, 1);
  assert.match(result.mismatches[0].reason, /not in the safe/);
});

test("WGSL suite comparison against Core vectors reports pending, unavailable, or exact GPU mismatches", () => {
  const pending = compareCoreVectorsToWgslSuite({
    schemaVersion: 1,
    status: "pending",
    vectors: [],
  }, null);
  assert.equal(pending.pending, true);

  const unavailable = compareCoreVectorsToWgslSuite(loadCoreVectorJson(), null);
  assert.equal(unavailable.pending, false);
  assert.equal(unavailable.matches, 0);
  assert.equal(unavailable.mismatches.length, 1);
  assert.match(unavailable.message, /unavailable/i);

  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, 0);
  const internal = capstashPoWInternalHex(header);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 1,
        nonce: 0,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: internal,
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const suite = {
    results: [
      {
        executed: true,
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: 0,
        nonceCount: 1,
        results: [{ nonce: 0, gpuInternalHex: internal, cpuInternalHex: internal }],
      },
    ],
  };
  const result = compareCoreVectorsToWgslSuite(generated, suite);
  assert.equal(result.matches, 1);
  assert.deepEqual(result.mismatches, []);
});

test("WGSL suite comparison can scope Core checks to the executed subset", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, 0);
  const internal = capstashPoWInternalHex(header);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 1,
        nonce: 0,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: internal,
        foldedHashHex: capstashPoWHashHex(header),
      },
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 2,
        nonce: 1,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: internal,
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const suite = {
    results: [
      {
        executed: true,
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: 0,
        nonceCount: 1,
        results: [{ nonce: 0, gpuInternalHex: internal, cpuInternalHex: internal }],
      },
    ],
  };
  const scoped = compareCoreVectorsToWgslSuite(generated, suite, { scope: "executed" });
  assert.equal(scoped.selectedVectorCount, 1);
  assert.equal(scoped.matches, 1);
  assert.equal(scoped.verificationStatus, "WGSL/Core verification: Passed selected subset");

  const all = compareCoreVectorsToWgslSuite(generated, suite);
  assert.equal(all.selectedVectorCount, 2);
  assert.equal(all.matches, 1);
  assert.equal(all.mismatches.length, 1);
  assert.equal(all.mismatches[0].patchedHeaderHex, bytesToHex(header));
  assert.equal(all.mismatches[0].coreFoldedHashHex, capstashPoWHashHex(header));
  assert.match(all.mismatches[0].byteOrderNote, /internal/i);
});

test("WGSL suite comparison uses explicit full-vector pending, pass, and fail labels", () => {
  const pending = compareCoreVectorsToWgslSuite(loadCoreVectorJson(), null, { fullVector: true });
  assert.equal(pending.verificationStatus, "WGSL/Core verification: Full-vector pending");

  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, 0);
  const internal = capstashPoWInternalHex(header);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    byteOrderNotes: {
      foldedInternalHex: "raw uint256 internal byte order",
    },
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 1,
        nonce: 0,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: internal,
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const suite = {
    results: [
      {
        executed: true,
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: 0,
        nonceCount: 1,
        results: [{ nonce: 0, gpuInternalHex: internal, cpuInternalHex: internal }],
      },
    ],
  };
  const pass = compareCoreVectorsToWgslSuite(generated, suite, { fullVector: true });
  assert.equal(pass.verificationStatus, "WGSL/Core verification: Full 294-vector pass");
  assert.equal(pass.matches, 1);

  const fail = compareCoreVectorsToWgslSuite(generated, {
    results: [
      {
        executed: true,
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: 0,
        nonceCount: 1,
        results: [{ nonce: 0, gpuInternalHex: "0".repeat(64), cpuInternalHex: internal }],
      },
    ],
  }, { fullVector: true });
  assert.equal(fail.verificationStatus, "WGSL/Core verification: Full-vector failed");
  assert.equal(fail.mismatches[0].vectorIndex, 0);
  assert.equal(fail.mismatches[0].selectedVectorIndex, 0);
  assert.equal(fail.mismatches[0].cpuFoldedHashHex, capstashPoWHashHex(header));
  assert.equal(fail.mismatches[0].cpuMatchesCore, true);
});

test("WGSL/Core hash mismatch output includes Core, CPU, WGSL, and byte-order details", () => {
  const fixture = WHIRLPOOL_HEADER_FIXTURES.find((entry) => entry.id === "zero-header");
  const header = fixtureHeaderBytes(fixture);
  patchNonce(header, 0);
  const internal = capstashPoWInternalHex(header);
  const generated = {
    schemaVersion: 1,
    status: "generated",
    byteOrderNotes: {
      foldedInternalHex: "raw uint256 internal byte order",
    },
    vectors: [
      {
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        headerHexBeforeNonce: fixture.headerHex,
        nonceStart: 0,
        nonceCount: 1,
        nonce: 0,
        patchedHeaderHex: bytesToHex(header),
        foldedInternalHex: internal,
        foldedHashHex: capstashPoWHashHex(header),
      },
    ],
  };
  const result = compareCoreVectorsToWgslSuite(generated, {
    results: [
      {
        executed: true,
        fixtureId: fixture.id,
        fixtureName: fixture.name,
        nonceStart: 0,
        nonceCount: 1,
        results: [{
          nonce: 0,
          gpuInternalHex: "0".repeat(64),
          cpuInternalHex: internal,
          batchSize: 4,
          dispatchIndex: 2,
          indexWithinDispatch: 1,
        }],
      },
    ],
  }, { scope: "executed" });
  assert.equal(result.verificationStatus, "WGSL/Core verification: Failed selected subset");
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].patchedHeaderHex, bytesToHex(header));
  assert.equal(result.mismatches[0].coreFoldedHashHex, capstashPoWHashHex(header));
  assert.equal(result.mismatches[0].coreFoldedInternalHex, internal);
  assert.equal(result.mismatches[0].cpuFoldedHashHex, capstashPoWHashHex(header));
  assert.equal(result.mismatches[0].cpuFoldedInternalHex, internal);
  assert.equal(result.mismatches[0].wgslFoldedInternalHex, "0".repeat(64));
  assert.equal(result.mismatches[0].batchSize, 4);
  assert.equal(result.mismatches[0].dispatchIndex, 2);
  assert.equal(result.mismatches[0].indexWithinDispatch, 1);
  assert.equal(result.mismatches[0].cpuMatchesCore, true);
  assert.match(result.mismatches[0].byteOrderNote, /uint256 internal/);
});

test("WGSL suite comparison refuses to claim verification after pipeline failure", () => {
  const failed = compareCoreVectorsToWgslSuite(loadCoreVectorJson(), {
    fixtureCasesFailedBeforeDispatch: 1,
    firstPipelineError: {
      error: "createComputePipelineAsync timed out after 60000 ms",
    },
    results: [],
  }, { scope: "executed" });
  assert.equal(failed.verificationStatus, "WGSL/Core verification: Failed before dispatch");
  assert.equal(failed.matches, 0);
  assert.equal(failed.mismatches.length, 1);
});

test("Core PoW generator embeds the current Milestone 6 fixtures and avoids SHA-256 language", () => {
  const generator = readFileSync(new URL("../scripts/core_pow_vector_generator.cpp", import.meta.url), "utf8");
  for (const fixture of WHIRLPOOL_HEADER_FIXTURES) {
    assert.match(generator, new RegExp(fixture.id));
    assert.match(generator, new RegExp(fixture.headerHex));
  }
  assert.match(generator, /GetPoWHash/);
  assert.match(generator, /No SHA-256/);
  assert.doesNotMatch(generator, /CSHA256|CHash256|SerializeHash|HashWriter/);
});

test("WebMCP challenge tools expose three narrow user-goal schemas", async () => {
  const calls = [];
  const tools = createWebMCPChallengeTools({
    inspectComputeEnvironment: () => ({ inspected: true }),
    verifyCorrectness: ({ verificationLevel }) => {
      calls.push(verificationLevel);
      return { verificationLevel };
    },
    getExperimentStatus: () => ({ running: false }),
  });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "inspect_compute_environment",
    "verify_correctness",
    "get_experiment_status",
  ]);
  assert.deepEqual(tools[0].inputSchema, WEBMCP_TOOL_SCHEMAS.inspectComputeEnvironment);
  assert.deepEqual(tools[1].inputSchema.properties.verification_level.enum, ["minimal", "full_294"]);
  assert.deepEqual(tools[1].inputSchema.required, ["verification_level"]);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[1].annotations.readOnlyHint, false);
  assert.deepEqual(await tools[0].execute({}), { inspected: true });
  assert.deepEqual(await tools[1].execute({ verification_level: "full_294" }), { verificationLevel: "full_294" });
  assert.deepEqual(await tools[2].execute({}), { running: false });
  assert.deepEqual(calls, ["full_294"]);
  assert.throws(() => tools[1].execute({ verification_level: "profiling" }), /Unsupported verification_level/);
});

test("WebMCP registration is optional and cleans up a partial registration failure", async () => {
  const handlers = {
    inspectComputeEnvironment: () => ({}),
    verifyCorrectness: () => ({}),
    getExperimentStatus: () => ({}),
  };
  const unavailable = await registerWebMCPChallengeTools({ modelContext: null, handlers });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.status, "unavailable");

  const registered = [];
  const available = await registerWebMCPChallengeTools({
    modelContext: {
      async registerTool(tool, options) {
        assert.equal(options.signal.aborted, false);
        registered.push(tool.name);
      },
    },
    handlers,
  });
  assert.equal(available.status, "registered");
  assert.deepEqual(registered, ["inspect_compute_environment", "verify_correctness", "get_experiment_status"]);

  let firstSignal;
  let registrationAttempts = 0;
  const failed = await registerWebMCPChallengeTools({
    modelContext: {
      async registerTool(_tool, options) {
        firstSignal ||= options.signal;
        registrationAttempts += 1;
        if (registrationAttempts === 2) throw new Error("registration denied");
      },
    },
    handlers,
  });
  assert.equal(failed.status, "registration_failed");
  assert.equal(registrationAttempts, 2);
  assert.equal(firstSignal.aborted, true);
});

test("WebMCP environment and status inspection never imply background computation", () => {
  const environment = buildComputeEnvironmentResult({
    capabilities: {
      supported: true,
      adapterAvailable: true,
      adapterInfo: { vendor: "test-vendor" },
      limits: { maxComputeInvocationsPerWorkgroup: 256 },
      features: ["timestamp-query"],
      error: null,
    },
    userAgent: "UnitTest Browser",
    verificationPresets: WGSL_CORE_VERIFICATION_PRESETS,
    batchSizes: WGSL_BATCH_SIZE_OPTIONS,
    workgroupSizes: WORKGROUP_SIZE_OPTIONS,
    running: false,
    currentExperiment: null,
  });
  assert.equal(environment.webgpu.supported, true);
  assert.equal(environment.experiment.running, false);
  assert.equal(environment.boundaries.automaticOrBackgroundComputation, false);
  assert.deepEqual(environment.supportedExperiments.correctnessVerification.workgroupSizes, WORKGROUP_SIZE_OPTIONS);
  const status = buildExperimentStatusResult({
    running: false,
    current: null,
    mostRecent: { type: "correctness_verification", status: "completed" },
    verificationResult: { success: true },
  });
  assert.equal(status.mostRecent.status, "completed");
  assert.equal(status.correctnessVerification.success, true);
});

test("WebMCP correctness result accepts only complete Core-identical verification", () => {
  const experiment = {
    status: "completed",
    source: "webmcp",
    startedAt: "2026-08-29T12:00:00.000Z",
    completedAt: "2026-08-29T12:00:01.000Z",
  };
  const result = {
    shaderStatus: "Full 294-vector WGSL/Core verification passed",
    resultCount: 294,
    dispatchCount: 294,
    batchSize: 1,
    workgroupSize: 1,
    fixtureCasesExecuted: 294,
    fixtureCasesRejected: 1,
    mismatchesAgainstCpuReference: 0,
    firstPipelineError: null,
  };
  const passed = buildVerificationResult({
    verificationLevel: WEBMCP_VERIFICATION_LEVELS.full294,
    preset: FULL_CORE_VECTOR_VERIFICATION_PRESET,
    experiment,
    result,
    coreComparison: {
      pending: false,
      selectedVectorCount: 294,
      matches: 294,
      mismatches: [],
    },
  });
  assert.equal(passed.success, true);
  assert.equal(passed.selectedVectors, 294);
  assert.equal(passed.matches, 294);
  assert.equal(passed.mismatches.total, 0);
  assert.equal(passed.boundaries.liveMining, false);

  const rejected = buildVerificationResult({
    verificationLevel: WEBMCP_VERIFICATION_LEVELS.full294,
    preset: FULL_CORE_VECTOR_VERIFICATION_PRESET,
    experiment,
    result: { ...result, resultCount: 293 },
    coreComparison: {
      pending: false,
      selectedVectorCount: 293,
      matches: 293,
      mismatches: [],
    },
  });
  assert.equal(rejected.success, false);
  assert.ok(rejected.failures.some((failure) => failure.code === "full_vector_count_invalid"));
});

test("WebMCP app adapter reuses the visible minimal Whirlpool workflow", () => {
  const app = readFileSync(new URL("../src/ui/app.js", import.meta.url), "utf8");
  const integration = readFileSync(new URL("../src/webmcp/challenge-tools.js", import.meta.url), "utf8");
  assert.match(app, /registerWebMCPChallengeTools/);
  assert.match(app, /await runWhirlpoolMinimalProof\(\{ invocationSource: "webmcp" \}\)/);
  assert.match(app, /runWebGPUWhirlpoolFixtureSuite/);
  assert.match(app, /renderBenchmark\(\)/);
  assert.doesNotMatch(integration, /navigator\.gpu|requestAdapter|runWebGPUWhirlpoolFixtureSuite|createComputePipeline/);
});
