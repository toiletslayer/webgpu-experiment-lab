import {
  buildHeader80,
  bytesToHex,
  hexToBytes,
  patchBits,
  patchMerkleRoot,
  patchTime,
} from "../cpu/capstash-pow.js";

function incrementingHeader() {
  return Uint8Array.from({ length: 80 }, (_, index) => index & 0xff);
}

function highBitHeader() {
  return Uint8Array.from({ length: 80 }, (_, index) => 0x80 | (index & 0x7f));
}

function deterministicRandomHeader(seed = 0x43505357) {
  let state = seed >>> 0;
  const bytes = new Uint8Array(80);
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = (state >>> 24) & 0xff;
  }
  return bytes;
}

function mutateHeader(header, mutator) {
  const copy = Uint8Array.from(header);
  mutator(copy);
  return copy;
}

const realisticHeader = buildHeader80({
  version: 4,
  previousBlockHash: "0000000000000000000671b55f7f4c44a34eac18bcf048779942090cb0f941a2",
  merkleRoot: "59f9b41f249b2a7f36cace03a527dfcf8ab1020ff51f097840442fd7d0467d8f",
  time: 0x6655aa10,
  bits: 0x1d00ffff,
  nonce: 0,
});

const nearOverflowHeader = mutateHeader(realisticHeader, () => {});

export const WHIRLPOOL_NONCE_COUNTS = Object.freeze([1, 2, 4, 8, 16]);

export const WHIRLPOOL_HEADER_FIXTURES = Object.freeze([
  {
    id: "zero-header",
    name: "All-zero header except nonce",
    category: "required-1-zero",
    headerHex: "00".repeat(80),
    nonceStart: 0,
    description: "Every byte starts as zero; the shader patches only bytes 76..79 via the nonce word.",
  },
  {
    id: "incrementing-bytes",
    name: "Incrementing byte pattern",
    category: "required-2-incrementing",
    headerHex: bytesToHex(incrementingHeader()),
    nonceStart: 0,
    description: "Bytes are 00..4f before nonce patching.",
  },
  {
    id: "high-bit-bytes",
    name: "High-bit byte pattern",
    category: "required-3-high-bit",
    headerHex: bytesToHex(highBitHeader()),
    nonceStart: 0,
    description: "All bytes have bit 7 set before nonce patching.",
  },
  {
    id: "deterministic-random",
    name: "Deterministic random fixture",
    category: "required-4-deterministic-random",
    headerHex: bytesToHex(deterministicRandomHeader()),
    nonceStart: 0,
    description: "LCG-generated fixed bytes, committed as deterministic fixture data.",
  },
  {
    id: "realistic-fields",
    name: "Realistic-looking CapStash fields",
    category: "required-5-realistic-fields",
    headerHex: bytesToHex(realisticHeader),
    nonceStart: 5,
    description: "Canonical 80-byte field layout with version, previous hash, merkle root, nTime, nBits, and nonce.",
  },
  {
    id: "time-mutated",
    name: "Only nTime changes",
    category: "required-6-time-mutated",
    headerHex: bytesToHex(mutateHeader(realisticHeader, (header) => patchTime(header, 0x6655aa11))),
    nonceStart: 0,
    description: "Matches the realistic fixture except bytes 68..71.",
  },
  {
    id: "bits-mutated",
    name: "Only nBits changes",
    category: "required-7-bits-mutated",
    headerHex: bytesToHex(mutateHeader(realisticHeader, (header) => patchBits(header, 0x1c3fffc0))),
    nonceStart: 0,
    description: "Matches the realistic fixture except bytes 72..75.",
  },
  {
    id: "merkle-mutated",
    name: "Only merkle root changes",
    category: "required-8-merkle-mutated",
    headerHex: bytesToHex(mutateHeader(realisticHeader, (header) => {
      patchMerkleRoot(header, "ffeeddccbbaa99887766554433221100efcdab8967452301fedcba9876543210");
    })),
    nonceStart: 0,
    description: "Matches the realistic fixture except bytes 36..67.",
  },
  {
    id: "near-overflow-nonce",
    name: "Nonce starts near 0xffffffff",
    category: "required-9-near-overflow",
    headerHex: bytesToHex(nearOverflowHeader),
    nonceStart: 0xfffffff0,
    description: "Exercises high nonce values while keeping counts 1, 2, 4, 8, and 16 inside uint32.",
  },
  {
    id: "overflow-rejected",
    name: "Nonce overflow rejection case",
    category: "required-10-overflow-rejected",
    headerHex: bytesToHex(nearOverflowHeader),
    nonceStart: 0xfffffff8,
    expectOverflowAtCounts: Object.freeze([16]),
    description: "Counts up to 8 are safe; count 16 is intentionally rejected to avoid uint32 nonce wrap.",
  },
]);

export function fixtureHeaderBytes(fixture) {
  return hexToBytes(fixture.headerHex);
}
