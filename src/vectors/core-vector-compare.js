import {
  bytesToHex,
  capstashPoWHashHex,
  capstashPoWInternalHex,
  hexToBytes,
  patchNonce,
} from "../cpu/capstash-pow.js";
import { WHIRLPOOL_HEADER_FIXTURES } from "./whirlpool-fixtures.js";
import { buildWhirlpoolFixturePlan } from "../webgpu/whirlpool-fixture-suite.js";

export const CORE_VECTOR_PENDING_STATUS = "pending";
export const CORE_VECTOR_GENERATED_STATUS = "generated";

function fixtureById(fixtures = WHIRLPOOL_HEADER_FIXTURES) {
  return new Map(fixtures.map((fixture) => [fixture.id, fixture]));
}

function safePlanKeySet() {
  return new Set(
    buildWhirlpoolFixturePlan()
      .filter((entry) => entry.safe)
      .map((entry) => `${entry.fixtureId}:${entry.nonceStart}:${entry.nonceCount}`),
  );
}

export function normalizeCoreVectorData(coreData) {
  if (!coreData || typeof coreData !== "object") {
    throw new Error("Core vector data must be a JSON object");
  }
  if (!Array.isArray(coreData.vectors)) {
    throw new Error("Core vector data must contain a vectors array");
  }
  return {
    schemaVersion: coreData.schemaVersion ?? 1,
    status: coreData.status || CORE_VECTOR_PENDING_STATUS,
    generatedAt: coreData.generatedAt || null,
    generator: coreData.generator || {},
    byteOrderNotes: coreData.byteOrderNotes || {},
    limitations: Array.isArray(coreData.limitations) ? coreData.limitations : [],
    vectors: coreData.vectors,
  };
}

export function summarizeCoreVectorData(coreData) {
  const normalized = normalizeCoreVectorData(coreData);
  return {
    status: normalized.status,
    vectorCount: normalized.vectors.length,
    generatedAt: normalized.generatedAt,
    capstashCoreCommit: normalized.generator.capstashCoreCommit || null,
    pending: normalized.status !== CORE_VECTOR_GENERATED_STATUS || normalized.vectors.length === 0,
  };
}

export function compareCoreVectorsToCpu(coreData) {
  const normalized = normalizeCoreVectorData(coreData);
  const fixtureMap = fixtureById();
  const planKeys = safePlanKeySet();

  if (normalized.status !== CORE_VECTOR_GENERATED_STATUS) {
    return {
      status: normalized.status,
      pending: true,
      vectorCount: normalized.vectors.length,
      matches: 0,
      mismatches: [],
      message: "CapStash Core vectors: pending",
    };
  }

  const mismatches = [];
  let matches = 0;

  for (const vector of normalized.vectors) {
    const fixture = fixtureMap.get(vector.fixtureId);
    const nonce = Number(vector.nonce);
    const nonceCount = Number(vector.nonceCount ?? 1);
    const nonceStart = Number(vector.nonceStart);
    const mismatchBase = {
      fixtureId: vector.fixtureId,
      fixtureName: vector.fixtureName,
      nonce,
      patchedHeaderHex: vector.patchedHeaderHex || null,
      coreFoldedHashHex: vector.foldedHashHex || null,
      coreFoldedInternalHex: vector.foldedInternalHex || null,
    };

    if (!fixture) {
      mismatches.push({ ...mismatchBase, reason: "Unknown fixture id" });
      continue;
    }
    if (!planKeys.has(`${vector.fixtureId}:${nonceStart}:${nonceCount}`)) {
      mismatches.push({ ...mismatchBase, reason: "Vector nonce range is not in the safe Milestone 6 fixture plan" });
      continue;
    }
    if (vector.headerHexBeforeNonce !== fixture.headerHex) {
      mismatches.push({ ...mismatchBase, reason: "headerHexBeforeNonce does not match the checked-in fixture header" });
      continue;
    }

    const patched = hexToBytes(fixture.headerHex);
    patchNonce(patched, nonce);
    const patchedHeaderHex = bytesToHex(patched);
    const cpuInternalHex = capstashPoWInternalHex(patched);
    const cpuDisplayHex = capstashPoWHashHex(patched);

    if (vector.patchedHeaderHex !== patchedHeaderHex) {
      mismatches.push({
        ...mismatchBase,
        reason: "Patched header hex mismatch; check nonce byte order at bytes 76..79",
        cpuPatchedHeaderHex: patchedHeaderHex,
      });
      continue;
    }
    if (vector.foldedInternalHex !== cpuInternalHex || vector.foldedHashHex !== cpuDisplayHex) {
      mismatches.push({
        ...mismatchBase,
        reason: "Core folded PoW hash differs from CPU JavaScript reference; check Whirlpool path or uint256 byte order",
        cpuFoldedInternalHex: cpuInternalHex,
        cpuFoldedHashHex: cpuDisplayHex,
      });
      continue;
    }
    matches += 1;
  }

  return {
    status: normalized.status,
    pending: false,
    vectorCount: normalized.vectors.length,
    matches,
    mismatches,
    message: mismatches.length === 0
      ? "CapStash Core vectors match CPU JavaScript reference"
      : "CapStash Core vector mismatch",
  };
}

