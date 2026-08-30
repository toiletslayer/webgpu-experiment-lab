import { bytesToHex, capstashPoWInternalHex, hexToBytes, patchNonce, readLe32 } from "../cpu/capstash-pow.js";

export const WEBGPU_PLUMBING_SHADER = `
struct Params {
  nonceStart: u32,
  nonceCount: u32,
};

@group(0) @binding(0) var<storage, read> headerWords: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> outputWords: array<u32>;

fn rotl32(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

fn mix_word(value: u32, lane: u32, nonce: u32) -> u32 {
  var x = value ^ (0x9e3779b9u + lane * 0x85ebca6bu) ^ nonce;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  return x ^ (x >> 16u);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.nonceCount) {
    return;
  }

  let nonce = params.nonceStart + index;
  var acc0 = 0x243f6a88u ^ nonce;
  var acc1 = 0x85a308d3u + index;
  var acc2 = 0x13198a2eu ^ params.nonceCount;
  var acc3 = 0x03707344u;

  for (var i = 0u; i < 20u; i = i + 1u) {
    var word = headerWords[i];
    if (i == 19u) {
      word = nonce;
    }
    acc0 = rotl32(acc0 + mix_word(word, i, nonce), 5u);
    acc1 = rotl32(acc1 ^ (word + i * 0x1000193u), 11u);
    acc2 = acc2 + rotl32(word ^ acc0, 17u);
    acc3 = acc3 ^ mix_word(word + acc1, i + 7u, nonce);
  }

  let base = index * 8u;
  outputWords[base + 0u] = acc0;
  outputWords[base + 1u] = acc1;
  outputWords[base + 2u] = acc2;
  outputWords[base + 3u] = acc3;
  outputWords[base + 4u] = acc0 ^ acc2 ^ nonce;
  outputWords[base + 5u] = acc1 + acc3 + 0x9e3779b9u;
  outputWords[base + 6u] = rotl32(acc2 ^ acc3, 13u);
  outputWords[base + 7u] = acc0 + acc1 + acc2 + acc3;
}
`;

const WORKGROUP_SIZE = 64;

function rotl32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function mixWord(value, lane, nonce) {
  let x = (value ^ (0x9e3779b9 + Math.imul(lane, 0x85ebca6b)) ^ nonce) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function headerBytesToWords(header80) {
  if (header80.length !== 80) {
    throw new Error(`WebGPU plumbing header must be 80 bytes, got ${header80.length}`);
  }
  const words = new Uint32Array(20);
  for (let i = 0; i < words.length; i += 1) {
    words[i] = readLe32(header80, i * 4);
  }
  return words;
}

export function fakePlumbingHashWords(header80, nonce, index = 0, nonceCount = 1) {
  const words = headerBytesToWords(header80);
  let acc0 = (0x243f6a88 ^ nonce) >>> 0;
  let acc1 = (0x85a308d3 + index) >>> 0;
  let acc2 = (0x13198a2e ^ nonceCount) >>> 0;
  let acc3 = 0x03707344;

  for (let i = 0; i < 20; i += 1) {
    const word = i === 19 ? nonce >>> 0 : words[i];
    acc0 = rotl32((acc0 + mixWord(word, i, nonce)) >>> 0, 5);
    acc1 = rotl32((acc1 ^ ((word + Math.imul(i, 0x1000193)) >>> 0)) >>> 0, 11);
    acc2 = (acc2 + rotl32((word ^ acc0) >>> 0, 17)) >>> 0;
    acc3 = (acc3 ^ mixWord((word + acc1) >>> 0, i + 7, nonce)) >>> 0;
  }

  return Uint32Array.from([
    acc0,
    acc1,
    acc2,
    acc3,
    (acc0 ^ acc2 ^ nonce) >>> 0,
    (acc1 + acc3 + 0x9e3779b9) >>> 0,
    rotl32((acc2 ^ acc3) >>> 0, 13),
    (acc0 + acc1 + acc2 + acc3) >>> 0,
  ]);
}

export function fakePlumbingHashHex(header80, nonce, index = 0, nonceCount = 1) {
  return wordsToInternalHashHex(fakePlumbingHashWords(header80, nonce, index, nonceCount));
}

export function wordsToInternalHashHex(words) {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 8; i += 1) {
    view.setUint32(i * 4, words[i], true);
  }
  return bytesToHex(bytes);
}

