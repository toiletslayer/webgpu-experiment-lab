export const WEBMCP_VERIFICATION_LEVELS = Object.freeze({
  minimal: "minimal",
  full294: "full_294",
});

export const WEBMCP_TOOL_SCHEMAS = Object.freeze({
  inspectComputeEnvironment: Object.freeze({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
  verifyCorrectness: Object.freeze({
    type: "object",
    properties: {
      verification_level: {
        type: "string",
        enum: Object.freeze(Object.values(WEBMCP_VERIFICATION_LEVELS)),
        description: "Run the minimal one-vector proof or the full 294-vector WGSL/Core verification.",
      },
    },
    required: Object.freeze(["verification_level"]),
    additionalProperties: false,
  }),
  startWorkgroupComparison: Object.freeze({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
  getExperimentStatus: Object.freeze({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
});

export const WEBMCP_WORKGROUP_COMPARISON_REPETITIONS = 3;

export const WEBMCP_WORKGROUP_COMPARISON_CONSENT = Object.freeze({
  required: true,
  localOnly: true,
  hashesPerProfile: 8192,
  repetitionsPerSize: WEBMCP_WORKGROUP_COMPARISON_REPETITIONS,
  totalMatchedSamples: 6,
  totalProfiledHashes: 49152,
  warning: "Already-submitted GPU dispatches cannot necessarily be interrupted. No network, pool, wallet, payout, RPC, or block-submission service is used.",
});

export const WEBMCP_WORKGROUP_COMPARISON_STAGES = Object.freeze({
  awaitingConsent: "awaiting_consent",
  queued: "queued",
  wg1Compile: "wg1_compile",
  wg1SmallGate: "wg1_small_gate",
  wg1Full294: "wg1_full_294",
  wg32Compile: "wg32_compile",
  wg32SmallGate: "wg32_small_gate",
  wg32Full294: "wg32_full_294",
  matchedComparison: "matched_comparison",
  completed: "completed",
  declined: "declined",
  failed: "failed",
});

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function buildComputeEnvironmentResult({
  capabilities,
  userAgent,
  verificationPresets,
  batchSizes,
  workgroupSizes,
  running,
  currentExperiment,
}) {
  const caps = capabilities || {};
  return {
    webgpu: {
      supported: caps.supported === true,
      adapterAvailable: caps.adapterAvailable === true,
      adapterInfo: caps.adapterInfo || null,
      limits: caps.limits || null,
      features: Array.isArray(caps.features) ? [...caps.features] : [],
      error: caps.error || null,
    },
    browser: {
      userAgent: userAgent || "Unavailable",
    },
    supportedExperiments: {
      correctnessVerification: {
        levels: [
          { id: WEBMCP_VERIFICATION_LEVELS.minimal, selectedVectors: 1 },
          { id: WEBMCP_VERIFICATION_LEVELS.full294, selectedVectors: 294 },
        ],
        presets: (verificationPresets || []).map((preset) => ({
          id: preset.id,
          label: preset.label,
          fullVector: preset.fullVector === true,
        })),
        batchSizes: [...(batchSizes || [])],
        workgroupSizes: [...(workgroupSizes || [])],
      },
      matchedWorkgroupComparison: {
        sizes: [1, 32],
        repetitionsPerSize: WEBMCP_WORKGROUP_COMPARISON_REPETITIONS,
        asynchronous: true,
        prerequisiteAware: true,
        prerequisites: ["compile_device_validation", "small_correctness_gate", "full_294_vector_verification"],
        recommendationUsesExistingThresholds: true,
      },
    },
    experiment: {
      running: running === true,
      current: currentExperiment || null,
    },
    boundaries: {
      correctnessOnly: false,
      correctnessGatedProfilingOnly: true,
      automaticOrBackgroundComputation: false,
      liveMining: false,
      networkMining: false,
      walletAccess: false,
      poolOrStratum: false,
    },
  };
}

export function buildVerificationResult({
  verificationLevel,
  preset,
  experiment,
  result,
  coreComparison,
}) {
  const cpuMismatchCount = Number.isFinite(result?.mismatchesAgainstCpuReference)
    ? result.mismatchesAgainstCpuReference
    : 0;
  const coreMismatches = Array.isArray(coreComparison?.mismatches) ? coreComparison.mismatches : [];
  const selectedVectors = Number.isFinite(coreComparison?.selectedVectorCount)
    ? coreComparison.selectedVectorCount
    : Number.isFinite(result?.resultCount)
    ? result.resultCount
    : 0;
  const matches = Number.isFinite(coreComparison?.matches) ? coreComparison.matches : 0;
  const pipelineFailure = result?.firstPipelineError?.error || null;
  const failures = [];

  if (experiment?.error) failures.push({ code: "execution_error", message: experiment.error });
  if (pipelineFailure) failures.push({ code: "pipeline_error", message: pipelineFailure });
  if (!coreComparison) failures.push({ code: "core_comparison_missing", message: "WGSL output was not compared with loaded CapStash Core vectors." });
  if (coreComparison?.pending) failures.push({ code: "core_comparison_pending", message: coreComparison.message || "CapStash Core comparison is pending." });
  if (cpuMismatchCount > 0) failures.push({ code: "cpu_mismatch", message: `${cpuMismatchCount} WGSL/CPU mismatch(es) detected.` });
  if (coreMismatches.length > 0) failures.push({ code: "core_mismatch", message: `${coreMismatches.length} WGSL/Core mismatch(es) detected.` });
  if (selectedVectors === 0) failures.push({ code: "no_results", message: "The verification returned zero selected vectors." });
  if (matches !== selectedVectors) failures.push({ code: "incomplete_match", message: `${matches} of ${selectedVectors} selected vectors matched Core.` });
  if (verificationLevel === WEBMCP_VERIFICATION_LEVELS.full294 && selectedVectors !== 294) {
    failures.push({ code: "full_vector_count_invalid", message: `Full verification selected ${selectedVectors} vectors instead of 294.` });
  }

  const executionState = experiment?.status || "not_run";
  const success = executionState === "completed" && failures.length === 0;
  return {
    success,
    verificationLevel,
    preset: preset
      ? { id: preset.id, label: preset.label, fullVector: preset.fullVector === true }
      : null,
    selectedVectors,
    matches,
    mismatches: {
      total: Math.max(cpuMismatchCount, coreMismatches.length),
      cpuReference: cpuMismatchCount,
      coreReference: coreMismatches.length,
      first: coreMismatches[0] || result?.firstMismatch || null,
    },
    execution: {
      state: executionState,
      running: executionState === "running",
      source: experiment?.source || null,
      startedAt: experiment?.startedAt || null,
      completedAt: experiment?.completedAt || null,
    },
    result: result
      ? {
          shaderStatus: result.shaderStatus || null,
          resultCount: result.resultCount || 0,
          dispatchCount: result.dispatchCount || 0,
          batchSize: result.batchSize || null,
          workgroupSize: result.workgroupSize || null,
          fixtureCasesExecuted: result.fixtureCasesExecuted || 0,
          fixtureCasesRejected: result.fixtureCasesRejected || 0,
          pipelineError: pipelineFailure,
        }
      : null,
    failures,
    boundaries: {
      correctnessOnly: true,
      performanceBenchmark: false,
      liveMining: false,
      networkMining: false,
      targetComparison: false,
      externalNetworkServices: false,
      walletAccess: false,
      poolOrStratum: false,
    },
  };
}

export function buildExperimentStatusResult({ running, current, mostRecent, verificationResult, workgroupComparisonResult }) {
  return {
    running: running === true,
    current: current || null,
    mostRecent: mostRecent || null,
    correctnessVerification: verificationResult || null,
    workgroupComparison: workgroupComparisonResult || null,
  };
}

function workgroupPrerequisiteStatus(status = {}) {
  return {
    deviceSupport: status.deviceSupport || "not checked",
    pipeline: status.pipeline || "not compiled",
    compilePassed: status.pipeline === "compiled" && status.deviceSupport === "supported",
    smallGate: status.smallGate || "not run",
    smallGatePassed: status.smallGate === "passed",
    full294: status.full294 || "pending",
    full294Passed: status.full294 === "passed" && status.currentSessionFull294Passed === true,
    full294Matches: status.full294Matches ?? null,
    full294Mismatches: status.full294Mismatches ?? null,
  };
}

function compactMetricStats(stats) {
  if (!stats) return null;
  return {
    mean: stats.mean ?? null,
    median: stats.median ?? null,
    min: stats.min ?? null,
    max: stats.max ?? null,
    sampleCoefficientOfVariation: stats.sampleCoefficientOfVariation ?? null,
  };
}

function compactWorkgroupMeasurements(aggregate) {
  if (!aggregate) return null;
  return {
    validRepetitionCount: aggregate.validRepetitionCount || 0,
    invalidRepetitionCount: aggregate.invalidRepetitionCount || 0,
    totalElapsedMs: compactMetricStats(aggregate.totalElapsedMs),
    queueCompletionWaitMs: compactMetricStats(aggregate.queueCompletionWaitMs),
    cpuValidationMs: compactMetricStats(aggregate.cpuValidationMs),
    hashesPerSecondIncludingPipeline: compactMetricStats(aggregate.hashesPerSecondIncludingPipeline),
  };
}

function compactAction(action) {
  if (!action) return null;
  return {
    status: action.status || null,
    requestedActionType: action.requestedActionType || null,
    startedActionType: action.startedActionType || null,
    workgroupSize: action.workgroupSize ?? null,
    startedAt: action.actionStartTimestamp || null,
  };
}

export function buildWorkgroupComparisonStatus({
  experiment,
  statuses = {},
  currentAction = null,
  comparison = null,
} = {}) {
  if (!experiment) return null;
  const matchedStatus = comparison?.matchedComparisonStatus || null;
  const recommendationAllowed = matchedStatus?.recommendationEligible === true;
  const blockers = Array.isArray(comparison?.recommendationBlockers)
    ? comparison.recommendationBlockers
    : [];
  const samples = Array.isArray(comparison?.samples) ? comparison.samples : [];
  const correctnessFailures = samples
    .filter((sample) => !sample?.valid || sample?.mismatchCount > 0 || sample?.pipelineError)
    .map((sample) => ({
      workgroupSize: sample.workgroupSize ?? null,
      repetitionIndex: sample.repetitionIndex ?? null,
      issues: sample.issues || [],
      mismatchCount: sample.mismatchCount || 0,
      pipelineError: sample.pipelineError || null,
    }));
  return {
    experimentId: experiment.id,
    type: experiment.type,
    source: experiment.source,
    state: experiment.status,
    stage: experiment.stage,
    running: experiment.status === "running",
    startedAt: experiment.startedAt || null,
    completedAt: experiment.completedAt || null,
    plannedRepetitions: experiment.plannedRepetitions,
    completedRepetitions: {
      total: experiment.completedRepetitions?.total || 0,
      wg1: experiment.completedRepetitions?.wg1 || 0,
      wg32: experiment.completedRepetitions?.wg32 || 0,
    },
    currentAction: compactAction(currentAction),
    prerequisites: {
      wg1: workgroupPrerequisiteStatus(statuses[1]),
      wg32: workgroupPrerequisiteStatus(statuses[32]),
    },
    measurements: comparison
      ? {
          wg1: compactWorkgroupMeasurements(comparison.aggregate?.[1]),
          wg32: compactWorkgroupMeasurements(comparison.aggregate?.[32]),
          differences: comparison.differences || null,
          thresholds: comparison.thresholds || null,
          executedProfilingAccounting: comparison.executedProfilingAccounting?.combined || null,
        }
      : null,
    correctnessFailures,
    recommendation: comparison
      ? {
          classification: comparison.interpretation?.classification || matchedStatus?.classification || null,
          recommendationAllowed,
          recommendation: recommendationAllowed
            ? comparison.interpretation?.classification || matchedStatus?.classification || null
            : null,
          message: comparison.interpretation?.message || null,
          blockers,
        }
      : null,
    comparisonStatus: matchedStatus,
    errors: experiment.error ? [{ code: "experiment_failed", message: experiment.error }] : [],
    boundaries: {
      liveMining: false,
      networkMining: false,
      targetComparison: false,
      poolOrStratum: false,
      walletAccess: false,
      externalNetworkServices: false,
      browserObservedProfiling: true,
      matchedWorkgroupComparison: true,
    },
  };
}

export function buildStartWorkgroupComparisonResult({ experiment, conflict = null, reason = null } = {}) {
  if (conflict) {
    return {
      accepted: false,
      state: "blocked",
      experimentId: null,
      reason: reason || "Another experiment is already running.",
      conflictingExperiment: conflict,
    };
  }
  return {
    accepted: true,
    state: experiment?.status || "running",
    experimentId: experiment?.id || null,
    stage: experiment?.stage || WEBMCP_WORKGROUP_COMPARISON_STAGES.queued,
    plannedRepetitions: experiment?.plannedRepetitions || WEBMCP_WORKGROUP_COMPARISON_REPETITIONS,
    message: "The existing prerequisite-aware WG1-vs-WG32 workflow started asynchronously. Poll get_experiment_status for progress and results.",
  };
}

export function buildWorkgroupComparisonConsentDeclinedResult(reason = "The user declined the local GPU workload.") {
  return {
    accepted: false,
    state: WEBMCP_WORKGROUP_COMPARISON_STAGES.declined,
    experimentId: null,
    reason,
    consent: WEBMCP_WORKGROUP_COMPARISON_CONSENT,
  };
}

export function buildWorkgroupComparisonConsentPendingResult() {
  return {
    accepted: false,
    requestAccepted: true,
    workloadStarted: false,
    state: WEBMCP_WORKGROUP_COMPARISON_STAGES.awaitingConsent,
    experimentId: null,
    message: "A visible page confirmation is awaiting the user. No verification or profiling workload has started. After a decision, poll get_experiment_status.",
    consent: WEBMCP_WORKGROUP_COMPARISON_CONSENT,
  };
}

export async function runAfterWorkgroupComparisonConsent({ requestConsent, startApprovedWorkload } = {}) {
  if (typeof requestConsent !== "function" || typeof startApprovedWorkload !== "function") {
    throw new TypeError("Consent and approved-workload handlers are required");
  }
  const approved = await requestConsent();
  if (!approved) return buildWorkgroupComparisonConsentDeclinedResult();
  return startApprovedWorkload();
}

export function admitWorkgroupComparisonStart({ running, currentExperiment = null, experiment = null } = {}) {
  return buildStartWorkgroupComparisonResult({
    experiment: running ? null : experiment,
    conflict: running ? currentExperiment || { type: "unknown_experiment" } : null,
  });
}

export async function runWorkgroupComparisonPrerequisites({
  readPrerequisites,
  runPrerequisite,
  onStage = () => {},
} = {}) {
  const plan = [
    { size: 1, key: "compilePassed", action: "compile-selected-variant", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg1Compile },
    { size: 1, key: "smallGatePassed", action: "small-correctness-gate", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg1SmallGate },
    { size: 1, key: "full294Passed", action: "full-294-vector-verification", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg1Full294 },
    { size: 32, key: "compilePassed", action: "compile-selected-variant", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg32Compile },
    { size: 32, key: "smallGatePassed", action: "small-correctness-gate", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg32SmallGate },
    { size: 32, key: "full294Passed", action: "full-294-vector-verification", stage: WEBMCP_WORKGROUP_COMPARISON_STAGES.wg32Full294 },
  ];
  for (const step of plan) {
    if (readPrerequisites(step.size)?.[step.key] === true) continue;
    onStage(step.stage, { workgroupSize: step.size, action: step.action });
    await runPrerequisite(step);
    if (readPrerequisites(step.size)?.[step.key] !== true) {
      throw new Error(`WG${step.size} prerequisite failed at ${step.stage}`);
    }
  }
  return true;
}

export async function runPrerequisiteAwareWorkgroupComparison({
  readPrerequisites,
  runPrerequisite,
  runMatchedComparison,
  onStage = () => {},
} = {}) {
  await runWorkgroupComparisonPrerequisites({ readPrerequisites, runPrerequisite, onStage });
  onStage(WEBMCP_WORKGROUP_COMPARISON_STAGES.matchedComparison, { action: "matched-wg1-wg32-comparison" });
  return runMatchedComparison();
}

export function createWebMCPChallengeTools(handlers) {
  if (!handlers?.inspectComputeEnvironment || !handlers?.verifyCorrectness || !handlers?.startWorkgroupComparison || !handlers?.getExperimentStatus) {
    throw new TypeError("WebMCP challenge tool handlers are required");
  }

  return [
    {
      name: "inspect_compute_environment",
      title: "Inspect compute environment",
      description: "Inspect current browser WebGPU support, adapter/device information, supported correctness experiments, and whether computation is running. This tool never starts a workload.",
      inputSchema: WEBMCP_TOOL_SCHEMAS.inspectComputeEnvironment,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (_arguments = {}, options = {}) => handlers.inspectComputeEnvironment({ signal: options.signal }),
    },
    {
      name: "start_workgroup_comparison",
      title: "Start WG1-vs-WG32 comparison",
      description: "After visible user approval, start the existing local prerequisite-aware WG1-vs-WG32 correctness and profiling workflow asynchronously. Poll get_experiment_status for progress and the conservative result.",
      inputSchema: WEBMCP_TOOL_SCHEMAS.startWorkgroupComparison,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (_arguments = {}, options = {}) => handlers.startWorkgroupComparison({ signal: options.signal }),
    },
    {
      name: "verify_correctness",
      title: "Verify WebGPU correctness",
      description: "Run the existing correctness-gated WebGPU verification workflow at the minimal one-vector or full 294-vector level and update the visible application state.",
      inputSchema: WEBMCP_TOOL_SCHEMAS.verifyCorrectness,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (argumentsObject = {}, options = {}) => {
        const verificationLevel = argumentsObject.verification_level;
        if (!Object.values(WEBMCP_VERIFICATION_LEVELS).includes(verificationLevel)) {
          throw new TypeError(`Unsupported verification_level: ${verificationLevel}`);
        }
        return handlers.verifyCorrectness({ verificationLevel, signal: options.signal });
      },
    },
    {
      name: "get_experiment_status",
      title: "Get experiment status",
      description: "Return the current or most recent shared correctness or workgroup-comparison experiment state and structured result without starting computation.",
      inputSchema: WEBMCP_TOOL_SCHEMAS.getExperimentStatus,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (_arguments = {}, options = {}) => handlers.getExperimentStatus({ signal: options.signal }),
    },
  ];
}

export async function registerWebMCPChallengeTools({ modelContext, handlers } = {}) {
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return {
      available: false,
      status: "unavailable",
      registeredTools: [],
      controller: null,
      error: null,
    };
  }

  const controller = new AbortController();
  const tools = createWebMCPChallengeTools(handlers);
  try {
    for (const tool of tools) {
      await modelContext.registerTool(tool, { signal: controller.signal });
    }
    return {
      available: true,
      status: "registered",
      registeredTools: tools.map((tool) => tool.name),
      controller,
      error: null,
    };
  } catch (error) {
    controller.abort();
    return {
      available: true,
      status: "registration_failed",
      registeredTools: [],
      controller: null,
      error: errorMessage(error),
    };
  }
}