function vectorCaseKey(vector) {
  return `${vector.fixtureId}:${Number(vector.nonceStart)}:${Number(vector.nonceCount ?? 1)}`;
}

function vectorResultKey(vector) {
  return `${vectorCaseKey(vector)}:${Number(vector.nonce)}`;
}

function cpuHashDetailsForVector(vector) {
  if (!vector.patchedHeaderHex) {
    return {
      cpuFoldedInternalHex: null,
      cpuFoldedHashHex: null,
      cpuMatchesCore: false,
    };
  }
  const patched = hexToBytes(vector.patchedHeaderHex);
  const cpuFoldedInternalHex = capstashPoWInternalHex(patched);
  const cpuFoldedHashHex = capstashPoWHashHex(patched);
  return {
    cpuFoldedInternalHex,
    cpuFoldedHashHex,
    cpuMatchesCore: cpuFoldedInternalHex === vector.foldedInternalHex && cpuFoldedHashHex === vector.foldedHashHex,
  };
}

export function compareCoreVectorsToWgslSuite(coreData, suiteResult, { scope = "all", fullVector = false } = {}) {
  const normalized = normalizeCoreVectorData(coreData);
  if (normalized.status !== CORE_VECTOR_GENERATED_STATUS || normalized.vectors.length === 0) {
    return {
      status: normalized.status,
      pending: true,
      vectorCount: normalized.vectors.length,
      selectedVectorCount: 0,
      matches: 0,
      mismatches: [],
      message: "CapStash Core vectors: pending",
      verificationStatus: fullVector ? "WGSL/Core verification: Full-vector pending" : "WGSL/Core verification: Pending",
    };
  }
  if (!suiteResult?.results) {
    return {
      status: normalized.status,
      pending: false,
      vectorCount: normalized.vectors.length,
      selectedVectorCount: 0,
      matches: 0,
      mismatches: [{ reason: "WGSL suite result is unavailable" }],
      message: "WGSL verification unavailable",
      verificationStatus: fullVector ? "WGSL/Core verification: Full-vector pending" : "WGSL/Core verification: Pending",
    };
  }
  if (suiteResult.firstPipelineError || suiteResult.fixtureCasesFailedBeforeDispatch > 0) {
    return {
      status: normalized.status,
      pending: false,
      vectorCount: normalized.vectors.length,
      selectedVectorCount: 0,
      matches: 0,
      mismatches: [
        {
          reason: "WGSL verification failed before dispatch",
          firstPipelineError: suiteResult.firstPipelineError || null,
        },
      ],
      message: "WGSL verification failed before dispatch",
      verificationStatus: fullVector ? "WGSL/Core verification: Full-vector failed" : "WGSL/Core verification: Failed before dispatch",
    };
  }

  const gpuRows = new Map();
  const executedCaseKeys = new Set();
  for (const caseResult of suiteResult.results.filter((entry) => entry.executed)) {
    const caseKey = `${caseResult.fixtureId}:${Number(caseResult.nonceStart)}:${Number(caseResult.nonceCount)}`;
    executedCaseKeys.add(caseKey);
    for (const row of caseResult.results || []) {
      gpuRows.set(`${caseKey}:${Number(row.nonce)}`, {
        fixtureId: caseResult.fixtureId,
        fixtureName: caseResult.fixtureName,
        nonceStart: Number(caseResult.nonceStart),
        nonceCount: Number(caseResult.nonceCount),
        nonce: row.nonce,
        gpuFoldedInternalHex: row.gpuInternalHex,
        cpuFoldedInternalHex: row.cpuInternalHex,
        batchSize: row.batchSize || null,
        dispatchIndex: Number.isFinite(row.dispatchIndex) ? row.dispatchIndex : null,
        indexWithinDispatch: Number.isFinite(row.indexWithinDispatch) ? row.indexWithinDispatch : null,
      });
    }
  }

  const vectorsToCompare = scope === "executed"
    ? normalized.vectors.filter((vector) => executedCaseKeys.has(vectorCaseKey(vector)))
    : normalized.vectors;

  const mismatches = [];
  let matches = 0;
  for (const [selectedIndex, vector] of vectorsToCompare.entries()) {
    const key = vectorResultKey(vector);
    const gpuRow = gpuRows.get(key);
    const cpuHashDetails = cpuHashDetailsForVector(vector);
    if (!gpuRow) {
      mismatches.push({
        vectorIndex: normalized.vectors.indexOf(vector),
        selectedVectorIndex: selectedIndex,
        fixtureId: vector.fixtureId,
        fixtureName: vector.fixtureName,
        nonceStart: Number(vector.nonceStart),
        nonceCount: Number(vector.nonceCount),
        nonce: Number(vector.nonce),
        patchedHeaderHex: vector.patchedHeaderHex || null,
        coreFoldedHashHex: vector.foldedHashHex || null,
        coreFoldedInternalHex: vector.foldedInternalHex,
        cpuFoldedHashHex: cpuHashDetails.cpuFoldedHashHex,
        cpuFoldedInternalHex: cpuHashDetails.cpuFoldedInternalHex,
        wgslFoldedInternalHex: null,
        batchSize: null,
        dispatchIndex: null,
        indexWithinDispatch: null,
        cpuMatchesCore: cpuHashDetails.cpuMatchesCore,
        byteOrderNote: normalized.byteOrderNotes.foldedInternalHex || "Core internal bytes are compared directly to WGSL folded internal output.",
        reason: "No WGSL result for Core vector nonce",
      });
      continue;
    }
    if (gpuRow.gpuFoldedInternalHex !== vector.foldedInternalHex) {
      mismatches.push({
        vectorIndex: normalized.vectors.indexOf(vector),
        selectedVectorIndex: selectedIndex,
        fixtureId: vector.fixtureId,
        fixtureName: vector.fixtureName,
        nonceStart: Number(vector.nonceStart),
        nonceCount: Number(vector.nonceCount),
        nonce: Number(vector.nonce),
        patchedHeaderHex: vector.patchedHeaderHex || null,
        coreFoldedHashHex: vector.foldedHashHex || null,
        coreFoldedInternalHex: vector.foldedInternalHex,
        cpuFoldedHashHex: cpuHashDetails.cpuFoldedHashHex,
        cpuFoldedInternalHex: gpuRow.cpuFoldedInternalHex,
        wgslFoldedInternalHex: gpuRow.gpuFoldedInternalHex,
        batchSize: gpuRow.batchSize,
        dispatchIndex: gpuRow.dispatchIndex,
        indexWithinDispatch: gpuRow.indexWithinDispatch,
        cpuMatchesCore: cpuHashDetails.cpuMatchesCore,
        byteOrderNote: normalized.byteOrderNotes.foldedInternalHex || "Core internal bytes are compared directly to WGSL folded internal output.",
        reason: "WGSL folded hash differs from CapStash Core vector",
      });
      continue;
    }
    matches += 1;
  }

  return {
    status: normalized.status,
    pending: false,
    vectorCount: normalized.vectors.length,
    selectedVectorCount: vectorsToCompare.length,
    scope,
    matches,
    mismatches,
    message: mismatches.length === 0
      ? scope === "executed"
        ? "WGSL WebGPU outputs match selected CapStash Core vectors"
        : "WGSL WebGPU outputs match CapStash Core vectors"
      : "WGSL WebGPU output mismatch against CapStash Core vectors",
    verificationStatus: mismatches.length === 0
      ? fullVector
        ? "WGSL/Core verification: Full 294-vector pass"
        : "WGSL/Core verification: Passed selected subset"
      : fullVector
      ? "WGSL/Core verification: Full-vector failed"
      : scope === "executed"
      ? "WGSL/Core verification: Failed selected subset"
      : "WGSL/Core verification: Failed hash comparison",
  };
}
