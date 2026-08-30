import {
  DURATION_MODES,
  EXECUTION_MODES,
  benchmarkSnapshot,
  canRunHashBenchmark,
  createBenchmarkState,
  resetBenchmarkState,
  runBenchmarkSlice,
} from "../benchmark/benchmark-engine.js";
import { runCorrectnessTests } from "../cpu/correctness.js";
import { hexToBytes } from "../cpu/capstash-pow.js";
import { CAPSTASH_POW_TEST_VECTORS } from "../vectors/consensus-vectors.js";
import {
  compareCoreVectorsToCpu,
  compareCoreVectorsToWgslSuite,
  summarizeCoreVectorData,
} from "../vectors/core-vector-compare.js";
import { detectWebGPUCapabilities, formatAdapterName } from "../webgpu/capabilities.js";
import { runWebGPUPlumbingProof } from "../webgpu/plumbing-proof.js";
import { formatPipelineTimingView } from "./pipeline-timing.js";
import {
  DEFAULT_WGSL_BATCH_SIZE,
  DEFAULT_WGSL_CORE_VERIFICATION_SUBSET,
  WGSL_BATCH_SIZE_OPTIONS,
  WGSL_CORE_VERIFICATION_PRESETS,
  runWebGPUWhirlpoolFixtureSuite,
  verificationPresetById,
} from "../webgpu/whirlpool-fixture-suite.js";
import {
  DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE,
  DEFAULT_SYNTHETIC_HASH_COUNT,
  SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS,
  SYNTHETIC_HASH_COUNT_OPTIONS,
  addSyntheticHistoryEntry,
  buildSyntheticRepeatedRunSummary,
  buildSyntheticBenchmarkExport,
  clearSyntheticHistory,
  runSyntheticNonceBenchmark,
  serializeSyntheticRepeatedRunSummary,
  serializeSyntheticBenchmarkExport,
  syntheticRepeatedRunSummaryFilename,
  syntheticBenchmarkExportFilename,
  syntheticFixture,
  variationLabel,
} from "../webgpu/synthetic-benchmark.js";
import {
  DEFAULT_PROFILING_PRESET,
  DEFAULT_PROFILING_READBACK_STRATEGY,
  DEFAULT_PROFILING_REPETITIONS,
  PROFILING_PRESETS,
  PROFILING_READBACK_STRATEGIES,
  PROFILING_REPETITION_OPTIONS,
  addProfilingHistoryEntry,
  buildProfilingExport,
  buildProfilingSummaryExport,
  compareProfilingStrategyExports,
  profilingExportFilename,
  profilingPresetById,
  profilingSummaryFilename,
  runSyntheticProfiling,
  serializeProfilingExport,
} from "../webgpu/synthetic-profiling.js";
import {
  DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  WORKGROUP_EXPERIMENT_ACTIONS,
  WORKGROUP_EXPERIMENT_ACTION_LABELS,
  WORKGROUP_EXPERIMENT_REPETITION_OPTIONS,
  WORKGROUP_SIZE_OPTIONS,
  buildMatchedWorkgroupComparison,
  buildWorkgroupExperimentExport,
  completeWorkgroupActionTelemetry,
  createWorkgroupStatusMap,
  createWorkgroupActionTelemetry,
  matchedWorkgroupComparisonFilename,
  matchedWorkgroupComparisonPrerequisites,
  matchedWorkgroupExecutionOrder,
  normalizeWorkgroupExperimentAction,
  runWorkgroupCompileGate,
  runWorkgroupFullVerification,
  runWorkgroupSmallGate,
  runWorkgroupSyntheticProfiling,
  serializeMatchedWorkgroupComparison,
  serializeWorkgroupExperimentExport,
  validateMatchedWorkgroupProfileSample,
  whirlpoolPipelineKey,
  workgroupDeviceSupportRows,
  workgroupExperimentFilename,
  workgroupExperimentInvocationAccounting,
  workgroupProfilingInvocationAccounting,
  workgroupPerformanceActionAvailable,
  workgroupPerformanceEligible,
  summarizeWorkgroupProfilingResult,
} from "../webgpu/workgroup-experiment.js";

const PROJECT_VERSION = "0.1.0";
const UI_MODES = Object.freeze({ guided: "guided", advanced: "advanced" });
const TEST_TYPES = Object.freeze({
  correctness: "correctness",
  synthetic: "synthetic",
  profiling: "profiling",
  workgroup: "workgroup",
  matched: "matched",
});

const els = {};
const state = {
  durationMode: "10s",
  executionMode: "cpu-js",
  uiMode: sessionStorage.getItem("capsWebgpuUiMode") || UI_MODES.guided,
  selectedTestType: sessionStorage.getItem("capsWebgpuTestType") || TEST_TYPES.correctness,
  guidedProgress: "Not running.",
  matchedProgress: "Not running.",
  wgslPresetId: DEFAULT_WGSL_CORE_VERIFICATION_SUBSET.id,
  wgslBatchSize: DEFAULT_WGSL_BATCH_SIZE,
  syntheticHashCount: DEFAULT_SYNTHETIC_HASH_COUNT,
  syntheticDispatchBatchSize: DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE,
  correctness: null,
  capabilities: null,
  benchmark: createBenchmarkState(),
  plumbingResult: null,
  whirlpoolResult: null,
  whirlpoolProgress: null,
  syntheticResult: null,
  syntheticProgress: null,
  syntheticExport: null,
  syntheticHistory: [],
  syntheticRunExports: [],
  syntheticRepeatedSummary: null,
  profilingPresetId: DEFAULT_PROFILING_PRESET.id,
  profilingReadbackStrategyId: DEFAULT_PROFILING_READBACK_STRATEGY,
  profilingRepetitions: DEFAULT_PROFILING_REPETITIONS,
  profilingResult: null,
  profilingProgress: null,
  profilingExport: null,
  profilingSummaryExport: null,
  profilingRunExports: [],
  profilingHistory: [],
  workgroupSize: DEFAULT_EXPERIMENT_WORKGROUP_SIZE,
  workgroupRepetitions: 3,
  workgroupStatuses: createWorkgroupStatusMap(),
  workgroupResult: null,
  workgroupExport: null,
  workgroupActionRunId: 0,
  activeWorkgroupActionRunId: null,
  workgroupCurrentAction: null,
  workgroupLastCompletedAction: null,
  workgroupProfileHistoryBySize: Object.fromEntries(WORKGROUP_SIZE_OPTIONS.map((size) => [size, []])),
  workgroupMatchedComparison: null,
  workgroupMatchedComparisonExport: null,
  coreVectorData: null,
  coreVectorSummary: null,
  coreCpuComparison: null,
  coreWgslComparison: null,
  animationFrame: 0,
};

function formatRate(hashPerSecond) {
  if (!Number.isFinite(hashPerSecond)) return "Not available";
  const units = ["H/s", "kH/s", "MH/s", "GH/s"];
  let value = hashPerSecond;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatNumberSafe(value, fallback = "Not available") {
  return Number.isFinite(value) ? value.toLocaleString() : fallback;
}

function formatIntegerSafe(value, fallback = "Not available") {
  return Number.isFinite(value) ? Math.trunc(value).toLocaleString() : fallback;
}

function formatPercentSafe(value, fallback = "Not available") {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : fallback;
}

function formatMillisecondsSafe(value, fallback = "Not available") {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : fallback;
}

function formatRateSafe(value, fallback = "Not available") {
  return Number.isFinite(value) ? formatRate(value) : fallback;
}

function formatDuration(ms) {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : "0.00 s";
}

function setStatus(text, kind = "neutral") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function renderCorrectness() {
  els.correctness.textContent = state.correctness.pass ? "Passed" : "Failed";
  els.correctness.dataset.kind = state.correctness.pass ? "good" : "bad";
  els.testList.innerHTML = "";
  for (const result of state.correctness.results) {
    const item = document.createElement("li");
    item.className = result.pass ? "pass" : "fail";
    item.textContent = `${result.pass ? "PASS" : "FAIL"} ${result.name}`;
    item.title = `Expected ${result.expected}\nActual ${result.actual}`;
    els.testList.append(item);
  }
}

function renderCapabilities() {
  const caps = state.capabilities;
  els.webgpu.textContent = caps.supported ? "Yes" : "No";
  els.webgpu.dataset.kind = caps.supported ? "good" : "bad";
  els.gpu.textContent = formatAdapterName(caps);
  els.vendor.textContent = caps.adapterInfo?.vendor || "Unavailable";
  els.browser.textContent = navigator.userAgent;
  els.limits.textContent = caps.limits ? JSON.stringify(caps.limits, null, 2) : caps.error || "Unavailable";
}

function formatMaybeMs(ms) {
  return Number.isFinite(ms) ? formatMillisecondsSafe(ms) : "Not run";
}

function formatShaderSize(diagnostics) {
  if (!diagnostics?.shaderUtf8Bytes) return "Not run";
  return `${diagnostics.shaderUtf8Bytes.toLocaleString()} bytes / ${diagnostics.shaderCodeUnits.toLocaleString()} code units`;
}

function formatVerificationRate(value) {
  return value > 0 ? formatRate(value) : "Not run";
}

function formatStats(stats, formatter = (value) => String(value)) {
  if (!stats || stats.count === 0) return "No compatible valid runs";
  const cv = Number.isFinite(stats.sampleCoefficientOfVariation)
    ? `${(stats.sampleCoefficientOfVariation * 100).toFixed(2)}% CV`
    : "CV unavailable";
  return `n=${stats.count}; mean ${formatter(stats.mean)}, median ${formatter(stats.median)}, min ${formatter(stats.minimum)}, max ${formatter(stats.maximum)}, sd ${formatter(stats.sampleStandardDeviation)}, ${cv}`;
}

function profilingSetupSummary(summary) {
  const first = summary?.iterations?.[0];
  if (!summary || !first) return null;
  if (!first.outputReadback) {
    return `Profiling-only dispatch probe; ${first.resultCount.toLocaleString()} WGSL invocations submitted; output results not read back.`;
  }
  if (summary.configuration.readbackStrategy === "multi-dispatch-single-readback" && summary.runCount > 1) {
    return `Profiling total ${formatMaybeMs(summary.statistics.totalElapsedMs.mean)} mean across ${summary.runCount} repetitions; ${summary.configuration.hashCount.toLocaleString()} hashes per repetition; correctness gate and CPU spot checks passed.`;
  }
  return `Profiling total ${formatMaybeMs(first.hostPhases.totalBenchmarkElapsedMs)}; correctness gate ${summary.correctness.correctnessGateStatus}; ${first.resultCount.toLocaleString()} hashes completed; CPU spot checks ${first.cpuSpotChecked ? "passed" : "not run"}.`;
}

function currentWorkgroupGpuResult() {
  const profiling = state.workgroupResult?.profiling;
  const matchedSample = state.workgroupResult?.lastMatchedSample || null;
  const iteration = profiling?.firstIteration || matchedSample?.iteration || null;
  if (!iteration) return null;
  return {
    ...iteration,
    nonceCount: iteration.totalRequested,
    resultCount: iteration.resultCount,
    returnedResultCount: iteration.returnedResultCount,
    dispatchCountLabel: `${iteration.logicalDispatchCount?.toLocaleString() || 0} logical / ${iteration.physicalSubmissionCount?.toLocaleString() || 0} submission`,
    readbackMs: iteration.hostPhases?.readbackMs ?? iteration.readbackMs ?? 0,
    totalElapsedMs: iteration.hostPhases?.totalBenchmarkElapsedMs ?? iteration.totalElapsedMs ?? 0,
    scalarSummarySource: matchedSample
      ? `Last executed matched sample: WG${matchedSample.workgroupSize}, ${matchedSample.requestedPipelineKey}, repetition ${matchedSample.repetitionIndex}, order ${matchedSample.executionOrderIndex + 1}`
      : "single workgroup profiling result",
  };
}

function workgroupDisplayAccounting(plannedAccounting) {
  const matchedAccounting = state.workgroupResult?.matchedComparison?.executedInvocationAccounting;
  if (matchedAccounting?.wg1?.aggregate && matchedAccounting?.wg32?.aggregate) {
    const wg1 = matchedAccounting.wg1.aggregate;
    const wg32 = matchedAccounting.wg32.aggregate;
    return {
      workgroupsPerLogicalDispatchLabel: `WG1 ${formatIntegerSafe(wg1.workgroupsPerLogicalDispatch)} / WG32 ${formatIntegerSafe(wg32.workgroupsPerLogicalDispatch)}`,
      activeInvocationsLabel: `${formatIntegerSafe((wg1.activeInvocations || 0) + (wg32.activeInvocations || 0))} active`,
      paddedInvocationsLabel: `${formatIntegerSafe((wg1.paddedInvocations || 0) + (wg32.paddedInvocations || 0))} padded`,
      accountingScope: "matched WG1/WG32 executed accounting",
    };
  }
  const executedAccounting = state.workgroupResult?.executedInvocationAccounting || null;
  const displayAccounting = executedAccounting?.activeInvocations !== undefined ? executedAccounting : plannedAccounting;
  return {
    workgroupsPerLogicalDispatchLabel: formatIntegerSafe(displayAccounting?.workgroupsPerLogicalDispatch),
    activeInvocationsLabel: `${formatIntegerSafe(displayAccounting?.activeInvocations)} active`,
    paddedInvocationsLabel: `${formatIntegerSafe(displayAccounting?.paddedInactiveInvocations)} padded`,
    accountingScope: displayAccounting?.accountingScope || "planned synthetic profiling",
  };
}

function workgroupStatus(size = state.workgroupSize) {
  return state.workgroupStatuses[size] || {};
}

function workgroupStepState(size = state.workgroupSize) {
  const status = workgroupStatus(size);
  return {
    compiled: status.pipeline === "compiled",
    smallGate: status.smallGate === "passed",
    full294: status.full294 === "passed" && status.currentSessionFull294Passed === true,
    profile: status.profiling === "valid" || (state.workgroupProfileHistoryBySize[size] || []).some((sample) => sample.valid),
  };
}

function matchedPrerequisitesReady() {
  const prereqs = matchedWorkgroupComparisonPrerequisites({
    statuses: state.workgroupStatuses,
    repetitions: state.workgroupRepetitions,
    deviceLimits: state.capabilities?.limits || {},
  });
  return prereqs.available;
}

function setUiMode(mode) {
  state.uiMode = mode === UI_MODES.advanced ? UI_MODES.advanced : UI_MODES.guided;
  sessionStorage.setItem("capsWebgpuUiMode", state.uiMode);
  renderBenchmark();
}

function setTestType(type) {
  state.selectedTestType = Object.values(TEST_TYPES).includes(type) ? type : TEST_TYPES.correctness;
  sessionStorage.setItem("capsWebgpuTestType", state.selectedTestType);
  const modeByType = {
    [TEST_TYPES.correctness]: "webgpu-whirlpool-minimal",
    [TEST_TYPES.synthetic]: "webgpu-synthetic-nonce-benchmark",
    [TEST_TYPES.profiling]: "webgpu-synthetic-profiling",
    [TEST_TYPES.workgroup]: "webgpu-workgroup-experiment",
    [TEST_TYPES.matched]: "webgpu-workgroup-experiment",
  };
  state.executionMode = modeByType[state.selectedTestType] || state.executionMode;
  state.benchmark.executionMode = state.executionMode;
  document.querySelectorAll("[data-execution-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.executionMode === state.executionMode);
  });
  renderBenchmark();
}

function resetCurrentBrowserTestSession() {
  state.benchmark = createBenchmarkState();
  state.plumbingResult = null;
  state.whirlpoolResult = null;
  state.whirlpoolProgress = null;
  state.syntheticResult = null;
  state.syntheticProgress = null;
  state.syntheticExport = null;
  state.syntheticHistory = [];
  state.syntheticRunExports = [];
  state.syntheticRepeatedSummary = null;
  state.profilingResult = null;
  state.profilingProgress = null;
  state.profilingExport = null;
  state.profilingSummaryExport = null;
  state.profilingRunExports = [];
  state.profilingHistory = [];
  state.workgroupStatuses = createWorkgroupStatusMap();
  state.workgroupResult = null;
  state.workgroupExport = null;
  state.workgroupCurrentAction = null;
  state.workgroupLastCompletedAction = null;
  state.workgroupProfileHistoryBySize = Object.fromEntries(WORKGROUP_SIZE_OPTIONS.map((size) => [size, []]));
  state.workgroupMatchedComparison = null;
  state.workgroupMatchedComparisonExport = null;
  state.coreWgslComparison = null;
  state.guidedProgress = "Not running.";
  state.matchedProgress = "Not running.";
  renderBenchmark();
  setStatus("Current browser test session reset; UI mode and selected workflow preserved", "neutral");
}

