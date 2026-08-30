export async function detectWebGPUCapabilities() {
  const result = {
    supported: false,
    adapterAvailable: false,
    adapterInfo: null,
    limits: null,
    features: [],
    error: null,
  };

  if (!("gpu" in navigator)) {
    result.error = "navigator.gpu is unavailable";
    return result;
  }

  result.supported = true;

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      result.error = "requestAdapter returned null";
      return result;
    }

    result.adapterAvailable = true;
    result.adapterInfo = adapter.info
      ? {
          vendor: adapter.info.vendor || "",
          architecture: adapter.info.architecture || "",
          device: adapter.info.device || "",
          description: adapter.info.description || "",
        }
      : {};
    const limitKeys = [
      "maxComputeInvocationsPerWorkgroup",
      "maxComputeWorkgroupSizeX",
      "maxComputeWorkgroupSizeY",
      "maxComputeWorkgroupSizeZ",
      "maxComputeWorkgroupsPerDimension",
      "maxStorageBufferBindingSize",
      "maxBufferSize",
    ];
    result.limits = Object.fromEntries(
      limitKeys.map((key) => [key, adapter.limits?.[key] ?? "unavailable"]),
    );
    result.features = [...(adapter.features || [])].sort();
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export function formatAdapterName(capabilities) {
  if (!capabilities.adapterAvailable) return "Unavailable";
  const info = capabilities.adapterInfo || {};
  const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Adapter available";
}
