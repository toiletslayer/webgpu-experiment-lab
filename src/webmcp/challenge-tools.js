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
  getExperimentStatus: Object.freeze({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
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
    },
    experiment: {
      running: running === true,
      current: currentExperiment || null,
    },
    boundaries: {
      correctnessOnly: true,
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

export function buildExperimentStatusResult({ running, current, mostRecent, verificationResult }) {
  return {
    running: running === true,
    current: current || null,
    mostRecent: mostRecent || null,
    correctnessVerification: verificationResult || null,
  };
}

export function createWebMCPChallengeTools(handlers) {
  if (!handlers?.inspectComputeEnvironment || !handlers?.verifyCorrectness || !handlers?.getExperimentStatus) {
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
      description: "Return the current or most recent shared correctness experiment state and structured result without starting computation.",
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