function statusLabel(passed, failed = false) {
  if (passed) return "passed";
  if (failed) return "failed";
  return "pending";
}

function checklistItem(label, stateName) {
  const item = document.createElement("li");
  item.className = stateName;
  item.textContent = `${stateName === "passed" ? "[x]" : "[ ]"} ${label}: ${stateName}`;
  return item;
}

function renderChecklist(list, items) {
  list.innerHTML = "";
  for (const item of items) {
    list.append(checklistItem(item.label, item.state));
  }
}

function recommendedNextAction() {
  if (state.selectedTestType === TEST_TYPES.matched) {
    return matchedPrerequisitesReady()
      ? { label: "Run matched WG1-vs-WG32 comparison", reason: "Both sizes have current-session correctness prerequisites.", action: "run-matched" }
      : { label: "Prepare WG1 and WG32", reason: "Both sizes must pass compile, small gate, and full 294 before the matched comparison.", action: "prepare-both" };
  }
  if (state.selectedTestType === TEST_TYPES.workgroup) {
    const steps = workgroupStepState(state.workgroupSize);
    if (!steps.compiled) return { label: `Compile WG${state.workgroupSize}`, reason: "Compile must precede the small correctness gate.", action: "compile" };
    if (!steps.smallGate) return { label: `Run WG${state.workgroupSize} small correctness gate`, reason: "Small gate must pass before full 294 verification.", action: "small" };
    if (!steps.full294) return { label: `Run WG${state.workgroupSize} full 294-vector verification`, reason: "Full 294 is required before profiling.", action: "full294" };
    return { label: `Run WG${state.workgroupSize} performance profile`, reason: "Correctness prerequisites are satisfied for this selected size.", action: "profile" };
  }
  if (state.selectedTestType === TEST_TYPES.synthetic) {
    return { label: "Start synthetic benchmark", reason: "Runs a controlled local nonce batch with result readback and CPU spot checks.", action: "start" };
  }
  if (state.selectedTestType === TEST_TYPES.profiling) {
    return { label: "Start synthetic profiling run", reason: "Profiles browser-observed host-side phases for the verified synthetic path.", action: "start" };
  }
  return { label: "Start correctness verification", reason: "Runs the selected Minimal/Core WGSL verification preset.", action: "start" };
}

function compactResultSummary() {
  if (state.workgroupMatchedComparison) {
    const comparison = state.workgroupMatchedComparison;
    return [
      "Matched WG1 vs WG32 comparison completed",
      "",
      `WG1 valid samples: ${formatIntegerSafe(comparison.summary?.wg1ValidSamples)} / ${formatIntegerSafe(state.workgroupRepetitions)}`,
      `WG32 valid samples: ${formatIntegerSafe(comparison.summary?.wg32ValidSamples)} / ${formatIntegerSafe(state.workgroupRepetitions)}`,
      `Total valid samples: ${formatIntegerSafe(comparison.summary?.totalValidSamples)}`,
      `Mismatches: ${formatIntegerSafe(comparison.summary?.mismatchesAcrossAllSamples)}`,
      `Comparison validity: ${comparison.summary?.comparisonValidity || "Not available"}`,
      `Recommendation: ${comparison.summary?.recommendationEligibility || "Not available"}`,
      `Reason: ${comparison.interpretation?.message || "Not available"}`,
    ].join("\n");
  }
  if (state.workgroupResult?.profiling?.validProfilingRun) {
    const profile = state.workgroupResult.profiling;
    return [
      `WG${profile.workgroupSize} profile completed`,
      "",
      "Correctness: passed",
      `Hashes returned: ${formatIntegerSafe(profile.returnedResultCount)}`,
      `Mismatches: ${formatIntegerSafe(profile.mismatchCount)}`,
      `Logical dispatches: ${formatIntegerSafe(profile.logicalDispatchCount)}`,
      `Submissions: ${formatIntegerSafe(profile.physicalSubmissionCount)}`,
      `Queue waits: ${formatIntegerSafe(profile.queueWaitCount)}`,
      `Readbacks: ${formatIntegerSafe(profile.readbackCount)}`,
      `Total elapsed: ${formatMillisecondsSafe(profile.totalElapsedMs)}`,
      `Throughput: ${formatRateSafe(profile.hashesPerSecondIncludingPipeline)}`,
    ].join("\n");
  }
  if (state.syntheticResult?.valid) {
    return `Synthetic benchmark completed\n\nCorrectness: passed\nHashes returned: ${formatIntegerSafe(state.syntheticResult.returnedResultCount ?? state.syntheticResult.resultCount)}\nMismatches: ${formatIntegerSafe(state.syntheticResult.mismatchesAgainstCpuReference)}\nThroughput: ${formatRateSafe(state.syntheticResult.verifiedHashesPerSecondIncludingPipeline)}`;
  }
  if (state.whirlpoolResult?.resultCount > 0) {
    return `Correctness verification completed\n\nResults returned: ${formatIntegerSafe(state.whirlpoolResult.resultCount)}\nMismatches: ${formatIntegerSafe(state.whirlpoolResult.mismatchesAgainstCpuReference)}\nStatus: ${state.whirlpoolResult.wgslCoreStatus || state.whirlpoolResult.shaderStatus}`;
  }
  return "No guided action has completed yet.";
}

function renderWorkflowShell() {
  const guided = state.uiMode === UI_MODES.guided;
  document.body.dataset.uiMode = state.uiMode;
  els.guidedModeButton.classList.toggle("active", guided);
  els.advancedModeButton.classList.toggle("active", !guided);
  document.querySelectorAll("[data-test-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.testType === state.selectedTestType);
  });
  document.querySelectorAll("[data-test-panel]").forEach((panel) => {
    const scopes = (panel.dataset.testPanel || "").split(/\s+/);
    panel.hidden = guided && !scopes.includes(state.selectedTestType);
  });
  document.querySelectorAll(".advanced-section").forEach((section) => {
    section.hidden = guided;
  });
  const next = recommendedNextAction();
  els.recommendedNextAction.textContent = next.label;
  els.recommendedNextReason.textContent = next.reason;
  els.compactResultSummary.textContent = compactResultSummary();
  els.runRecommendedAction.disabled = Boolean(state.activeWorkgroupActionRunId || state.benchmark.running);
}

function firstPipelineDiagnostics() {
  return state.syntheticResult?.pipelineDiagnostics
    || state.workgroupResult?.profiling?.firstIteration?.pipelineDiagnostics
    || state.workgroupResult?.lastMatchedSample?.iteration?.pipelineDiagnostics
    || state.whirlpoolResult?.pipelineDiagnostics
    || state.whirlpoolResult?.firstPipelineError?.pipelineDiagnostics
    || null;
}

function selectedWgslPreset() {
  return verificationPresetById(state.wgslPresetId);
}

function wgslPresetWarning(preset = selectedWgslPreset()) {
  const verifiedBatchSizes = new Set([2, 4, 8, 16, 32, 64]);
  const path = state.wgslBatchSize === 1
    ? "Batch size 1 uses the known-good WGSL single-dispatch-per-hash path."
    : verifiedBatchSizes.has(state.wgslBatchSize)
    ? `Batch size ${state.wgslBatchSize} uses the recorded full-vector WGSL/Core batched path.`
    : `Batch size ${state.wgslBatchSize} uses the optional WGSL batched dispatch path; no full-vector verification record is documented for this batch size.`;
  const scope = "This selector is used by Minimal/Core WGSL verification mode only; explicit workgroup experiment buttons ignore it and run their own selected-size actions.";
  return preset.fullVector
    ? `${scope} Selecting Full 294 here does not change a workgroup experiment button action. Full 294-vector WGSL/Core verification may take longer than subset checks. This is a correctness test, not a mining benchmark. ${path}`
    : `${scope} Selecting Full 294 here does not change a workgroup experiment button action. Correctness-only subset run. Preset order: 1x1, 1x2, 1x4, 3x1, 3x2, 10x1. Subset checks are not full-vector verification. ${path}`;
}

