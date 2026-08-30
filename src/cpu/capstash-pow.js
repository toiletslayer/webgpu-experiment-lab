import { whirlpool512, xorFold512To256 } from "./whirlpool.js";

export const HEADER_LENGTH = 80;

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0) {
    throw new Error("hex input must contain an even number of characters");
  }
  if (!/^[0-9a-f]*$/i.test(clean)) {
    throw new Error("hex input contains a non-hex character");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function reverseBytes(bytes) {
  return Uint8Array.from(bytes).reverse();
}

export function readLe32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

export function writeLe32(bytes, offset, value) {
  const x = Number(value) >>> 0;
  bytes[offset] = x & 0xff;
  bytes[offset + 1] = (x >>> 8) & 0xff;
  bytes[offset + 2] = (x >>> 16) & 0xff;
  bytes[offset + 3] = (x >>> 24) & 0xff;
}

export function uint256DisplayHexToInternalBytes(hex) {
  const bytes = hexToBytes(hex);
  if (bytes.length !== 32) {
    throw new Error(`uint256 display hex must decode to 32 bytes, got ${bytes.length}`);
  }
  return reverseBytes(bytes);
}

export function uint256InternalBytesToDisplayHex(bytes) {
  if (bytes.length !== 32) {
    throw new Error(`uint256 internal value must be 32 bytes, got ${bytes.length}`);
  }
  return bytesToHex(reverseBytes(bytes));
}

export function buildHeader80({
  version,
  previousBlockHash,
  merkleRoot,
  time,
  bits,
  nonce,
}) {
  const header = new Uint8Array(HEADER_LENGTH);
  writeLe32(header, 0, version);
  header.set(uint256DisplayHexToInternalBytes(previousBlockHash), 4);
  header.set(uint256DisplayHexToInternalBytes(merkleRoot), 36);
  writeLe32(header, 68, time);
  writeLe32(header, 72, bits);
  writeLe32(header, 76, nonce);
  return header;
}

export function parseHeader80(header80) {
  if (header80.length !== HEADER_LENGTH) {
    throw new Error(`CapStash block header must be 80 bytes, got ${header80.length}`);
  }
  return {
    version: readLe32(header80, 0),
    previousBlockHash: uint256InternalBytesToDisplayHex(header80.subarray(4, 36)),
    merkleRoot: uint256InternalBytesToDisplayHex(header80.subarray(36, 68)),
    time: readLe32(header80, 68),
    bits: readLe32(header80, 72),
    nonce: readLe32(header80, 76),
  };
}

export function patchNonce(header80, nonce) {
  assertHeader(header80);
  writeLe32(header80, 76, nonce);
}

export function patchTime(header80, time) {
  assertHeader(header80);
  writeLe32(header80, 68, time);
}

export function patchBits(header80, bits) {
  assertHeader(header80);
  writeLe32(header80, 72, bits);
}

export function patchMerkleRoot(header80, merkleRootDisplayHex) {
  assertHeader(header80);
  header80.set(uint256DisplayHexToInternalBytes(merkleRootDisplayHex), 36);
}

export function capstashPoWHashBytes(header80) {
  assertHeader(header80);
  return xorFold512To256(whirlpool512(header80));
}

export function capstashPoWHashHex(header80) {
  return uint256InternalBytesToDisplayHex(capstashPoWHashBytes(header80));
}

export function capstashPoWInternalHex(header80) {
  return bytesToHex(capstashPoWHashBytes(header80));
}

function assertHeader(header80) {
  if (header80.length !== HEADER_LENGTH) {
    throw new Error(`CapStash block header must be 80 bytes, got ${header80.length}`);
  }
}