export function buildCpuReferenceRows(header80, nonceStart, nonceCount) {
  const rows = [];
  for (let i = 0; i < nonceCount; i += 1) {
    const nonce = (nonceStart + i) >>> 0;
    const patched = Uint8Array.from(header80);
    patchNonce(patched, nonce);
    rows.push({
      index: i,
      nonce,
      cpuInternalHex: capstashPoWInternalHex(patched),
      plumbingInternalHex: fakePlumbingHashHex(header80, nonce, i, nonceCount),
    });
  }
  return rows;
}

export function comparePlumbingRowsToCpuReference(rows) {
  return rows.map((row) => ({
    ...row,
    matchesCpuReference: row.plumbingInternalHex === row.cpuInternalHex,
  }));
}

export async function runWebGPUPlumbingProof({ header80, nonceStart = 0, nonceCount = 64, gpu = navigator.gpu } = {}) {
  if (!gpu) {
    throw new Error("navigator.gpu is unavailable; cannot run WebGPU plumbing proof");
  }
  if (nonceCount <= 0) {
    throw new Error("nonceCount must be positive");
  }

  const totalStart = performance.now();
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error("WebGPU requestAdapter returned null");
  }
  const device = await adapter.requestDevice();

  const headerWords = headerBytesToWords(header80);
  const headerBuffer = device.createBuffer({
    size: headerWords.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(headerBuffer, 0, headerWords);

  const paramsArray = new Uint32Array([nonceStart >>> 0, nonceCount >>> 0, 0, 0]);
  const paramsBuffer = device.createBuffer({
    size: paramsArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, paramsArray);

  const outputSize = nonceCount * 8 * Uint32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({ code: WEBGPU_PLUMBING_SHADER });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: shaderModule,
      entryPoint: "main",
    },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: headerBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });

  const dispatchCount = Math.ceil(nonceCount / WORKGROUP_SIZE);
  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(dispatchCount);
  pass.end();
  commandEncoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, outputSize);

  const submitStart = performance.now();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpuElapsedMs = performance.now() - submitStart;

  const readbackStart = performance.now();
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const readbackMs = performance.now() - readbackStart;
  const mapped = readbackBuffer.getMappedRange();
  const outputWords = new Uint32Array(mapped.slice(0));
  readbackBuffer.unmap();

  const results = [];
  const cpuRows = buildCpuReferenceRows(header80, nonceStart, nonceCount);
  for (let i = 0; i < nonceCount; i += 1) {
    const words = outputWords.slice(i * 8, i * 8 + 8);
    const plumbingInternalHex = wordsToInternalHashHex(words);
    const expectedPlumbingInternalHex = cpuRows[i].plumbingInternalHex;
    results.push({
      index: i,
      nonce: (nonceStart + i) >>> 0,
      plumbingInternalHex,
      expectedPlumbingInternalHex,
      cpuInternalHex: cpuRows[i].cpuInternalHex,
      matchesExpectedPlumbing: plumbingInternalHex === expectedPlumbingInternalHex,
      matchesCpuReference: plumbingInternalHex === cpuRows[i].cpuInternalHex,
    });
  }

  return {
    stage: "webgpu-plumbing-only",
    shaderStatus: "temporary deterministic fake shader; not CapStash hashing",
    nonceStart,
    nonceCount,
    dispatchCount,
    resultsPerDispatch: nonceCount / dispatchCount,
    resultCount: results.length,
    mismatchesAgainstExpectedPlumbing: results.filter((row) => !row.matchesExpectedPlumbing).length,
    mismatchesAgainstCpuReference: results.filter((row) => !row.matchesCpuReference).length,
    gpuElapsedMs,
    readbackMs,
    totalElapsedMs: performance.now() - totalStart,
    results,
  };
}
