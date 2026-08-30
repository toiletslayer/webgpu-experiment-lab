function formatMs(ms) {
  return Number.isFinite(ms) ? `${ms.toFixed(1)} ms` : "Not run";
}

function formatObservedAt(value) {
  return value ? ` observed ${value}` : "";
}

export function formatPipelineTimingView(result, diagnostics) {
  if (!result && !diagnostics) {
    return {
      pipelineStatus: "Not run",
      thisRunPipelineCreation: "Not run",
      originalColdCompile: "Not run",
      historicalColdCompileTimestamp: "Not run",
      historicalColdCompileApplies: "Not run",
      shaderGeneration: "Not run",
      shaderModuleCreation: "Not run",
      totalElapsed: "Not run",
    };
  }

  const usedCachedPipeline = Boolean(
    diagnostics?.thisRunUsedCachedPipeline
      ?? diagnostics?.pipelineCacheHit
      ?? result?.pipelineReused,
  );
  const cacheStatus = diagnostics?.pipelineCacheStatus || result?.pipelineCacheStatus || "unknown";
  const pipelineKey = diagnostics?.pipelineKey || "unknown";
  const coldCompileMs = diagnostics?.coldPipelineCreationMs ?? diagnostics?.pipelineCreationMs;
  const coldApplies = diagnostics?.coldPipelineCreationAppliesToCurrentRun ?? !usedCachedPipeline;
  const thisRunPipelineCreationMs = diagnostics?.thisRunPipelineCreationMs
    ?? (usedCachedPipeline ? 0 : diagnostics?.pipelineCreationMs);
  const thisRunShaderGenerationMs = diagnostics?.thisRunShaderGenerationMs
    ?? (usedCachedPipeline ? 0 : diagnostics?.shaderGenerationMs);
  const thisRunShaderModuleCreationMs = diagnostics?.thisRunShaderModuleCreationMs
    ?? (usedCachedPipeline ? 0 : diagnostics?.shaderModuleCreationMs);

  return {
    pipelineStatus: usedCachedPipeline
      ? `This run pipeline: reused cached pipeline (${cacheStatus}, ${pipelineKey})`
      : `This run pipeline: cold compile (${cacheStatus}, ${pipelineKey})`,
    thisRunPipelineCreation: usedCachedPipeline
      ? "0.0 ms / not recreated"
      : formatMs(thisRunPipelineCreationMs),
    originalColdCompile: Number.isFinite(coldCompileMs)
      ? `${formatMs(coldCompileMs)}; page-session historical observation; ${coldApplies ? "applies to this run" : "does not apply to this cached run"}`
      : "Not run",
    historicalColdCompileTimestamp: diagnostics?.coldPipelineCreationObservedAt || "Not run",
    historicalColdCompileApplies: coldApplies ? "yes" : "no",
    shaderGeneration: formatMs(thisRunShaderGenerationMs),
    shaderModuleCreation: formatMs(thisRunShaderModuleCreationMs),
    totalElapsed: formatMs(diagnostics?.thisRunTotalElapsedMs ?? result?.totalElapsedMs),
  };
}