async function loadCoreVectorStatus() {
  try {
    const response = await fetch("./vectors/capstash-core-pow-vectors.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const coreData = await response.json();
    state.coreVectorData = coreData;
    state.coreVectorSummary = summarizeCoreVectorData(coreData);
    state.coreCpuComparison = compareCoreVectorsToCpu(coreData);
    state.coreWgslComparison = null;
  } catch (error) {
    state.coreVectorSummary = {
      status: "unavailable",
      vectorCount: 0,
      pending: true,
      generatedAt: null,
      capstashCoreCommit: null,
      error: error instanceof Error ? error.message : String(error),
    };
    state.coreVectorData = null;
    state.coreCpuComparison = {
      pending: true,
      vectorCount: 0,
      matches: 0,
      mismatches: [],
      message: "CapStash Core vectors: pending",
    };
    state.coreWgslComparison = null;
  }
}

function renderBenchmark(snapshot = benchmarkSnapshot(state.benchmark)) {
  const execution = EXECUTION_MODES[state.executionMode];
  const whirlpoolVerified =
    state.executionMode === "webgpu-whirlpool-minimal" &&
    state.whirlpoolResult?.resultCount > 0 &&
    state.whirlpoolResult?.mismatchesAgainstCpuReference === 0;
  const syntheticVerified =
    state.executionMode === "webgpu-synthetic-nonce-benchmark" &&
    state.syntheticResult?.valid;
  const profilingVerified =
    state.executionMode === "webgpu-synthetic-profiling" &&
    state.profilingResult?.iterations?.[0]?.telemetryValidation?.valid;
  const profilingIteration = state.profilingResult?.iterations?.[0];
  const profilingGpuStatus = profilingIteration
    ? profilingIteration.outputReadback && profilingIteration.validHashBenchmark
      ? "Yes - profiling WGSL run passed correctness gate and CPU spot checks"
      : !profilingIteration.outputReadback
      ? "Yes - WGSL dispatch timing probe executed after correctness gate; output was not read back"
      : "Profiling WGSL run did not produce valid telemetry"
    : null;
  const workgroupProfiling = state.executionMode === "webgpu-workgroup-experiment" ? state.workgroupResult?.profiling : null;
  const workgroupProfileValid = Boolean(workgroupProfiling?.validProfilingRun);
  const matchedComparison = state.executionMode === "webgpu-workgroup-experiment" ? state.workgroupResult?.matchedComparison : null;
  const matchedComparisonValid = Boolean(matchedComparison?.matchedComparisonStatus?.valid);
  const workgroupPipelineLabel = state.workgroupResult?.workgroupSize === 1
    ? "WebGPU verified reference workgroup-size pipeline"
    : `WebGPU experimental workgroup-size-${state.workgroupResult?.workgroupSize || state.workgroupSize} pipeline`;
  els.activeMode.textContent = execution.label;
  els.hashingBackend.textContent = execution.hashingBackend;
  els.gpuHashing.textContent = syntheticVerified
    ? "Yes - synthetic WGSL run passed gate and spot checks"
    : matchedComparisonValid
    ? `Yes - WebGPU matched WG1 vs WG32 comparison (${formatIntegerSafe(matchedComparison.summary?.wg1ValidSamples)} WG1 samples, ${formatIntegerSafe(matchedComparison.summary?.wg32ValidSamples)} WG32 samples)`
    : workgroupProfileValid
    ? `Yes - ${workgroupPipelineLabel}`
    : profilingGpuStatus
    ? profilingGpuStatus
    : whirlpoolVerified
    ? "Yes - verified selected subset"
    : execution.hashesOnGpu
    ? "Pending correctness gate"
    : state.executionMode === "webgpu-whirlpool-minimal"
    ? "Unverified"
    : "No";
  els.gpuHashing.dataset.kind = syntheticVerified || profilingVerified || whirlpoolVerified || workgroupProfileValid || matchedComparisonValid ? "good" : "bad";
  els.computeShader.textContent = execution.hasComputeShader ? "Present" : "Not implemented";
  els.executionNote.textContent = execution.note;
  els.nonceCount.textContent = state.plumbingResult?.nonceCount?.toLocaleString() || "0";
  const workgroupGpuResult = currentWorkgroupGpuResult();
  const gpuResult = workgroupGpuResult || state.profilingResult?.iterations?.[0] || state.syntheticResult || state.whirlpoolResult || state.plumbingResult;
  els.hashesPerDispatch.textContent = gpuResult?.resultsPerDispatch
    ? gpuResult.resultsPerDispatch.toFixed(2)
    : String(execution.hashesPerDispatch);
  els.nonceCount.textContent = (gpuResult?.nonceCount || gpuResult?.totalRequested || 0).toLocaleString();
  els.resultsReturned.textContent = (gpuResult?.returnedResultCount ?? gpuResult?.resultCount ?? 0).toLocaleString();
  els.dispatchCount.textContent = gpuResult?.dispatchCountLabel || gpuResult?.dispatchCount?.toLocaleString() || "0";
  els.readbackTime.textContent = gpuResult ? formatDuration(gpuResult.readbackMs) : "0.00 s";
  els.webgpuElapsed.textContent = gpuResult ? formatDuration(gpuResult.totalElapsedMs) : "0.00 s";
  els.cpuMismatches.textContent = state.whirlpoolResult
    ? state.whirlpoolResult.mismatchesAgainstCpuReference.toLocaleString()
    : matchedComparisonValid
    ? `${formatIntegerSafe(matchedComparison.summary?.mismatchesAcrossAllSamples)} matched comparison mismatches`
    : workgroupProfileValid
    ? `${workgroupProfiling.mismatchCount.toLocaleString()} workgroup profile mismatches`
    : state.profilingResult
    ? `${state.profilingResult.correctness?.mismatchCount?.toLocaleString() || "0"} profiling mismatches`
    : state.syntheticResult
    ? `${state.syntheticResult.mismatchesAgainstCpuReference.toLocaleString()} spot-check mismatches`
    : state.plumbingResult
    ? `${state.plumbingResult.mismatchesAgainstCpuReference.toLocaleString()} expected for plumbing-only`
    : "0";
  els.plumbingMismatches.textContent = state.plumbingResult
    ? state.plumbingResult.mismatchesAgainstExpectedPlumbing.toLocaleString()
    : "0";
  els.whirlpoolStatus.textContent = state.profilingResult
    ? "Synthetic profiling run: completed"
    : matchedComparisonValid
    ? `Matched WG1 vs WG32 comparison: ${matchedComparison.summary?.comparisonValidity || "valid matched comparison"}; ${matchedComparison.summary?.recommendationEligibility || "no recommendation"}`
    : state.syntheticResult
    ? state.syntheticResult.valid
      ? "Synthetic WGSL Whirlpool: completed"
      : "Synthetic WGSL Whirlpool: invalid telemetry"
    : state.whirlpoolResult?.shaderStatus || "Minimal/Core WGSL verification: not run in this mode";
  els.whirlpoolFixture.textContent = state.whirlpoolProgress?.fixtureName || "Not run";
  els.whirlpoolNonceCounts.textContent = state.whirlpoolResult
    ? state.whirlpoolResult.nonceCountsTested.join(", ")
    : state.whirlpoolProgress
    ? String(state.whirlpoolProgress.nonceCount)
    : "Not run";
  els.whirlpoolTestedNonces.textContent = state.whirlpoolResult
    ? state.whirlpoolResult.testedNonces.join("\n")
    : state.whirlpoolProgress
    ? `${state.whirlpoolProgress.nonceStart}..${state.whirlpoolProgress.nonceStart + state.whirlpoolProgress.nonceCount - 1}`
    : "Not run";
  els.whirlpoolCases.textContent = state.whirlpoolResult
    ? `${state.whirlpoolResult.fixtureCasesExecuted} executed / ${state.whirlpoolResult.fixtureCasesRejected} rejected overflow cases`
    : state.whirlpoolProgress
    ? `${state.whirlpoolProgress.completedCases} / ${state.whirlpoolProgress.totalCases}`
    : "0 / 0";
  els.whirlpoolCoreWarning.textContent = state.whirlpoolResult
    ? state.coreVectorSummary?.pending
      ? "Verified against project CPU reference; still awaiting independent CapStash Core-generated vectors."
      : "Compared against loaded CapStash Core vectors; see Core Vector Verification."
    : "Not verified yet.";
  const coreSummary = state.coreVectorSummary;
  const coreCpu = state.coreCpuComparison;
  const coreWgsl = state.coreWgslComparison;
  const selectedPreset = selectedWgslPreset();
  const diagnostics = state.profilingResult?.iterations?.[0]?.pipelineDiagnostics || firstPipelineDiagnostics();
  els.coreVectorStatus.textContent = coreSummary?.pending
    ? "CapStash Core vectors: pending"
    : `CapStash Core vectors: ${coreSummary.status}`;
  els.coreVectorCount.textContent = coreSummary?.vectorCount?.toLocaleString() || "0";
  els.coreCpuStatus.textContent = coreCpu?.pending
    ? "Pending"
    : `${coreCpu.matches.toLocaleString()} matches / ${coreCpu.mismatches.length.toLocaleString()} mismatches`;
  const wg1SessionFull = state.workgroupStatuses?.[1]?.currentSessionFull294Passed
    ? "WG1 current-session workgroup verification: 294 / 294"
    : "WG1 current-session workgroup verification: not run";
  const wg32SessionFull = state.workgroupStatuses?.[32]?.currentSessionFull294Passed
    ? "WG32 current-session workgroup verification: 294 / 294"
    : "WG32 current-session workgroup verification: not run";
  els.documentedWgslCoreStatus.textContent = `Documented project verification: full 294-vector pass; batched sizes 1, 2, 4, 8, 16, 32, and 64 documented. Workgroup experiment status: ${wg1SessionFull}; ${wg32SessionFull}.`;
  els.coreWgslStatus.textContent = coreWgsl
    ? coreWgsl.pending
      ? "Pending"
      : `This session: ${coreWgsl.verificationStatus}; ${coreWgsl.matches.toLocaleString()} / ${coreWgsl.selectedVectorCount.toLocaleString()} selected matches, ${coreWgsl.mismatches.length.toLocaleString()} mismatches`
    : selectedPreset.fullVector
    ? "This session WGSL/Core verification: full-vector not run"
    : "This session WGSL/Core verification: not run";
  els.wgslSubset.textContent = state.whirlpoolResult?.subset?.label || "Not run";
  els.wgslVectorsSelected.textContent = coreWgsl
    ? coreWgsl.selectedVectorCount.toLocaleString()
    : state.whirlpoolResult?.subset?.fullVector
    ? state.whirlpoolResult.subset.expectedCoreVectorCount?.toLocaleString() || "294"
    : selectedPreset.fullVector
    ? selectedPreset.expectedCoreVectorCount?.toLocaleString() || "294"
    : "Not run";
  els.wgslBatchSize.textContent = state.whirlpoolResult?.batchSize?.toLocaleString() || state.wgslBatchSize.toLocaleString();
  const pipelineTiming = formatPipelineTimingView(state.syntheticResult || state.whirlpoolResult, diagnostics);
  els.wgslShaderSize.textContent = formatShaderSize(diagnostics);
  els.shaderGenerationTime.textContent = pipelineTiming.shaderGeneration;
  els.shaderModuleCreationTime.textContent = pipelineTiming.shaderModuleCreation;
  els.pipelineCreationTime.textContent = pipelineTiming.thisRunPipelineCreation;
  els.originalColdCompileTime.textContent = pipelineTiming.originalColdCompile;
  els.pipelineReuse.textContent = pipelineTiming.pipelineStatus;
  els.historicalColdCompileTimestamp.textContent = pipelineTiming.historicalColdCompileTimestamp;
  els.historicalColdCompileApplies.textContent = pipelineTiming.historicalColdCompileApplies;
  els.pipelineTimeout.textContent = diagnostics?.pipelineTimeoutMs ? `${diagnostics.pipelineTimeoutMs.toLocaleString()} ms` : "Not run";
  els.coldTotalTime.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatDuration((state.syntheticResult || state.whirlpoolResult).totalElapsedMs)
    : "Not run";
  els.thisRunTotalElapsed.textContent = pipelineTiming.totalElapsed;
  els.warmDispatchTime.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatMaybeMs((state.syntheticResult || state.whirlpoolResult).gpuElapsedMs)
    : "Not run";
  els.bufferSetupTime.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatMaybeMs((state.syntheticResult || state.whirlpoolResult).bufferSetupMs)
    : "Not run";
  els.cpuComparisonTime.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatMaybeMs((state.syntheticResult || state.whirlpoolResult).cpuComparisonMs)
    : "Not run";
  els.verifiedRateExcludingPipeline.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatVerificationRate((state.syntheticResult || state.whirlpoolResult).verifiedHashesPerSecondExcludingPipeline)
    : "Not run";
  els.verifiedRateIncludingPipeline.textContent = state.syntheticResult || state.whirlpoolResult
    ? formatVerificationRate((state.syntheticResult || state.whirlpoolResult).verifiedHashesPerSecondIncludingPipeline)
    : "Not run";
  els.pipelineError.textContent = state.whirlpoolResult?.firstPipelineError?.error || diagnostics?.validationError || "None";
  els.pipelineDiagnostics.textContent = diagnostics ? JSON.stringify(diagnostics, null, 2) : "None";
  els.coreMismatchDetails.textContent = coreCpu?.mismatches?.length
    ? JSON.stringify(coreCpu.mismatches[0], null, 2)
    : coreWgsl?.mismatches?.length
    ? JSON.stringify(coreWgsl.mismatches[0], null, 2)
    : "None";
  els.firstMismatch.textContent = state.whirlpoolResult?.firstMismatch
    ? JSON.stringify(state.whirlpoolResult.firstMismatch, null, 2)
    : state.syntheticResult?.firstMismatch
    ? JSON.stringify(state.syntheticResult.firstMismatch, null, 2)
    : "None";
  renderSyntheticBenchmark();
  renderProfiling();
  renderWorkgroupExperiment();
  renderWorkflowShell();
  els.average.textContent = formatRate(snapshot.averageHashPerSecond);
  els.peak.textContent = formatRate(snapshot.peakHashPerSecond);
  els.minimum.textContent = formatRate(snapshot.minHashPerSecond);
  els.total.textContent = snapshot.hashes.toLocaleString();
  els.elapsed.textContent = formatDuration(snapshot.elapsedMs);
  els.warmup.textContent = state.syntheticExport
    ? `Correctness gate ${state.syntheticExport.correctness.correctnessGateStatus}; synthetic CPU spot-check ${formatMaybeMs(state.syntheticExport.timing.syntheticCpuSpotCheckMs)}`
    : state.workgroupResult?.profiling?.validProfilingRun
    ? `Workgroup profile ${state.workgroupResult.profiling.hashesCompleted.toLocaleString()} hashes; full-294 prerequisite ${state.workgroupResult.full294?.status || "passed"}; CPU spot checks ${state.workgroupResult.profiling.cpuSpotCheckStatus}.`
    : state.workgroupResult?.matchedComparison
    ? `Matched comparison completed: WG1 ${formatIntegerSafe(state.workgroupResult.matchedComparison.summary?.wg1ValidSamples)}/${formatIntegerSafe(state.workgroupRepetitions)} valid, WG32 ${formatIntegerSafe(state.workgroupResult.matchedComparison.summary?.wg32ValidSamples)}/${formatIntegerSafe(state.workgroupRepetitions)} valid; ${state.workgroupResult.matchedComparison.interpretation?.message || "No recommendation"}`
    : state.profilingResult
    ? profilingSetupSummary(state.profilingResult)
    : `${formatDuration(snapshot.warmupMs)} / ${snapshot.warmupHashes.toLocaleString()} hashes`;
  els.workSplit.textContent = state.syntheticExport
    ? `Synthetic dispatch ${formatMaybeMs(state.syntheticExport.timing.syntheticDispatchLoopMs)} / non-hash overhead ${formatMaybeMs(Math.max(0, state.syntheticExport.timing.syntheticTotalElapsedMs - state.syntheticExport.timing.syntheticDispatchLoopMs))}`
    : state.workgroupResult?.profiling?.validProfilingRun
    ? `Workgroup profile queue wait ${formatMaybeMs(state.workgroupResult.profiling.queueWaitMs)} / readback ${formatMaybeMs(state.workgroupResult.profiling.readbackMs)} / CPU validation ${formatMaybeMs(state.workgroupResult.profiling.cpuValidationMs)}`
    : state.workgroupResult?.lastMatchedSample
    ? `Last executed matched sample (${currentWorkgroupGpuResult()?.scalarSummarySource}): queue wait ${formatMaybeMs(state.workgroupResult.lastMatchedSample.queueWaitMs)} / readback ${formatMaybeMs(state.workgroupResult.lastMatchedSample.readbackMs)} / CPU validation ${formatMaybeMs(state.workgroupResult.lastMatchedSample.cpuValidationMs)}`
    : state.profilingResult?.iterations?.[0]
    ? `Profiling queue wait ${formatMaybeMs(state.profilingResult.iterations[0].hostPhases.queueCompletionWaitMs)} / readback ${formatMaybeMs(state.profilingResult.iterations[0].hostPhases.readbackMs)} / CPU validation ${formatMaybeMs(state.profilingResult.iterations[0].hostPhases.cpuGpuComparisonMs)}`
    : `${snapshot.hashWorkPercent.toFixed(1)}% hash loop / ${snapshot.overheadPercent.toFixed(1)}% browser and JavaScript overhead`;
  els.nativeEstimate.textContent = "Not measured in this prototype";
  els.efficiency.textContent = "Not calculated";
}

function renderSyntheticBenchmark() {
  const result = state.syntheticResult;
  const progress = state.syntheticProgress;
  const fixture = syntheticFixture();
  els.syntheticModeStatus.textContent = result
    ? result.valid
      ? result.validityLabel
      : result.reason || result.validityLabel
    : "Not run";
  els.syntheticWgslStatus.textContent = result
    ? result.valid
      ? "Synthetic WGSL Whirlpool: completed"
      : "Synthetic WGSL Whirlpool: invalid telemetry"
    : "Not run";
  els.syntheticCoreSessionStatus.textContent = "Core-vector WGSL verification this session: not run in synthetic mode";
  els.syntheticTelemetryStatus.textContent = state.syntheticExport?.telemetryStatus || "Not run";
  els.syntheticFixture.textContent = result?.fixtureName || fixture.name;
  els.syntheticNonceRange.textContent = result
    ? `${result.nonceStart}..${result.nonceEnd}`
    : `${fixture.nonceStart}..${fixture.nonceStart + state.syntheticHashCount - 1}`;
  els.syntheticRequested.textContent = result?.totalRequested?.toLocaleString() || state.syntheticHashCount.toLocaleString();
  els.syntheticCompleted.textContent = result?.resultCount?.toLocaleString() || progress?.completed?.toLocaleString() || "0";
  els.syntheticDispatchBatchSize.textContent = result?.dispatchBatchSize?.toLocaleString() || state.syntheticDispatchBatchSize.toLocaleString();
  els.syntheticDispatchCount.textContent = result?.dispatchCount?.toLocaleString() || "0";
  els.syntheticHashesPerDispatch.textContent = result?.resultsPerDispatch ? result.resultsPerDispatch.toFixed(2) : "Not run";
  els.syntheticGateStatus.textContent = result?.correctnessGate
    ? result.correctnessGate.passed
      ? `Passed ${result.correctnessGate.presetLabel} at batch size ${result.correctnessGate.batchSize}`
      : `Failed ${result.correctnessGate.presetLabel} at batch size ${result.correctnessGate.batchSize}`
    : "Automatic gate not run";
  els.syntheticSpotCheckStatus.textContent = result?.spotCheckStatus || "Not run";
  els.syntheticSpotCheckCount.textContent = result?.spotCheckCount?.toLocaleString() || "0";
  els.syntheticRateIncludingPipeline.textContent = result
    ? formatVerificationRate(result.verifiedHashesPerSecondIncludingPipeline)
    : "Not run";
  els.syntheticRateExcludingPipeline.textContent = result
    ? formatVerificationRate(result.verifiedHashesPerSecondExcludingPipeline)
    : "Not run";
  els.syntheticTiming.textContent = result
    ? `synthetic buffer setup ${formatMaybeMs(result.bufferSetupMs)}, synthetic dispatch loop ${formatMaybeMs(result.gpuElapsedMs)}, synthetic readback ${formatMaybeMs(result.readbackMs)}, synthetic CPU spot-check ${formatMaybeMs(result.cpuComparisonMs)}, synthetic total ${formatMaybeMs(result.totalElapsedMs)}`
    : "Not run";
  const gateResult = result?.correctnessGate?.result;
  els.syntheticGateTiming.textContent = gateResult
    ? `gate buffer setup ${formatMaybeMs(gateResult.bufferSetupMs)}, gate dispatch ${formatMaybeMs(gateResult.gpuElapsedMs)}, gate readback ${formatMaybeMs(gateResult.readbackMs)}, gate CPU comparison ${formatMaybeMs(gateResult.cpuComparisonMs)}, gate total ${formatMaybeMs(gateResult.totalElapsedMs)}`
    : "Automatic gate not run";
  els.syntheticWorkgroupModel.textContent = result?.workgroup
    ? `dispatch batch size ${result.dispatchBatchSize} hashes; WGSL workgroup_size(${result.workgroup.wgslWorkgroupSize}); representative dispatch launches ${result.workgroup.workgroupsDispatched} workgroups with one active hash per invocation`
    : "Not run";
  els.syntheticWorkgroupLimit.textContent = result?.workgroup
    ? `device max invocations/workgroup ${result.workgroup.maxComputeInvocationsPerWorkgroup ?? "unavailable"}; configured workgroup size ${result.workgroup.wgslWorkgroupSize}; valid ${result.workgroup.workgroupLimitValid ? "yes" : "no"}`
    : "Not run";
  els.syntheticFirstMismatch.textContent = result?.firstMismatch
    ? JSON.stringify(result.firstMismatch, null, 2)
    : "None";
  els.copySyntheticResult.disabled = !state.syntheticExport;
  els.downloadSyntheticResult.disabled = !state.syntheticExport;
  els.downloadSyntheticSummary.disabled = !state.syntheticRepeatedSummary;
  renderSyntheticRepeatedSummary();
  renderSyntheticHistory();
}

function renderSyntheticRepeatedSummary() {
  const summary = state.syntheticRepeatedSummary;
  els.downloadSyntheticSummary.disabled = !summary;
  els.syntheticSummaryStatus.textContent = summary?.statisticsStatus || "No compatible repeated runs in this session";
  els.syntheticSummaryCompatibleRuns.textContent = summary?.runCount?.toLocaleString() || "0";
  els.syntheticSummaryValidRuns.textContent = summary?.validRunCount?.toLocaleString() || "0";
  els.syntheticSummaryInvalidRuns.textContent = summary?.invalidRunCount?.toLocaleString() || "0";
  els.syntheticSummaryHpsIncluding.textContent = summary
    ? formatStats(summary.statistics.hpsIncludingPipeline, formatRate)
    : "No compatible valid runs";
  els.syntheticSummaryHpsExcluding.textContent = summary
    ? formatStats(summary.statistics.hpsExcludingPipelineAndCpuSpotCheck, formatRate)
    : "No compatible valid runs";
  els.syntheticSummaryDispatch.textContent = summary
    ? formatStats(summary.statistics.dispatchMs, formatMaybeMs)
    : "No compatible valid runs";
  els.syntheticSummaryTotal.textContent = summary
    ? formatStats(summary.statistics.totalElapsedMs, formatMaybeMs)
    : "No compatible valid runs";
  const cv = summary?.statistics?.hpsIncludingPipeline?.sampleCoefficientOfVariation;
  els.syntheticSummaryInterpretation.textContent = summary?.interpretation || variationLabel(cv);
}

function renderSyntheticHistory() {
  els.syntheticHistoryBody.innerHTML = "";
  for (const entry of state.syntheticHistory) {
    const row = document.createElement("tr");
    const values = [
      entry.hashCount.toLocaleString(),
      entry.batchSize.toLocaleString(),
      entry.gateStatus,
      entry.spotCheckStatus,
      entry.dispatchCount.toLocaleString(),
      formatMaybeMs(entry.dispatchMs),
      formatMaybeMs(entry.totalElapsedMs),
      formatVerificationRate(entry.hashesPerSecondIncludingPipeline),
      formatVerificationRate(entry.hashesPerSecondExcludingPipeline),
      entry.pass ? "pass" : "fail",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    els.syntheticHistoryBody.append(row);
  }
  els.clearSyntheticHistory.disabled = state.syntheticHistory.length === 0;
}

function buildCurrentSyntheticExport(result) {
  return buildSyntheticBenchmarkExport({
    result,
    capabilities: state.capabilities,
    userAgent: navigator.userAgent,
    projectVersion: PROJECT_VERSION,
    gitCommit: null,
  });
}

async function copySyntheticResult() {
  if (!state.syntheticExport) return;
  try {
    await navigator.clipboard.writeText(serializeSyntheticBenchmarkExport(state.syntheticExport));
    setStatus("Synthetic benchmark result JSON copied", "good");
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`, "bad");
  }
}

function downloadSyntheticResult() {
  if (!state.syntheticExport) return;
  const blob = new Blob([serializeSyntheticBenchmarkExport(state.syntheticExport)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = syntheticBenchmarkExportFilename(state.syntheticExport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Synthetic benchmark result JSON download prepared", "good");
}

function downloadSyntheticSummary() {
  if (!state.syntheticRepeatedSummary) return;
  const blob = new Blob([serializeSyntheticRepeatedRunSummary(state.syntheticRepeatedSummary)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = syntheticRepeatedRunSummaryFilename(state.syntheticRepeatedSummary);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Synthetic repeated-run summary JSON download prepared", "good");
}

function buildCurrentProfilingExport(iteration) {
  return buildProfilingExport({
    result: iteration,
    capabilities: state.capabilities,
    userAgent: navigator.userAgent,
    projectVersion: PROJECT_VERSION,
    gitCommit: null,
  });
}

function buildCurrentProfilingSummaryExport(summary) {
  const exportObject = buildProfilingSummaryExport({
    summary,
    capabilities: state.capabilities,
    userAgent: navigator.userAgent,
    projectVersion: PROJECT_VERSION,
    gitCommit: null,
  });
  exportObject.profilingComparison = compareProfilingStrategyExports([exportObject, ...state.profilingRunExports]);
  return exportObject;
}

function renderProfiling() {
  const summary = state.profilingResult;
  const iteration = summary?.iterations?.[0];
  els.profilingStatus.textContent = summary
    ? `${summary.configuration.readbackStrategy}; ${summary.validRunCount} valid / ${summary.runCount} run(s); WGSL invocations submitted ${iteration?.resultCount?.toLocaleString() || "0"}; output results returned ${iteration?.returnedResultCount?.toLocaleString() || "0"}; output correctness established by this run: ${iteration?.validHashBenchmark ? "yes" : "no"}`
    : "Not run";
  els.profilingPreset.textContent = summary
    ? `${summary.configuration.hashCount.toLocaleString()} hashes / batch ${summary.configuration.dispatchBatchSize}`
    : profilingPresetById(state.profilingPresetId).label;
  els.profilingReadbackStrategy.textContent = summary
    ? PROFILING_READBACK_STRATEGIES[summary.configuration.readbackStrategy]?.label || summary.configuration.readbackStrategy
    : PROFILING_READBACK_STRATEGIES[state.profilingReadbackStrategyId].label;
  els.profilingRepetitions.textContent = summary?.configuration?.repetitionCount?.toLocaleString() || state.profilingRepetitions.toLocaleString();
  els.profilingGateStatus.textContent = summary?.correctness?.correctnessGateStatus || "Not run";
  els.profilingSpotCheckStatus.textContent = summary?.correctness?.cpuSpotCheckStatus || "Not run";
  els.profilingMismatchStatus.textContent = summary
    ? `${summary.correctness.mismatchCount.toLocaleString()} mismatch(es); pipeline error ${summary.correctness.pipelineError || "none"}`
    : "Not run";
  els.profilingTimingSource.textContent = iteration?.hostPhases?.timingSourceNote || "Browser-observed timing only; no GPU hardware counters.";
  els.profilingPhaseBreakdown.textContent = iteration
    ? `fixture ${formatMaybeMs(iteration.hostPhases.fixtureHeaderPreparationMs)}, nonce planning ${formatMaybeMs(iteration.hostPhases.nonceRangePlanningMs)}, output sizing ${formatMaybeMs(iteration.hostPhases.outputSizeCalculationMs)}, buffer allocation ${formatMaybeMs(iteration.hostPhases.bufferAllocationMs)}, buffer populate/upload ${formatMaybeMs(iteration.hostPhases.bufferPopulationUploadMs)}, bind groups ${formatMaybeMs(iteration.hostPhases.bindGroupCreationMs)}, encode ${formatMaybeMs(iteration.hostPhases.computePassEncodingMs)}, copy encode ${formatMaybeMs(iteration.hostPhases.copyEncodingMs)}, queue submit ${formatMaybeMs(iteration.hostPhases.queueSubmissionMs)}, queue wait ${formatMaybeMs(iteration.hostPhases.queueCompletionWaitMs)}, readbacks ${iteration.readbackCount}, readback ${formatMaybeMs(iteration.hostPhases.readbackMs)}, decode ${formatMaybeMs(iteration.hostPhases.resultDecodingMs)}, CPU validation ${formatMaybeMs(iteration.hostPhases.cpuGpuComparisonMs)}, object construction ${formatMaybeMs(iteration.hostPhases.resultObjectConstructionMs)}, UI render unavailable, logical dispatches ${iteration.logicalDispatchCount}, physical submissions ${iteration.physicalSubmissionCount}, queue waits ${iteration.queueWaitCount}, command buffers ${iteration.commandBufferCount}, total ${formatMaybeMs(iteration.hostPhases.totalBenchmarkElapsedMs)}`
    : "Not run";
  els.profilingInterpretation.textContent = iteration?.interpretation?.note || "Not run";
  els.profilingStats.textContent = summary
    ? `total ${formatStats(summary.statistics.totalElapsedMs, formatMaybeMs)}; queue wait ${formatStats(summary.statistics.queueCompletionWaitMs, formatMaybeMs)}; command encoding ${formatStats(summary.statistics.commandEncodingMs, formatMaybeMs)}; readback ${formatStats(summary.statistics.readbackMs, formatMaybeMs)}; CPU validation ${formatStats(summary.statistics.cpuSpotCheckMs, formatMaybeMs)}; decode ${formatStats(summary.statistics.resultDecodingMs, formatMaybeMs)}`
    : "Not run";
  const comparison = compareProfilingStrategyExports(state.profilingRunExports);
  els.profilingStrategyComparison.textContent = state.profilingRunExports.length
    ? JSON.stringify(comparison, null, 2)
    : "Insufficient compatible runs";
  els.profilingDispatchPreview.textContent = iteration?.perDispatch?.length
    ? JSON.stringify(iteration.perDispatch.slice(0, 3).map((entry) => iteration.readbackStrategy?.id === "multi-dispatch-single-readback"
      ? {
          dispatchIndex: entry.dispatchIndex,
          nonceStart: entry.nonceStart,
          nonceEnd: entry.nonceEnd,
          hashesSubmitted: entry.hashesSubmitted,
          outputDestinationOffset: entry.outputDestinationOffset,
          outputByteOffset: entry.outputByteOffset,
          outputByteLength: entry.outputByteLength,
          workgroupCount: entry.workgroupCount,
          activeInvocations: entry.activeInvocations,
          timingScope: entry.timingScope,
          timingOwner: entry.timingOwner,
          logicalDispatchTimingIndividuallyMeasured: entry.logicalDispatchTimingIndividuallyMeasured,
        }
      : entry), null, 2)
    : "Not run";
  els.downloadProfilingResult.disabled = !state.profilingExport;
  els.downloadProfilingSummary.disabled = !state.profilingSummaryExport;
  renderProfilingHistory();
}

function renderProfilingHistory() {
  els.profilingHistoryBody.innerHTML = "";
  for (const entry of state.profilingHistory) {
    const row = document.createElement("tr");
    const values = [
      entry.hashCount.toLocaleString(),
      entry.batchSize.toLocaleString(),
      entry.readbackStrategy,
      entry.dispatchCount.toLocaleString(),
      formatMaybeMs(entry.totalElapsedMs),
      formatMaybeMs(entry.queueCompletionWaitMs),
      formatMaybeMs(entry.readbackMs),
      formatMaybeMs(entry.cpuValidationMs),
      entry.interpretation,
      entry.validHashBenchmark ? "valid benchmark" : "profiling only",
      entry.pass ? "pass" : "fail",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    els.profilingHistoryBody.append(row);
  }
}

function formatMaybeStat(stats, key = "mean") {
  return stats?.[key] !== undefined && Number.isFinite(stats[key]) ? formatMaybeMs(stats[key]) : "Pending";
}

function renderWorkgroupExperiment() {
  const plannedAccounting = workgroupExperimentInvocationAccounting({ workgroupSize: state.workgroupSize });
  const displayAccounting = workgroupDisplayAccounting(plannedAccounting);
  els.workgroupReference.textContent = "1";
  els.workgroupSelected.textContent = String(state.workgroupSize);
  els.workgroupPipelineKey.textContent = whirlpoolPipelineKey(state.workgroupSize);
  els.workgroupChunkWorkgroups.textContent = displayAccounting.workgroupsPerLogicalDispatchLabel;
  els.workgroupTotalInvocations.textContent = `${displayAccounting.activeInvocationsLabel} / ${displayAccounting.paddedInvocationsLabel} (${displayAccounting.accountingScope})`;
  const selectedStatus = state.workgroupStatuses[state.workgroupSize] || {};
  const selectedSteps = workgroupStepState(state.workgroupSize);
  els.guidedWorkgroupSize.textContent = String(state.workgroupSize);
  els.guidedWorkgroupPipeline.textContent = whirlpoolPipelineKey(state.workgroupSize);
  els.guidedWorkgroupDevice.textContent = selectedStatus.deviceSupport || "not checked";
  els.guidedWorkgroupCompile.textContent = selectedStatus.pipeline || "not compiled";
  els.guidedWorkgroupSmallGate.textContent = selectedStatus.smallGate || "not run";
  els.guidedWorkgroupFull294.textContent = selectedStatus.full294 || "pending";
  els.guidedWorkgroupPerformance.textContent = workgroupPerformanceActionAvailable(selectedStatus)
    ? "performance action available"
    : "locked until full 294 passes";
  const selectedMatchedSamples = (state.workgroupProfileHistoryBySize[state.workgroupSize] || []).filter((sample) => sample.valid).length;
  els.guidedWorkgroupProfile.textContent = selectedStatus.profiling === "valid"
    ? "standalone profile tested"
    : selectedMatchedSamples > 0
    ? `matched profile tested; ${selectedMatchedSamples} valid samples`
    : "not run";
  els.guidedWorkgroupRecommendation.textContent = state.workgroupMatchedComparison?.interpretation?.message || "No workgroup-size recommendation";
  renderChecklist(els.workgroupChecklist, [
    { label: `1. Compile WG${state.workgroupSize}`, state: statusLabel(selectedSteps.compiled, selectedStatus.pipeline === "compile failed") },
    { label: "2. Run small correctness gate", state: statusLabel(selectedSteps.smallGate, selectedStatus.smallGate === "failed") },
    { label: "3. Run full 294-vector verification", state: statusLabel(selectedSteps.full294, selectedStatus.full294 === "failed") },
    { label: "4. Run performance profile", state: statusLabel(selectedSteps.profile, selectedStatus.profiling === "failed") },
  ]);
  els.guidedWorkgroupProgress.textContent = state.guidedProgress;
  els.workgroupCorrectnessEligibility.textContent = selectedStatus.full294 === "passed"
    ? "Full 294 WGSL/Core verification passed in this browser session"
    : selectedStatus.smallGate === "passed"
    ? "Small gate passed; full 294 verification still required for this selected size"
    : "Experimental shader variant. Run compile/device validation and small gate.";
  els.workgroupPerformanceEligibility.textContent = workgroupPerformanceActionAvailable(selectedStatus)
    ? "Performance profile action available; accepted performance still requires a valid profiling run"
    : "Locked; run full 294 WGSL/Core verification for this selected size first";
  els.guidedRunSmallGate.disabled = !selectedSteps.compiled || Boolean(state.activeWorkgroupActionRunId);
  els.guidedRunFull294.disabled = !selectedSteps.smallGate || Boolean(state.activeWorkgroupActionRunId);
  els.guidedRunPerformance.disabled = !workgroupPerformanceActionAvailable(selectedStatus) || Boolean(state.activeWorkgroupActionRunId);
  els.guidedCompileWorkgroup.disabled = Boolean(state.activeWorkgroupActionRunId);
  els.runRecommendedCorrectnessSequence.disabled = Boolean(state.activeWorkgroupActionRunId);
  els.guidedWorkgroupDisabledReason.textContent = !selectedSteps.compiled
    ? `Next action: Compile WG${state.workgroupSize}`
    : !selectedSteps.smallGate
    ? "Next action: Run the small correctness gate"
    : !selectedSteps.full294
    ? "Next action: Run full 294-vector verification"
    : "Correctness prerequisites passed; performance profile is available but remains manual.";
  els.guidedRunSmallGate.title = selectedSteps.compiled ? "Run the small CPU-checked fixture gate." : "Disabled until compile passes.";
  els.guidedRunFull294.title = selectedSteps.smallGate ? "Checks the selected pipeline against all 294 CapStash Core vectors. Required before profiling." : "Disabled until the small gate passes.";
  els.guidedRunPerformance.title = workgroupPerformanceActionAvailable(selectedStatus) ? "Runs the selected workgroup pipeline through the real Variant B profiler." : "Disabled until full 294-vector verification passes.";
  const comparisonPrerequisites = matchedWorkgroupComparisonPrerequisites({
    statuses: state.workgroupStatuses,
    repetitions: state.workgroupRepetitions,
    deviceLimits: state.capabilities?.limits || {},
  });
  els.workgroupRecommendation.textContent = state.workgroupMatchedComparison
    ? `${state.workgroupMatchedComparison.summary?.comparisonValidity || "valid matched comparison"}; ${state.workgroupMatchedComparison.summary?.recommendationEligibility || "no recommendation"}. ${state.workgroupMatchedComparison.interpretation?.message || "No workgroup-size recommendation from this comparison."} Blockers: ${formatIntegerSafe(state.workgroupMatchedComparison.recommendationBlockers?.length, "none")}. Direction: ${state.workgroupMatchedComparison.differences?.direction || "WG32 relative to WG1"}`
    : comparisonPrerequisites.available
    ? "Matched WG1 vs WG32 comparison is unlocked; alternating order is recommended."
    : `No workgroup-size recommendation; matched comparison locked: ${comparisonPrerequisites.missing.join("; ") || "at least three valid compatible repetitions per size are required"}.`;
  els.workgroupCurrentAction.textContent = state.workgroupCurrentAction
    ? `${WORKGROUP_EXPERIMENT_ACTION_LABELS[state.workgroupCurrentAction.requestedActionType] || state.workgroupCurrentAction.requestedActionType}; size ${state.workgroupSize}; ${whirlpoolPipelineKey(state.workgroupSize)}`
    : "None";
  els.workgroupActionStatus.textContent = state.workgroupCurrentAction
    ? state.workgroupCurrentAction.status
    : "Idle";
  els.workgroupLastCompletedAction.textContent = state.workgroupLastCompletedAction
    ? `${WORKGROUP_EXPERIMENT_ACTION_LABELS[state.workgroupLastCompletedAction.completedActionType] || state.workgroupLastCompletedAction.completedActionType}; routing ${state.workgroupLastCompletedAction.actionRoutingConsistency ? "consistent" : "invalid"}`
    : "None";
  if (els.runWorkgroupPerformance) {
    els.runWorkgroupPerformance.disabled = !workgroupPerformanceActionAvailable(selectedStatus);
  }
  if (els.runMatchedWorkgroupComparison) {
    els.runMatchedWorkgroupComparison.disabled = !comparisonPrerequisites.available;
  }
  els.guidedRunMatchedComparison.disabled = !comparisonPrerequisites.available || Boolean(state.activeWorkgroupActionRunId);
  els.prepareMatchedWorkgroups.disabled = Boolean(state.activeWorkgroupActionRunId);
  els.matchedDisabledReason.textContent = comparisonPrerequisites.available
    ? "WG1 and WG32 are ready for matched comparison."
    : `Locked: ${comparisonPrerequisites.missing.join("; ") || "both sizes must pass current-session prerequisites"}.`;
  els.guidedRunMatchedComparison.title = comparisonPrerequisites.available
    ? "Run alternating WG1/WG32 matched comparison."
    : els.matchedDisabledReason.textContent;
  els.matchedProgress.textContent = state.matchedProgress;
  els.matchedExecutionOrder.textContent = matchedWorkgroupExecutionOrder({ repetitions: state.workgroupRepetitions })
    .map((entry) => `WG${entry.workgroupSize}`)
    .join(", ");
  renderChecklist(els.matchedWg1Checklist, [
    { label: "WG1 compiled", state: statusLabel(workgroupStepState(1).compiled, workgroupStatus(1).pipeline === "compile failed") },
    { label: "WG1 small gate passed", state: statusLabel(workgroupStepState(1).smallGate, workgroupStatus(1).smallGate === "failed") },
    { label: "WG1 full 294 passed", state: statusLabel(workgroupStepState(1).full294, workgroupStatus(1).full294 === "failed") },
  ]);
  renderChecklist(els.matchedWg32Checklist, [
    { label: "WG32 compiled", state: statusLabel(workgroupStepState(32).compiled, workgroupStatus(32).pipeline === "compile failed") },
    { label: "WG32 small gate passed", state: statusLabel(workgroupStepState(32).smallGate, workgroupStatus(32).smallGate === "failed") },
    { label: "WG32 full 294 passed", state: statusLabel(workgroupStepState(32).full294, workgroupStatus(32).full294 === "failed") },
  ]);

  const supportRows = workgroupDeviceSupportRows(state.capabilities?.limits || {});
  const supportBySize = new Map(supportRows.map((row) => [row.workgroupSize, row]));
  els.workgroupStatusBody.innerHTML = "";
  for (const size of WORKGROUP_SIZE_OPTIONS) {
    const status = state.workgroupStatuses[size] || {};
    const support = supportBySize.get(size);
    const validMatchedSamples = (state.workgroupProfileHistoryBySize[size] || []).filter((sample) => sample.valid).length;
    const profilingStatus = status.profiling === "valid" && validMatchedSamples > 0
      ? `standalone and matched profiling available; ${validMatchedSamples} matched samples`
      : validMatchedSamples > 0
      ? `matched profile tested; ${validMatchedSamples} valid samples`
      : status.profiling || "not run";
    const row = document.createElement("tr");
    const cells = [
      String(size),
      support?.deviceSupport || status.deviceSupport || "not checked",
      status.pipeline || "not compiled",
      status.smallGate || "not run",
      status.full294 || "pending",
      profilingStatus,
      formatMaybeStat(status.statistics?.totalElapsedMs),
      formatMaybeStat(status.statistics?.queueCompletionWaitMs),
      status.statistics?.hashesPerSecondIncludingPipeline?.mean
        ? formatRate(status.statistics.hashesPerSecondIncludingPipeline.mean)
        : "Pending",
      status.status || "not compiled",
    ];
    for (const cellText of cells) {
      const cell = document.createElement("td");
      cell.textContent = cellText;
      row.append(cell);
    }
    els.workgroupStatusBody.append(row);
  }
  els.workgroupExperimentDetails.textContent = state.workgroupResult
    ? JSON.stringify({
        actionType: state.workgroupResult.actionType || "small-correctness-gate",
        workgroupSize: state.workgroupResult.workgroupSize,
        pipelineKey: state.workgroupResult.pipelineKey,
        compileGate: state.workgroupResult.compileGate,
        deviceValidation: state.workgroupResult.deviceValidation,
        smallGate: state.workgroupResult.smallGate,
        full294: state.workgroupResult.full294,
        profiling: state.workgroupResult.profiling || null,
        matchedComparison: state.workgroupResult.matchedComparison
          ? {
              summary: state.workgroupResult.matchedComparison.summary,
              matchedComparisonStatus: state.workgroupResult.matchedComparison.matchedComparisonStatus,
              validWg1: state.workgroupResult.matchedComparison.aggregate?.[1]?.validRepetitionCount ?? null,
              validWg32: state.workgroupResult.matchedComparison.aggregate?.[32]?.validRepetitionCount ?? null,
              invalidWg1: state.workgroupResult.matchedComparison.aggregate?.[1]?.invalidRepetitionCount ?? null,
              invalidWg32: state.workgroupResult.matchedComparison.aggregate?.[32]?.invalidRepetitionCount ?? null,
              differences: state.workgroupResult.matchedComparison.differences,
              recommendationBlockers: state.workgroupResult.matchedComparison.recommendationBlockers,
              interpretation: state.workgroupResult.matchedComparison.interpretation,
              currentSessionFull294: state.workgroupResult.matchedComparison.currentSessionFull294,
            }
          : null,
        actionTelemetry: state.workgroupResult.actionTelemetry || null,
        executedInvocationAccounting: state.workgroupResult.executedInvocationAccounting || null,
        executedProfilingAccounting: state.workgroupResult.executedProfilingAccounting || null,
        plannedProfilingAccounting: state.workgroupResult.plannedProfilingAccounting || plannedAccounting,
        note: "Executed verification accounting is separate from planned future 8,192-hash synthetic profiling accounting.",
      }, null, 2)
    : "Not run";
  els.downloadWorkgroupExperiment.disabled = !state.workgroupExport;
  if (els.downloadMatchedWorkgroupComparison) {
    els.downloadMatchedWorkgroupComparison.disabled = !state.workgroupMatchedComparisonExport;
  }
}

function renderBenchmarkForWorkgroupAction(result) {
  try {
    renderBenchmark();
    if (result) {
      result.executionStatus = result.executionStatus || { completed: true, valid: result.actionRoutingConsistency !== false };
      result.renderStatus = { completed: true, error: null };
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (result) {
      result.executionStatus = {
        completed: true,
        valid: result.actionRoutingConsistency !== false && Boolean(result.matchedComparison?.matchedComparisonStatus?.valid ?? true),
      };
      result.renderStatus = {
        completed: false,
        error: message,
        message: result.matchedComparison
          ? "Matched comparison completed, but one summary field could not be formatted. Raw result preserved."
          : "Workgroup action completed, but one summary field could not be formatted. Raw result preserved.",
      };
    }
    setStatus(result?.renderStatus?.message || `Display formatting failed: ${message}`, "bad");
    return false;
  }
}

function downloadProfilingResult() {
  if (!state.profilingExport) return;
  const blob = new Blob([serializeProfilingExport(state.profilingExport)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = profilingExportFilename(state.profilingExport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Profiling result JSON download prepared", "good");
}

function downloadProfilingSummary() {
  if (!state.profilingSummaryExport) return;
  const blob = new Blob([serializeProfilingExport(state.profilingSummaryExport)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = profilingSummaryFilename(state.profilingSummaryExport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Profiling summary JSON download prepared", "good");
}

function downloadWorkgroupExperiment() {
  if (!state.workgroupExport) return;
  const blob = new Blob([serializeWorkgroupExperimentExport(state.workgroupExport)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = workgroupExperimentFilename(state.workgroupExport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Workgroup experiment JSON download prepared", "good");
}

function downloadMatchedWorkgroupComparison() {
  if (!state.workgroupMatchedComparisonExport) return;
  const blob = new Blob([serializeMatchedWorkgroupComparison(state.workgroupMatchedComparisonExport)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = matchedWorkgroupComparisonFilename(state.workgroupMatchedComparisonExport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Matched workgroup comparison JSON download prepared", "good");
}

async function runWorkgroupExperimentMode() {
  return runWorkgroupSmallGateAction();
}

function updateWorkgroupStatusFromResult(result) {
  const existing = state.workgroupStatuses[result.workgroupSize] || {};
  const deviceSupport = result.deviceValidation?.valid ? "supported" : "Unsupported by current WebGPU device limits";
  const fullPassed = result.full294?.passed === true;
  const smallPassed = result.smallGate?.passed === true || existing.smallGate === "passed";
  const profilingValid = result.profiling?.validProfilingRun === true;
  const nextStatus = {
    ...existing,
    status: result.status,
    deviceSupport,
    pipeline: result.compileGate,
    smallGate: smallPassed ? "passed" : result.smallGate?.status || existing.smallGate || "not run",
    full294: fullPassed ? "passed" : result.full294?.status || existing.full294 || "pending",
    full294Matches: result.full294?.matches ?? existing.full294Matches ?? null,
    full294Mismatches: result.full294?.mismatches ?? existing.full294Mismatches ?? null,
    full294ResultCount: result.full294?.resultCount ?? existing.full294ResultCount ?? null,
    profiling: profilingValid ? "passed" : result.profiling?.profilingExecuted ? "invalid" : existing.profiling || "not run",
    currentSessionFull294Passed: fullPassed || existing.currentSessionFull294Passed === true,
    documentedPriorFull294Passed: result.workgroupSize === 1 || existing.documentedPriorFull294Passed === true,
    statistics: result.profiling?.statistics || existing.statistics || null,
  };
  nextStatus.performanceEligible = workgroupPerformanceEligible(nextStatus);
  nextStatus.performanceTested = profilingValid || existing.performanceTested || false;
  state.workgroupStatuses[result.workgroupSize] = nextStatus;
}

function setBenchmarkFromWorkgroupResult(result) {
  if (result.lastMatchedSample) {
    const sample = result.lastMatchedSample;
    state.benchmark.hashes = sample.hashesCompleted || 0;
    state.benchmark.startTime = performance.now() - (sample.totalElapsedMs || 0);
    state.benchmark.measuredStartTime = performance.now() - (sample.totalElapsedMs || 0);
    state.benchmark.hashWorkMs = sample.queueWaitMs || 0;
    state.benchmark.overheadMs = Math.max(0, (sample.totalElapsedMs || 0) - state.benchmark.hashWorkMs);
    state.benchmark.peakHashPerSecond = sample.hashesPerSecondIncludingPipeline || 0;
    state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
    return;
  }
  const completed =
    result.profiling?.hashesCompleted ??
    result.full294?.resultCount ??
    result.smallGate?.resultCount ??
    0;
  const elapsed =
    result.profiling?.totalElapsedMs ??
    result.result?.totalElapsedMs ??
    result.pipelineDiagnostics?.thisRunTotalElapsedMs ??
    0;
  state.benchmark.hashes = completed;
  state.benchmark.startTime = performance.now() - elapsed;
  state.benchmark.measuredStartTime = performance.now() - elapsed;
  state.benchmark.hashWorkMs = result.profiling?.firstIteration?.gpuElapsedMs ?? result.result?.gpuElapsedMs ?? 0;
  state.benchmark.overheadMs = Math.max(0, elapsed - state.benchmark.hashWorkMs);
  state.benchmark.peakHashPerSecond = result.profiling?.hashesPerSecondIncludingPipeline ?? (elapsed > 0 ? (completed * 1000) / elapsed : 0);
  state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
}

function disableWorkgroupActionControls(disabled) {
  els.start.disabled = disabled;
  if (els.compileWorkgroupVariant) els.compileWorkgroupVariant.disabled = disabled;
  if (els.runWorkgroupSmallGate) els.runWorkgroupSmallGate.disabled = disabled;
  if (els.runWorkgroupFull294) els.runWorkgroupFull294.disabled = disabled;
  if (els.runWorkgroupPerformance) {
    els.runWorkgroupPerformance.disabled = disabled || !workgroupPerformanceActionAvailable(state.workgroupStatuses[state.workgroupSize] || {});
  }
  if (els.runMatchedWorkgroupComparison) {
    const prerequisites = matchedWorkgroupComparisonPrerequisites({
      statuses: state.workgroupStatuses,
      repetitions: state.workgroupRepetitions,
      deviceLimits: state.capabilities?.limits || {},
    });
    els.runMatchedWorkgroupComparison.disabled = disabled || !prerequisites.available;
  }
  for (const id of [
    "guidedCompileWorkgroup",
    "guidedRunSmallGate",
    "guidedRunFull294",
    "guidedRunPerformance",
    "guidedRunMatchedComparison",
    "runRecommendedCorrectnessSequence",
    "prepareMatchedWorkgroups",
    "runRecommendedAction",
  ]) {
    if (els[id]) els[id].disabled = disabled;
  }
  els.stop.disabled = true;
}

function prepareWorkgroupActionEvent(event) {
  if (!event) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function runWorkgroupCompileAction(event) {
  prepareWorkgroupActionEvent(event);
  return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.compile);
}

function runWorkgroupSmallGateAction(event) {
  prepareWorkgroupActionEvent(event);
  return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.smallGate);
}

function runWorkgroupFull294Action(event) {
  prepareWorkgroupActionEvent(event);
  return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.full294);
}

function runWorkgroupPerformanceAction(event) {
  prepareWorkgroupActionEvent(event);
  return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile);
}

function runMatchedWorkgroupComparisonAction(event) {
  prepareWorkgroupActionEvent(event);
  return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison);
}

async function runRecommendedWorkflowAction(event) {
  prepareWorkgroupActionEvent(event);
  const next = recommendedNextAction();
  if (next.action === "prepare-both") return prepareMatchedWorkgroups();
  if (next.action === "run-matched") return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison);
  if (next.action === "compile") return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.compile);
  if (next.action === "small") return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.smallGate);
  if (next.action === "full294") return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.full294);
  if (next.action === "profile") return runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile);
  return startBenchmark();
}

async function runRecommendedCorrectnessSequence(size = state.workgroupSize) {
  const originalSize = state.workgroupSize;
  state.workgroupSize = size;
  els.workgroupSizeSelect.value = String(size);
  state.guidedProgress = `Compiling WG${size}...`;
  renderBenchmark();
  await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.compile);
  if (!workgroupStepState(size).compiled) return;
  state.guidedProgress = `WG${size} compiled. Running small gate...`;
  renderBenchmark();
  await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.smallGate);
  if (!workgroupStepState(size).smallGate) return;
  const small = state.workgroupStatuses[size]?.smallGate === "passed" ? "Small gate passed" : "Small gate did not pass";
  state.guidedProgress = `${small}. Running full 294-vector verification...`;
  renderBenchmark();
  await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.full294);
  if (workgroupStepState(size).full294) {
    state.guidedProgress = `Full verification passed: 294 / 294\nWG${size} is now performance eligible.`;
  }
  state.workgroupSize = originalSize;
  els.workgroupSizeSelect.value = String(originalSize);
  renderBenchmark();
}

async function prepareMatchedWorkgroups(event) {
  prepareWorkgroupActionEvent(event);
  const originalSize = state.workgroupSize;
  for (const size of [1, 32]) {
    state.workgroupSize = size;
    els.workgroupSizeSelect.value = String(size);
    state.matchedProgress = `Preparing WG${size}: compile...`;
    renderBenchmark();
    await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.compile);
    if (!workgroupStepState(size).compiled) break;
    state.matchedProgress = `Preparing WG${size}: small correctness gate...`;
    renderBenchmark();
    await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.smallGate);
    if (!workgroupStepState(size).smallGate) break;
    state.matchedProgress = `Preparing WG${size}: full 294-vector verification...`;
    renderBenchmark();
    await runWorkgroupExperimentAction(WORKGROUP_EXPERIMENT_ACTIONS.full294);
    if (!workgroupStepState(size).full294) break;
  }
  state.workgroupSize = originalSize;
  els.workgroupSizeSelect.value = String(originalSize);
  state.matchedProgress = matchedPrerequisitesReady()
    ? "WG1 and WG32 are ready for matched comparison."
    : "Preparation stopped before all prerequisites passed. Check the failed step above.";
  renderBenchmark();
}

async function runWorkgroupExperimentAction(requestedActionType) {
  const action = normalizeWorkgroupExperimentAction(requestedActionType);
  if (!state.capabilities?.supported) {
    setStatus("WebGPU is unavailable; workgroup-size experiment cannot run", "bad");
    return;
  }
  if (state.activeWorkgroupActionRunId !== null) {
    setStatus("Another workgroup experiment action is already running", "bad");
    return;
  }

  const runId = state.workgroupActionRunId + 1;
  state.workgroupActionRunId = runId;
  state.activeWorkgroupActionRunId = runId;
  const actionTelemetry = createWorkgroupActionTelemetry({
    requestedActionType: action,
    runId,
  });
  state.workgroupCurrentAction = {
    ...actionTelemetry,
    status: "running",
  };
  disableWorkgroupActionControls(true);
  state.workgroupExport = null;
  state.syntheticResult = null;
  state.syntheticProgress = null;
  state.syntheticExport = null;
  state.profilingResult = null;
  state.profilingProgress = null;
  state.profilingExport = null;
  state.profilingSummaryExport = null;
  state.plumbingResult = null;
  state.whirlpoolResult = null;
  state.whirlpoolProgress = null;
  state.coreWgslComparison = null;
  state.workgroupResult = {
    mode: "webgpu-workgroup-experiment",
    actionType: action,
    requestedActionType: action,
    startedActionType: action,
    workgroupSize: state.workgroupSize,
    pipelineKey: whirlpoolPipelineKey(state.workgroupSize),
    status: "running",
    actionTelemetry,
    smallGate: { status: "not run", passed: false },
    full294: { status: action === WORKGROUP_EXPERIMENT_ACTIONS.full294 ? "running" : "pending" },
    plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: state.workgroupSize }),
  };
  renderBenchmark();

  try {
    let result;
    if (action === WORKGROUP_EXPERIMENT_ACTIONS.compile) {
      setStatus(`Compiling workgroup-size ${state.workgroupSize} pipeline ${whirlpoolPipelineKey(state.workgroupSize)}`, "good");
      result = await runWorkgroupCompileGate({ workgroupSize: state.workgroupSize });
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.full294) {
      if (!state.coreVectorData || state.coreVectorSummary?.pending) {
        throw new Error("CapStash Core vectors are unavailable; full 294 WGSL/Core verification cannot run");
      }
      setStatus(`Running full 294-vector WGSL/Core verification with workgroup size ${state.workgroupSize}`, "good");
      result = await runWorkgroupFullVerification({
        workgroupSize: state.workgroupSize,
        coreVectorData: state.coreVectorData,
        onProgress(progress) {
          if (state.activeWorkgroupActionRunId !== runId) return;
          setStatus(`Workgroup ${state.workgroupSize} full 294: ${progress.completedCases || 0} / ${progress.totalCases || 0} results`, "good");
          renderBenchmark();
        },
      });
      state.coreWgslComparison = result.coreComparison;
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile) {
      const selectedStatus = state.workgroupStatuses[state.workgroupSize] || {};
      if (!workgroupPerformanceActionAvailable(selectedStatus)) {
        throw new Error("Run full 294 WGSL/Core verification for this workgroup size before performance profiling");
      }
      setStatus(`Running workgroup-size ${state.workgroupSize} performance profile with ${state.workgroupRepetitions} repetition(s)`, "good");
      const profilingSummary = await runWorkgroupSyntheticProfiling({
        workgroupSize: state.workgroupSize,
        repetitions: state.workgroupRepetitions,
        onProgress(progress) {
          if (state.activeWorkgroupActionRunId !== runId) return;
          setStatus(`Workgroup ${state.workgroupSize} profiling: repetition ${progress.repetition || 0} / ${state.workgroupRepetitions}`, "good");
          renderBenchmark();
        },
      });
      const firstIteration = profilingSummary.iterations?.[0] || null;
      const existingFull294 = selectedStatus.full294 === "passed"
        ? {
            status: "passed",
            passed: true,
            matches: selectedStatus.full294Matches ?? null,
            mismatches: selectedStatus.full294Mismatches ?? 0,
            prerequisiteSource: "current-session workgroup status",
          }
        : { status: "missing", passed: false };
      const profiling = summarizeWorkgroupProfilingResult({
        profilingSummary,
        workgroupSize: state.workgroupSize,
        full294: existingFull294,
      });
      if (!profiling.profilingExecuted) {
        throw new Error("Performance action routed correctly, but profiling execution did not start: profiler returned no iterations.");
      }
      result = {
        mode: "webgpu-workgroup-experiment",
        actionType: WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile,
        workgroupSize: state.workgroupSize,
        pipelineKey: whirlpoolPipelineKey(state.workgroupSize),
        status: profiling.validProfilingRun ? "performance tested; valid profile" : "invalid profiling telemetry",
        compileGate: "compiled",
        deviceValidation: firstIteration?.pipelineDiagnostics?.deviceLimitValidation || null,
        pipelineDiagnostics: firstIteration?.pipelineDiagnostics || null,
        smallGate: { status: "passed", passed: true },
        full294: existingFull294,
        profiling,
        profilingExecuted: profiling.profilingExecuted,
        validProfilingRun: profiling.validProfilingRun,
        performanceEligible: profiling.performanceEligible,
        hashesCompleted: profiling.hashesCompleted,
        resultCount: profiling.resultCount,
        returnedResultCount: profiling.returnedResultCount,
        executedProfilingAccounting: workgroupProfilingInvocationAccounting({
          hashCount: profiling.requestedHashes,
          logicalBatchSize: firstIteration?.dispatchBatchSize || 512,
          workgroupSize: state.workgroupSize,
        }),
        plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: state.workgroupSize }),
        profilingSummary,
        result: firstIteration,
      };
      if (!profiling.validProfilingRun) {
        result.firstMismatch = profiling.firstMismatch || {
          reason: profiling.telemetryConsistency?.issues?.join("; ") || "invalid workgroup profiling telemetry",
        };
      }
      for (const [index, iteration] of (profilingSummary.iterations || []).entries()) {
        const sample = validateMatchedWorkgroupProfileSample({
          iteration,
          requestedWorkgroupSize: state.workgroupSize,
          repetitionIndex: index + 1,
          executionOrderIndex: index,
          actionRunId: runId,
          full294Passed: selectedStatus.currentSessionFull294Passed === true,
        });
        state.workgroupProfileHistoryBySize[state.workgroupSize] = [
          ...(state.workgroupProfileHistoryBySize[state.workgroupSize] || []),
          sample,
        ];
      }
      state.workgroupExport = buildWorkgroupExperimentExport({
        actionResult: result,
        profilingSummary,
        capabilities: state.capabilities,
        userAgent: navigator.userAgent,
      });
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison) {
      const prerequisites = matchedWorkgroupComparisonPrerequisites({
        statuses: state.workgroupStatuses,
        repetitions: state.workgroupRepetitions,
        deviceLimits: state.capabilities?.limits || {},
      });
      if (!prerequisites.available) {
        throw new Error(`Matched WG1 vs WG32 comparison locked: ${prerequisites.missing.join("; ")}`);
      }
      const executionOrder = matchedWorkgroupExecutionOrder({ repetitions: state.workgroupRepetitions });
      const samples = [];
      setStatus(`Running matched WG1 vs WG32 comparison with ${state.workgroupRepetitions} repetitions per size`, "good");
      for (const step of executionOrder) {
        if (state.activeWorkgroupActionRunId !== runId) {
          setStatus("Stale matched workgroup comparison discarded", "neutral");
          return;
        }
        const pipelineKey = whirlpoolPipelineKey(step.workgroupSize);
        setStatus(`Matched comparison order ${step.executionOrderIndex + 1} / ${executionOrder.length}: WG${step.workgroupSize} ${pipelineKey} repetition ${step.repetitionIndex}`, "good");
        renderBenchmark();
        const profilingSummary = await runWorkgroupSyntheticProfiling({
          workgroupSize: step.workgroupSize,
          repetitions: 1,
          onProgress(progress) {
            if (state.activeWorkgroupActionRunId !== runId) return;
            setStatus(`Matched comparison WG${step.workgroupSize}: ${progress.stage || "profiling"} repetition ${step.repetitionIndex}`, "good");
            renderBenchmark();
          },
        });
        const iteration = profilingSummary.iterations?.[0] || null;
        const sample = validateMatchedWorkgroupProfileSample({
          iteration,
          requestedWorkgroupSize: step.workgroupSize,
          repetitionIndex: step.repetitionIndex,
          executionOrderIndex: step.executionOrderIndex,
          actionRunId: runId,
          full294Passed: state.workgroupStatuses[step.workgroupSize]?.currentSessionFull294Passed === true,
        });
        samples.push(sample);
        state.workgroupProfileHistoryBySize[step.workgroupSize] = [
          ...(state.workgroupProfileHistoryBySize[step.workgroupSize] || []),
          sample,
        ];
      }
      const comparison = buildMatchedWorkgroupComparison({
        samples,
        executionOrder,
        repetitions: state.workgroupRepetitions,
        capabilities: state.capabilities,
        userAgent: navigator.userAgent,
      });
      state.workgroupMatchedComparison = comparison;
      state.workgroupMatchedComparisonExport = comparison;
      const lastSample = samples[samples.length - 1] || null;
      result = {
        mode: "webgpu-workgroup-experiment",
        actionType: WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison,
        workgroupSize: lastSample?.workgroupSize || state.workgroupSize,
        pipelineKey: lastSample?.requestedPipelineKey || whirlpoolPipelineKey(state.workgroupSize),
        status: comparison.interpretation.classification,
        compileGate: "compiled",
        deviceValidation: { valid: true },
        pipelineDiagnostics: lastSample?.iteration?.pipelineDiagnostics || null,
        smallGate: { status: "passed", passed: true },
        full294: { status: "passed", passed: true },
        matchedComparison: comparison,
        matchedComparisonStatus: comparison.matchedComparisonStatus,
        lastMatchedSample: lastSample,
        executedInvocationAccounting: comparison.executedInvocationAccounting,
        executedProfilingAccounting: comparison.executedProfilingAccounting,
        plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: lastSample?.workgroupSize || state.workgroupSize }),
      };
    } else {
      setStatus(`Running workgroup-size ${state.workgroupSize} compile/device validation and small gate`, "good");
      result = await runWorkgroupSmallGate({
        workgroupSize: state.workgroupSize,
        onProgress(progress) {
          if (state.activeWorkgroupActionRunId !== runId) return;
          setStatus(`Workgroup ${state.workgroupSize} small gate: ${progress.completedCases || 0} / ${progress.totalCases || 0} cases`, "good");
          renderBenchmark();
        },
      });
    }
    if (state.activeWorkgroupActionRunId !== runId) {
      setStatus("Stale workgroup action result discarded", "neutral");
      return;
    }
    const completedTelemetry = completeWorkgroupActionTelemetry(actionTelemetry, result.actionType || action, { runId });
    result = {
      ...result,
      actionType: action,
      requestedActionType: completedTelemetry.requestedActionType,
      startedActionType: completedTelemetry.startedActionType,
      completedActionType: completedTelemetry.completedActionType,
      actionRoutingConsistency: completedTelemetry.actionRoutingConsistency,
      actionTelemetry: completedTelemetry,
    };
    if (!completedTelemetry.actionRoutingConsistency) {
      result.status = "invalid telemetry";
      result.firstMismatch = {
        reason: "Requested workgroup action did not match the executed action.",
      };
    }
    state.workgroupResult = result;
    if (!state.workgroupExport && action !== WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison) {
      state.workgroupExport = buildWorkgroupExperimentExport({
        actionResult: result,
        capabilities: state.capabilities,
        userAgent: navigator.userAgent,
      });
    }
    if (action !== WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison) {
      updateWorkgroupStatusFromResult(result);
    }
    setBenchmarkFromWorkgroupResult(result);
    state.workgroupLastCompletedAction = completedTelemetry;
    state.workgroupCurrentAction = {
      ...completedTelemetry,
      status: completedTelemetry.actionRoutingConsistency ? "completed" : "invalid telemetry",
    };
    const renderCompleted = renderBenchmarkForWorkgroupAction(result);
    if (!renderCompleted) {
      return;
    }
    if (action === WORKGROUP_EXPERIMENT_ACTIONS.compile) {
      setStatus(`Workgroup ${state.workgroupSize} pipeline ${result.compileGate}`, result.compileGate === "compiled" ? "good" : "bad");
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.full294) {
      setStatus(
        result.full294.passed
          ? `Workgroup ${state.workgroupSize} full 294 WGSL/Core verification passed: ${result.full294.matches} / ${result.full294.vectorCount}`
          : `Workgroup ${state.workgroupSize} full 294 WGSL/Core verification failed`,
        result.full294.passed ? "good" : "bad",
      );
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.performanceProfile) {
      setStatus(
        result.profiling?.validProfilingRun
          ? `Workgroup ${state.workgroupSize} performance profile completed: ${result.profiling.hashesCompleted.toLocaleString()} / ${result.profiling.requestedHashes.toLocaleString()} hashes, CPU spot checks ${result.profiling.cpuSpotCheckStatus}, ${result.profiling.mismatchCount} mismatches`
          : `Performance action routed correctly, but profiling telemetry is invalid: ${(result.profiling?.telemetryConsistency?.issues || ["unknown issue"]).join("; ")}`,
        result.profiling?.validProfilingRun ? "good" : "bad",
      );
    } else if (action === WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison) {
      setStatus(
        `Matched WG1 vs WG32 comparison completed: WG1 valid ${formatIntegerSafe(result.matchedComparison.aggregate?.[1]?.validRepetitionCount)}, WG32 valid ${formatIntegerSafe(result.matchedComparison.aggregate?.[32]?.validRepetitionCount)}; ${result.matchedComparison.interpretation?.message || "No recommendation"}`,
        result.matchedComparison.matchedComparisonStatus?.valid ? "good" : "bad",
      );
    } else {
      setStatus(
        result.smallGate.passed
          ? `Workgroup ${state.workgroupSize} small gate passed; full 294 verification is still required before performance acceptance`
          : `Workgroup ${state.workgroupSize} small gate failed`,
        result.smallGate.passed ? "good" : "bad",
      );
    }
  } catch (error) {
    if (state.activeWorkgroupActionRunId !== runId) {
      setStatus("Stale workgroup action failure discarded", "neutral");
      return;
    }
    if (action === WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison && state.workgroupResult?.matchedComparison) {
      const message = error instanceof Error ? error.message : String(error);
      const failedTelemetry = completeWorkgroupActionTelemetry(actionTelemetry, action, { runId });
      state.workgroupResult.executionStatus = {
        completed: true,
        valid: Boolean(state.workgroupResult.matchedComparison.matchedComparisonStatus?.valid),
      };
      state.workgroupResult.renderStatus = {
        completed: false,
        error: message,
        message: "Matched comparison completed, but one summary field could not be formatted. Raw result preserved.",
      };
      state.workgroupCurrentAction = {
        ...failedTelemetry,
        status: "completed; render failed",
      };
      state.workgroupLastCompletedAction = failedTelemetry;
      state.workgroupMatchedComparison = state.workgroupResult.matchedComparison;
      state.workgroupMatchedComparisonExport = state.workgroupResult.matchedComparison;
      setStatus(state.workgroupResult.renderStatus.message, "bad");
      return;
    }
    const failedTelemetry = completeWorkgroupActionTelemetry(actionTelemetry, action, { runId });
    state.workgroupResult = {
      mode: "webgpu-workgroup-experiment",
      actionType: action,
      requestedActionType: action,
      startedActionType: action,
      completedActionType: action,
      actionRoutingConsistency: true,
      actionTelemetry: failedTelemetry,
      workgroupSize: state.workgroupSize,
      pipelineKey: whirlpoolPipelineKey(state.workgroupSize),
      status: "compile failed",
      compileGate: "compile failed",
      deviceValidation: error?.webgpuDiagnostics?.deviceLimitValidation || null,
      pipelineDiagnostics: error?.webgpuDiagnostics || null,
      smallGate: {
        passed: false,
        matches: 0,
        mismatches: 0,
        firstMismatch: { error: error instanceof Error ? error.message : String(error) },
      },
      full294: { status: "pending" },
      plannedProfilingAccounting: workgroupExperimentInvocationAccounting({ workgroupSize: state.workgroupSize }),
    };
    state.workgroupCurrentAction = {
      ...failedTelemetry,
      status: "failed",
    };
    state.workgroupLastCompletedAction = failedTelemetry;
    if (action !== WORKGROUP_EXPERIMENT_ACTIONS.matchedComparison) {
      state.workgroupStatuses[state.workgroupSize] = {
        ...state.workgroupStatuses[state.workgroupSize],
        status: "compile failed",
        pipeline: "compile failed",
        smallGate: "not run",
        performanceEligible: false,
      };
    }
    renderBenchmark();
    setStatus(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    if (state.activeWorkgroupActionRunId === runId) {
      state.activeWorkgroupActionRunId = null;
      disableWorkgroupActionControls(false);
    }
  }
}

async function runPlumbingProof() {
  if (!state.capabilities?.supported) {
    setStatus("WebGPU is unavailable; plumbing proof cannot run", "bad");
    return;
  }

  const nonceCount = Math.max(1, Math.min(4096, Number.parseInt(els.nonceCountInput.value || "64", 10)));
  els.nonceCountInput.value = String(nonceCount);
  const nonceStart = 0;
  const header80 = hexToBytes(CAPSTASH_POW_TEST_VECTORS[1].headerHex);

  els.start.disabled = true;
  els.stop.disabled = true;
  setStatus("Running WebGPU plumbing-only dispatch", "good");

  try {
    state.plumbingResult = await runWebGPUPlumbingProof({ header80, nonceStart, nonceCount });
    state.whirlpoolResult = null;
    state.whirlpoolProgress = null;
    state.coreWgslComparison = null;
    const result = state.plumbingResult;
    state.benchmark.hashes = result.resultCount;
    state.benchmark.startTime = performance.now() - result.totalElapsedMs;
    state.benchmark.measuredStartTime = performance.now() - result.totalElapsedMs;
    state.benchmark.hashWorkMs = result.gpuElapsedMs;
    state.benchmark.overheadMs = Math.max(0, result.totalElapsedMs - result.gpuElapsedMs);
    state.benchmark.peakHashPerSecond = result.totalElapsedMs > 0 ? (result.resultCount * 1000) / result.totalElapsedMs : 0;
    state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
    renderBenchmark();
    if (result.mismatchesAgainstExpectedPlumbing > 0) {
      setStatus("WebGPU plumbing proof failed deterministic fake-output verification", "bad");
      return;
    }
    setStatus("WebGPU plumbing-only proof passed; this is not CapStash hashing", "good");
  } catch (error) {
    state.plumbingResult = null;
    renderBenchmark();
    setStatus(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    els.start.disabled = false;
    els.stop.disabled = true;
  }
}

async function runWhirlpoolMinimalProof() {
  if (!state.capabilities?.supported) {
    setStatus("WebGPU is unavailable; Whirlpool proof cannot run", "bad");
    return;
  }

  els.start.disabled = true;
  els.stop.disabled = true;
  state.whirlpoolProgress = null;
  const preset = selectedWgslPreset();
  if (preset.fullVector && (!state.coreVectorData || state.coreVectorSummary?.pending)) {
    els.start.disabled = false;
    els.stop.disabled = true;
    setStatus("Full 294-vector WGSL/Core verification requires generated Core vectors", "bad");
    renderBenchmark();
    return;
  }
  setStatus(preset.fullVector
    ? `Running full 294-vector WGSL/Core correctness verification with batch size ${state.wgslBatchSize}, workgroup size ${state.workgroupSize}`
    : `Running real WGSL Whirlpool fixture verification with batch size ${state.wgslBatchSize}, workgroup size ${state.workgroupSize}`, "good");

  try {
    state.whirlpoolResult = await runWebGPUWhirlpoolFixtureSuite({
      subset: preset,
      batchSize: state.wgslBatchSize,
      workgroupSize: state.workgroupSize,
      onProgress(progress) {
        state.whirlpoolProgress = progress;
        setStatus(`Verifying ${progress.fixtureName} nonce count ${progress.nonceCount}; batch size ${state.wgslBatchSize}; workgroup size ${state.workgroupSize}`, "good");
        renderBenchmark();
      },
    });
    if (state.coreVectorData && state.coreVectorSummary && !state.coreVectorSummary.pending) {
      state.coreWgslComparison = compareCoreVectorsToWgslSuite(state.coreVectorData, state.whirlpoolResult, {
        scope: preset.fullVector ? "all" : "executed",
        fullVector: preset.fullVector,
      });
    }
    state.plumbingResult = null;
    const result = state.whirlpoolResult;
    state.benchmark.hashes = result.resultCount;
    state.benchmark.startTime = performance.now() - result.totalElapsedMs;
    state.benchmark.measuredStartTime = performance.now() - result.totalElapsedMs;
    state.benchmark.hashWorkMs = result.gpuElapsedMs;
    state.benchmark.overheadMs = Math.max(0, result.totalElapsedMs - result.gpuElapsedMs);
    state.benchmark.peakHashPerSecond = result.totalElapsedMs > 0 ? (result.resultCount * 1000) / result.totalElapsedMs : 0;
    state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
    renderBenchmark();
    setStatus(result.shaderStatus, result.mismatchesAgainstCpuReference === 0 && !result.firstPipelineError ? "good" : "bad");
  } catch (error) {
    state.whirlpoolResult = {
      shaderStatus: "Real WebGPU Whirlpool hashing: Failed verification",
      nonceCount: 0,
      resultCount: 0,
      dispatchCount: 0,
      readbackMs: 0,
      totalElapsedMs: 0,
      mismatchesAgainstCpuReference: 0,
      nonceCountsTested: [],
      testedNonces: [],
      fixtureCasesExecuted: 0,
      fixtureCasesRejected: 0,
      firstMismatch: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
    renderBenchmark();
    setStatus(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    els.start.disabled = false;
    els.stop.disabled = true;
  }
}

async function runSyntheticBenchmarkMode() {
  if (!state.capabilities?.supported) {
    setStatus("WebGPU is unavailable; synthetic nonce benchmark cannot run", "bad");
    return;
  }

  els.start.disabled = true;
  els.stop.disabled = true;
  state.syntheticResult = null;
  state.syntheticProgress = null;
  state.syntheticExport = null;
  state.plumbingResult = null;
  state.whirlpoolResult = null;
  state.whirlpoolProgress = null;
  state.coreWgslComparison = null;
  setStatus("Running automatic WGSL correctness gate before synthetic nonce benchmark", "good");

  try {
    const result = await runSyntheticNonceBenchmark({
      hashCount: state.syntheticHashCount,
      dispatchBatchSize: state.syntheticDispatchBatchSize,
      onProgress(progress) {
        state.syntheticProgress = progress;
        const noun = progress.stage === "synthetic-correctness-gate" ? "gate cases" : "hashes";
        setStatus(`Synthetic benchmark progress: ${progress.completed.toLocaleString()} / ${progress.totalRequested.toLocaleString()} ${noun}`, "good");
        renderBenchmark();
      },
    });
    state.syntheticResult = result;
    state.syntheticExport = buildCurrentSyntheticExport(result);
    state.syntheticRunExports = [state.syntheticExport, ...state.syntheticRunExports];
    state.syntheticRepeatedSummary = buildSyntheticRepeatedRunSummary(state.syntheticRunExports, state.syntheticExport);
    state.syntheticHistory = addSyntheticHistoryEntry(state.syntheticHistory, state.syntheticExport);
    state.benchmark.hashes = result.resultCount;
    state.benchmark.startTime = performance.now() - result.totalElapsedMs;
    state.benchmark.measuredStartTime = performance.now() - result.totalElapsedMs;
    state.benchmark.hashWorkMs = result.gpuElapsedMs + result.readbackMs + result.bufferSetupMs;
    state.benchmark.overheadMs = Math.max(0, result.totalElapsedMs - state.benchmark.hashWorkMs);
    state.benchmark.peakHashPerSecond = result.verifiedHashesPerSecondIncludingPipeline || 0;
    state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
    renderBenchmark();
    setStatus(
      state.syntheticExport.telemetryStatus === "valid telemetry"
        ? result.validityLabel
        : `invalid telemetry: ${state.syntheticExport.telemetryValidationIssues.join("; ")}`,
      state.syntheticExport.telemetryStatus === "valid telemetry" ? "good" : "bad",
    );
  } catch (error) {
    state.syntheticResult = {
      stage: "webgpu-synthetic-nonce-benchmark",
      valid: false,
      blocked: false,
      validityLabel: "Synthetic benchmark failed before completion",
      reason: error instanceof Error ? error.message : String(error),
      fixtureName: syntheticFixture().name,
      nonceStart: 0,
      nonceEnd: 0,
      totalRequested: state.syntheticHashCount,
      resultCount: 0,
      dispatchBatchSize: state.syntheticDispatchBatchSize,
      dispatchCount: 0,
      resultsPerDispatch: 0,
      mismatchesAgainstCpuReference: 0,
      spotCheckCount: 0,
      totalElapsedMs: 0,
      firstMismatch: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
    state.syntheticExport = null;
    renderBenchmark();
    setStatus(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    els.start.disabled = false;
    els.stop.disabled = true;
  }
}

async function runSyntheticProfilingMode() {
  if (!state.capabilities?.supported) {
    setStatus("WebGPU is unavailable; synthetic profiling cannot run", "bad");
    return;
  }

  els.start.disabled = true;
  els.stop.disabled = true;
  state.profilingResult = null;
  state.profilingProgress = null;
  state.profilingExport = null;
  state.profilingSummaryExport = null;
  state.syntheticResult = null;
  state.syntheticProgress = null;
  state.syntheticExport = null;
  state.plumbingResult = null;
  state.whirlpoolResult = null;
  state.whirlpoolProgress = null;
  state.coreWgslComparison = null;
  setStatus("Running automatic correctness gate before synthetic profiling", "good");

  try {
    const summary = await runSyntheticProfiling({
      preset: state.profilingPresetId,
      repetitions: state.profilingRepetitions,
      readbackStrategyId: state.profilingReadbackStrategyId,
      onProgress(progress) {
        state.profilingProgress = progress;
        const label = progress.stage === "synthetic-profiling-correctness-gate"
          ? "gate cases"
          : `profiling hashes, repetition ${(progress.repetitionIndex ?? 0) + 1}/${progress.repetitions || state.profilingRepetitions}`;
        setStatus(`Synthetic profiling progress: ${progress.completed.toLocaleString()} / ${progress.totalRequested.toLocaleString()} ${label}`, "good");
        renderBenchmark();
      },
    });
    state.profilingResult = summary;
    const firstIteration = summary.iterations[0];
    state.profilingExport = firstIteration ? buildCurrentProfilingExport(firstIteration) : null;
    state.profilingSummaryExport = buildCurrentProfilingSummaryExport(summary);
    if (state.profilingSummaryExport) {
      state.profilingRunExports = [state.profilingSummaryExport, ...state.profilingRunExports];
    }
    if (state.profilingExport) {
      state.profilingHistory = addProfilingHistoryEntry(state.profilingHistory, state.profilingExport);
    }
    state.benchmark.hashes = firstIteration?.resultCount || 0;
    state.benchmark.startTime = performance.now() - (firstIteration?.totalElapsedMs || 0);
    state.benchmark.measuredStartTime = performance.now() - (firstIteration?.totalElapsedMs || 0);
    state.benchmark.hashWorkMs = firstIteration?.hostPhases?.dispatchLoopElapsedMs || 0;
    state.benchmark.overheadMs = Math.max(0, (firstIteration?.totalElapsedMs || 0) - state.benchmark.hashWorkMs);
    state.benchmark.peakHashPerSecond = firstIteration?.verifiedHashesPerSecondIncludingPipeline || 0;
    state.benchmark.minHashPerSecond = state.benchmark.peakHashPerSecond;
    renderBenchmark();
    setStatus(
      summary.boundaries.validHashBenchmark
        ? "Synthetic profiling run completed with output readback and CPU spot checks"
        : "Dispatch timing probe completed; output correctness not established by this run alone",
      summary.validRunCount === summary.runCount ? "good" : "bad",
    );
  } catch (error) {
    state.profilingResult = null;
    state.profilingExport = null;
    state.profilingSummaryExport = null;
    renderBenchmark();
    setStatus(error instanceof Error ? error.message : String(error), "bad");
  } finally {
    els.start.disabled = false;
    els.stop.disabled = true;
  }
}

function benchmarkStep() {
  if (!state.benchmark.running) return;
  const snapshot = runBenchmarkSlice(state.benchmark);
  renderBenchmark(snapshot);
  if (snapshot.complete) {
    stopBenchmark("Benchmark complete");
    return;
  }
  state.animationFrame = requestAnimationFrame(benchmarkStep);
}

function startBenchmark() {
  if (state.benchmark.running) return;
  if (!state.correctness?.pass) {
    setStatus("Correctness tests failed; benchmark disabled", "bad");
    return;
  }
  if (state.executionMode === "webgpu-plumbing-only") {
    runPlumbingProof();
    return;
  }
  if (state.executionMode === "webgpu-whirlpool-minimal") {
    runWhirlpoolMinimalProof();
    return;
  }
  if (state.executionMode === "webgpu-synthetic-nonce-benchmark") {
    runSyntheticBenchmarkMode();
    return;
  }
  if (state.executionMode === "webgpu-synthetic-profiling") {
    runSyntheticProfilingMode();
    return;
  }
  if (state.executionMode === "webgpu-workgroup-experiment") {
    runWorkgroupExperimentMode();
    return;
  }
  if (!canRunHashBenchmark(state.executionMode)) {
    const execution = EXECUTION_MODES[state.executionMode];
    setStatus(execution.note, "bad");
    renderBenchmark();
    return;
  }
  resetBenchmarkState(state.benchmark, state.durationMode, state.executionMode);
  els.start.disabled = true;
  els.stop.disabled = false;
  setStatus(`Benchmark running on ${EXECUTION_MODES[state.executionMode].label}`, "good");
  benchmarkStep();
}

function stopBenchmark(reason = "Benchmark stopped") {
  state.benchmark.running = false;
  cancelAnimationFrame(state.animationFrame);
  els.start.disabled = false;
  els.stop.disabled = true;
  renderBenchmark();
  setStatus(reason, "neutral");
}

function collectElements() {
  for (const id of [
    "average",
    "activeMode",
    "hashingBackend",
    "gpuHashing",
      "computeShader",
      "hashesPerDispatch",
      "executionNote",
      "nonceCount",
      "nonceCountInput",
      "resultsReturned",
      "dispatchCount",
      "readbackTime",
      "webgpuElapsed",
      "cpuMismatches",
      "plumbingMismatches",
      "whirlpoolStatus",
      "whirlpoolFixture",
      "whirlpoolNonceCounts",
      "whirlpoolTestedNonces",
      "whirlpoolCases",
      "whirlpoolCoreWarning",
      "coreVectorStatus",
      "coreVectorCount",
      "coreCpuStatus",
      "documentedWgslCoreStatus",
      "coreWgslStatus",
      "wgslSubset",
      "wgslVectorsSelected",
      "wgslShaderSize",
      "shaderGenerationTime",
      "shaderModuleCreationTime",
      "pipelineCreationTime",
      "originalColdCompileTime",
      "pipelineReuse",
      "historicalColdCompileTimestamp",
      "historicalColdCompileApplies",
      "pipelineTimeout",
      "coldTotalTime",
      "thisRunTotalElapsed",
      "warmDispatchTime",
      "bufferSetupTime",
      "cpuComparisonTime",
      "verifiedRateExcludingPipeline",
      "verifiedRateIncludingPipeline",
      "pipelineError",
      "pipelineDiagnostics",
      "coreMismatchDetails",
      "firstMismatch",
    "peak",
    "minimum",
    "total",
    "elapsed",
    "warmup",
    "workSplit",
    "nativeEstimate",
    "efficiency",
    "correctness",
    "testList",
    "webgpu",
    "gpu",
    "vendor",
    "browser",
    "limits",
    "status",
    "guidedModeButton",
    "advancedModeButton",
    "recommendedNextAction",
    "recommendedNextReason",
    "runRecommendedAction",
    "compactResultSummary",
    "resetBrowserTestSession",
    "start",
    "stop",
      "wgslPresetSelect",
      "wgslPresetWarning",
      "wgslBatchSizeSelect",
      "wgslBatchSize",
      "syntheticHashCountSelect",
      "syntheticDispatchBatchSizeSelect",
      "syntheticModeStatus",
      "syntheticWgslStatus",
      "syntheticCoreSessionStatus",
      "syntheticTelemetryStatus",
      "syntheticFixture",
      "syntheticNonceRange",
      "syntheticRequested",
      "syntheticCompleted",
      "syntheticDispatchBatchSize",
      "syntheticDispatchCount",
      "syntheticHashesPerDispatch",
      "syntheticGateStatus",
      "syntheticSpotCheckStatus",
      "syntheticSpotCheckCount",
      "syntheticRateIncludingPipeline",
      "syntheticRateExcludingPipeline",
      "syntheticTiming",
      "syntheticGateTiming",
      "syntheticWorkgroupModel",
      "syntheticWorkgroupLimit",
      "syntheticSummaryStatus",
      "syntheticSummaryCompatibleRuns",
      "syntheticSummaryValidRuns",
      "syntheticSummaryInvalidRuns",
      "syntheticSummaryHpsIncluding",
      "syntheticSummaryHpsExcluding",
      "syntheticSummaryDispatch",
      "syntheticSummaryTotal",
      "syntheticSummaryInterpretation",
      "syntheticFirstMismatch",
      "copySyntheticResult",
      "downloadSyntheticResult",
      "downloadSyntheticSummary",
      "clearSyntheticHistory",
      "syntheticHistoryBody",
      "profilingPresetSelect",
      "profilingReadbackStrategySelect",
      "profilingRepetitionSelect",
      "profilingStatus",
      "profilingPreset",
      "profilingReadbackStrategy",
      "profilingRepetitions",
      "profilingGateStatus",
      "profilingSpotCheckStatus",
      "profilingMismatchStatus",
      "profilingTimingSource",
      "profilingPhaseBreakdown",
      "profilingInterpretation",
      "profilingStats",
      "profilingStrategyComparison",
      "profilingDispatchPreview",
      "downloadProfilingResult",
      "downloadProfilingSummary",
      "profilingHistoryBody",
      "workgroupSizeSelect",
      "workgroupRepetitionSelect",
      "workgroupReference",
      "workgroupSelected",
      "workgroupPipelineKey",
      "workgroupChunkWorkgroups",
      "workgroupTotalInvocations",
      "workgroupCorrectnessEligibility",
      "workgroupPerformanceEligibility",
      "workgroupRecommendation",
      "workgroupCurrentAction",
      "workgroupActionStatus",
      "workgroupLastCompletedAction",
      "workgroupStatusBody",
      "workgroupExperimentDetails",
      "compileWorkgroupVariant",
      "runWorkgroupSmallGate",
      "runWorkgroupFull294",
      "runWorkgroupPerformance",
      "runMatchedWorkgroupComparison",
      "downloadWorkgroupExperiment",
      "downloadMatchedWorkgroupComparison",
      "clearSelectedWorkgroupHistory",
      "clearWorkgroupHistory",
      "clearMatchedWorkgroupComparison",
      "guidedWorkgroupSize",
      "guidedWorkgroupPipeline",
      "guidedWorkgroupDevice",
      "guidedWorkgroupCompile",
      "guidedWorkgroupSmallGate",
      "guidedWorkgroupFull294",
      "guidedWorkgroupPerformance",
      "guidedWorkgroupProfile",
      "guidedWorkgroupRecommendation",
      "workgroupChecklist",
      "runRecommendedCorrectnessSequence",
      "guidedCompileWorkgroup",
      "guidedRunSmallGate",
      "guidedRunFull294",
      "guidedRunPerformance",
      "guidedWorkgroupDisabledReason",
      "guidedWorkgroupProgress",
      "matchedWg1Checklist",
      "matchedWg32Checklist",
      "guidedMatchedRepetitions",
      "matchedExecutionOrder",
      "prepareMatchedWorkgroups",
      "guidedRunMatchedComparison",
      "matchedDisabledReason",
      "matchedProgress",
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindControls() {
  for (const preset of WGSL_CORE_VERIFICATION_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    els.wgslPresetSelect.append(option);
  }
  els.wgslPresetSelect.value = state.wgslPresetId;
  els.wgslPresetWarning.textContent = wgslPresetWarning();
  els.wgslPresetSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.wgslPresetId = els.wgslPresetSelect.value;
    state.whirlpoolResult = null;
    state.whirlpoolProgress = null;
    state.coreWgslComparison = null;
    renderBenchmark();
    els.wgslPresetWarning.textContent = wgslPresetWarning();
    setStatus(`WGSL/Core preset selected: ${selectedWgslPreset().label}`, "neutral");
  });

  for (const batchSize of WGSL_BATCH_SIZE_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(batchSize);
    option.textContent = String(batchSize);
    els.wgslBatchSizeSelect.append(option);
  }
  els.wgslBatchSizeSelect.value = String(state.wgslBatchSize);
  els.wgslBatchSizeSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.wgslBatchSize = Number.parseInt(els.wgslBatchSizeSelect.value, 10) || DEFAULT_WGSL_BATCH_SIZE;
    state.whirlpoolResult = null;
    state.whirlpoolProgress = null;
    state.coreWgslComparison = null;
    renderBenchmark();
    els.wgslPresetWarning.textContent = wgslPresetWarning();
    setStatus(`WGSL batch size selected: ${state.wgslBatchSize}`, "neutral");
  });

  for (const hashCount of SYNTHETIC_HASH_COUNT_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(hashCount);
    option.textContent = String(hashCount);
    els.syntheticHashCountSelect.append(option);
  }
  els.syntheticHashCountSelect.value = String(state.syntheticHashCount);
  els.syntheticHashCountSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.syntheticHashCount = Number.parseInt(els.syntheticHashCountSelect.value, 10) || DEFAULT_SYNTHETIC_HASH_COUNT;
    state.syntheticResult = null;
    state.syntheticProgress = null;
    state.syntheticExport = null;
    renderBenchmark();
    setStatus(`Synthetic hash count selected: ${state.syntheticHashCount}`, "neutral");
  });

  for (const batchSize of SYNTHETIC_DISPATCH_BATCH_SIZE_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(batchSize);
    option.textContent = String(batchSize);
    els.syntheticDispatchBatchSizeSelect.append(option);
  }
  els.syntheticDispatchBatchSizeSelect.value = String(state.syntheticDispatchBatchSize);
  els.syntheticDispatchBatchSizeSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.syntheticDispatchBatchSize = Number.parseInt(els.syntheticDispatchBatchSizeSelect.value, 10) || DEFAULT_SYNTHETIC_DISPATCH_BATCH_SIZE;
    state.syntheticResult = null;
    state.syntheticProgress = null;
    state.syntheticExport = null;
    renderBenchmark();
    setStatus(`Synthetic dispatch batch size selected: ${state.syntheticDispatchBatchSize}`, "neutral");
  });

  for (const preset of PROFILING_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    els.profilingPresetSelect.append(option);
  }
  els.profilingPresetSelect.value = state.profilingPresetId;
  els.profilingPresetSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.profilingPresetId = els.profilingPresetSelect.value;
    state.profilingResult = null;
    state.profilingExport = null;
    state.profilingSummaryExport = null;
    renderBenchmark();
    setStatus(`Synthetic profiling preset selected: ${profilingPresetById(state.profilingPresetId).label}`, "neutral");
  });

  for (const strategy of Object.values(PROFILING_READBACK_STRATEGIES)) {
    const option = document.createElement("option");
    option.value = strategy.id;
    option.textContent = strategy.implemented ? strategy.label : `${strategy.label} (documented, not implemented)`;
    option.disabled = !strategy.implemented;
    els.profilingReadbackStrategySelect.append(option);
  }
  els.profilingReadbackStrategySelect.value = state.profilingReadbackStrategyId;
  els.profilingReadbackStrategySelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.profilingReadbackStrategyId = els.profilingReadbackStrategySelect.value;
    state.profilingResult = null;
    state.profilingExport = null;
    state.profilingSummaryExport = null;
    renderBenchmark();
    setStatus(`Synthetic profiling readback strategy selected: ${PROFILING_READBACK_STRATEGIES[state.profilingReadbackStrategyId].label}`, "neutral");
  });

  for (const repetitions of PROFILING_REPETITION_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(repetitions);
    option.textContent = String(repetitions);
    els.profilingRepetitionSelect.append(option);
  }
  els.profilingRepetitionSelect.value = String(state.profilingRepetitions);
  els.profilingRepetitionSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.profilingRepetitions = Number.parseInt(els.profilingRepetitionSelect.value, 10) || DEFAULT_PROFILING_REPETITIONS;
    state.profilingResult = null;
    state.profilingExport = null;
    state.profilingSummaryExport = null;
    renderBenchmark();
    setStatus(`Synthetic profiling repetitions selected: ${state.profilingRepetitions}`, "neutral");
  });

  for (const size of WORKGROUP_SIZE_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = size === 1 ? "1 (verified reference)" : String(size);
    els.workgroupSizeSelect.append(option);
  }
  els.workgroupSizeSelect.value = String(state.workgroupSize);
  els.workgroupSizeSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.workgroupSize = Number.parseInt(els.workgroupSizeSelect.value, 10) || DEFAULT_EXPERIMENT_WORKGROUP_SIZE;
    state.workgroupResult = null;
    state.workgroupExport = null;
    renderBenchmark();
    setStatus(`Workgroup experiment size selected: ${state.workgroupSize}`, "neutral");
  });

  for (const repetitions of WORKGROUP_EXPERIMENT_REPETITION_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(repetitions);
    option.textContent = String(repetitions);
    els.workgroupRepetitionSelect.append(option);
    const guidedOption = document.createElement("option");
    guidedOption.value = String(repetitions);
    guidedOption.textContent = String(repetitions);
    els.guidedMatchedRepetitions.append(guidedOption);
  }
  els.workgroupRepetitionSelect.value = String(state.workgroupRepetitions);
  els.guidedMatchedRepetitions.value = String(state.workgroupRepetitions);
  els.workgroupRepetitionSelect.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.workgroupRepetitions = Number.parseInt(els.workgroupRepetitionSelect.value, 10) || 3;
    els.guidedMatchedRepetitions.value = String(state.workgroupRepetitions);
    renderBenchmark();
    setStatus(`Workgroup experiment repetitions selected: ${state.workgroupRepetitions}`, "neutral");
  });
  els.guidedMatchedRepetitions.addEventListener("change", () => {
    if (state.benchmark.running) return;
    state.workgroupRepetitions = Number.parseInt(els.guidedMatchedRepetitions.value, 10) || 3;
    els.workgroupRepetitionSelect.value = String(state.workgroupRepetitions);
    renderBenchmark();
    setStatus(`Matched comparison repetitions selected: ${state.workgroupRepetitions}`, "neutral");
  });

  els.guidedModeButton.addEventListener("click", () => setUiMode(UI_MODES.guided));
  els.advancedModeButton.addEventListener("click", () => setUiMode(UI_MODES.advanced));
  els.resetBrowserTestSession.addEventListener("click", resetCurrentBrowserTestSession);
  document.querySelectorAll("[data-test-type]").forEach((button) => {
    button.addEventListener("click", () => setTestType(button.dataset.testType));
  });
  els.runRecommendedAction.addEventListener("click", runRecommendedWorkflowAction);

  document.querySelectorAll("[data-duration-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.benchmark.running) return;
      state.durationMode = button.dataset.durationMode;
      document.querySelectorAll("[data-duration-mode]").forEach((el) => {
        el.classList.toggle("active", el === button);
      });
      state.benchmark.durationMode = state.durationMode;
      renderBenchmark();
      setStatus(`Duration selected: ${DURATION_MODES[state.durationMode].label}`, "neutral");
    });
  });

  document.querySelectorAll("[data-execution-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.benchmark.running) return;
      state.executionMode = button.dataset.executionMode;
      state.benchmark.executionMode = state.executionMode;
      state.plumbingResult = null;
      state.whirlpoolResult = null;
      state.whirlpoolProgress = null;
      state.syntheticResult = null;
      state.syntheticProgress = null;
      state.syntheticExport = null;
      state.profilingResult = null;
      state.profilingProgress = null;
      state.profilingExport = null;
      state.profilingSummaryExport = null;
      state.workgroupResult = null;
      state.workgroupExport = null;
      state.coreWgslComparison = null;
      document.querySelectorAll("[data-execution-mode]").forEach((el) => {
        el.classList.toggle("active", el === button);
      });
      renderBenchmark();
      setStatus(`Execution mode selected: ${EXECUTION_MODES[state.executionMode].label}`, "neutral");
    });
  });

  els.start.addEventListener("click", startBenchmark);
  els.stop.addEventListener("click", () => stopBenchmark());
  els.copySyntheticResult.addEventListener("click", copySyntheticResult);
  els.downloadSyntheticResult.addEventListener("click", downloadSyntheticResult);
  els.downloadSyntheticSummary.addEventListener("click", downloadSyntheticSummary);
  els.downloadProfilingResult.addEventListener("click", downloadProfilingResult);
  els.downloadProfilingSummary.addEventListener("click", downloadProfilingSummary);
  els.compileWorkgroupVariant.addEventListener("click", runWorkgroupCompileAction);
  els.runWorkgroupSmallGate.addEventListener("click", runWorkgroupSmallGateAction);
  els.runWorkgroupFull294.addEventListener("click", runWorkgroupFull294Action);
  els.runWorkgroupPerformance.addEventListener("click", runWorkgroupPerformanceAction);
  els.runMatchedWorkgroupComparison.addEventListener("click", runMatchedWorkgroupComparisonAction);
  els.guidedCompileWorkgroup.addEventListener("click", runWorkgroupCompileAction);
  els.guidedRunSmallGate.addEventListener("click", runWorkgroupSmallGateAction);
  els.guidedRunFull294.addEventListener("click", runWorkgroupFull294Action);
  els.guidedRunPerformance.addEventListener("click", runWorkgroupPerformanceAction);
  els.guidedRunMatchedComparison.addEventListener("click", runMatchedWorkgroupComparisonAction);
  els.runRecommendedCorrectnessSequence.addEventListener("click", () => runRecommendedCorrectnessSequence(state.workgroupSize));
  els.prepareMatchedWorkgroups.addEventListener("click", prepareMatchedWorkgroups);
  els.downloadWorkgroupExperiment.addEventListener("click", downloadWorkgroupExperiment);
  els.downloadMatchedWorkgroupComparison.addEventListener("click", downloadMatchedWorkgroupComparison);
  els.clearSelectedWorkgroupHistory.addEventListener("click", () => {
    state.workgroupProfileHistoryBySize[state.workgroupSize] = [];
    renderBenchmark();
    setStatus(`Cleared current-session WG${state.workgroupSize} profile history`, "neutral");
  });
  els.clearWorkgroupHistory.addEventListener("click", () => {
    state.workgroupProfileHistoryBySize = Object.fromEntries(WORKGROUP_SIZE_OPTIONS.map((size) => [size, []]));
    renderBenchmark();
    setStatus("Cleared current-session workgroup profile history", "neutral");
  });
  els.clearMatchedWorkgroupComparison.addEventListener("click", () => {
    state.workgroupMatchedComparison = null;
    state.workgroupMatchedComparisonExport = null;
    renderBenchmark();
    setStatus("Cleared current-session matched workgroup comparison", "neutral");
  });
  els.clearSyntheticHistory.addEventListener("click", () => {
    state.syntheticHistory = clearSyntheticHistory();
    state.syntheticRunExports = [];
    state.syntheticRepeatedSummary = null;
    renderSyntheticHistory();
    renderSyntheticRepeatedSummary();
    setStatus("Synthetic session history cleared", "neutral");
  });
}

export async function main() {
  collectElements();
  bindControls();
  state.correctness = runCorrectnessTests();
  await loadCoreVectorStatus();
  renderCorrectness();
  renderBenchmark();
  setStatus(state.correctness.pass ? "Ready" : "Correctness failure", state.correctness.pass ? "good" : "bad");
  state.capabilities = await detectWebGPUCapabilities();
  renderCapabilities();
}

main();
