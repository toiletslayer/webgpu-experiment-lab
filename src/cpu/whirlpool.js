import { PLAIN_RC, PLAIN_T0 } from "./whirlpool-tables.js";

const MASK64 = 0xffffffffffffffffn;
const BLOCK_BYTES = 64;
const LENGTH_FIELD_BYTES = 32;

function rotl64(value, bits) {
  const shift = BigInt(bits);
  return ((value << shift) | (value >> (64n - shift))) & MASK64;
}

function table(tableIndex, byteValue) {
  const base = PLAIN_T0[byteValue];
  return tableIndex === 0 ? base : rotl64(base, tableIndex * 8);
}

function byteAt(word, index) {
  return Number((word >> BigInt(index * 8)) & 0xffn);
}

function readLe64(bytes, offset) {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + i]);
  }
  return value;
}

function writeLe64(bytes, offset, value) {
  for (let i = 0; i < 8; i += 1) {
    bytes[offset + i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
}

function writeBe64(bytes, offset, value) {
  for (let i = 7; i >= 0; i -= 1) {
    bytes[offset + (7 - i)] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
}

function roundElement(words, i0, i1, i2, i3, i4, i5, i6, i7) {
  return (
    table(0, byteAt(words[i0], 0)) ^
    table(1, byteAt(words[i1], 1)) ^
    table(2, byteAt(words[i2], 2)) ^
    table(3, byteAt(words[i3], 3)) ^
    table(4, byteAt(words[i4], 4)) ^
    table(5, byteAt(words[i5], 5)) ^
    table(6, byteAt(words[i6], 6)) ^
    table(7, byteAt(words[i7], 7))
  ) & MASK64;
}

function whirlpoolRound(words, constants) {
  return [
    roundElement(words, 0, 7, 6, 5, 4, 3, 2, 1) ^ constants[0],
    roundElement(words, 1, 0, 7, 6, 5, 4, 3, 2) ^ constants[1],
    roundElement(words, 2, 1, 0, 7, 6, 5, 4, 3) ^ constants[2],
    roundElement(words, 3, 2, 1, 0, 7, 6, 5, 4) ^ constants[3],
    roundElement(words, 4, 3, 2, 1, 0, 7, 6, 5) ^ constants[4],
    roundElement(words, 5, 4, 3, 2, 1, 0, 7, 6) ^ constants[5],
    roundElement(words, 6, 5, 4, 3, 2, 1, 0, 7) ^ constants[6],
    roundElement(words, 7, 6, 5, 4, 3, 2, 1, 0) ^ constants[7],
  ].map((word) => word & MASK64);
}

function processBlock(state, block) {
  const source = new Array(8);
  for (let i = 0; i < 8; i += 1) {
    source[i] = readLe64(block, i * 8);
  }

  let key = state.slice();
  let data = source.map((word, index) => word ^ key[index]);

  for (let round = 0; round < 10; round += 1) {
    key = whirlpoolRound(key, [PLAIN_RC[round], 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
    data = whirlpoolRound(data, key);
  }

  for (let i = 0; i < 8; i += 1) {
    state[i] = (state[i] ^ data[i] ^ source[i]) & MASK64;
  }
}

export function whirlpool512(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const state = new Array(8).fill(0n);
  let offset = 0;

  while (offset + BLOCK_BYTES <= bytes.length) {
    processBlock(state, bytes.subarray(offset, offset + BLOCK_BYTES));
    offset += BLOCK_BYTES;
  }

  const finalBlock = new Uint8Array(BLOCK_BYTES);
  const remaining = bytes.length - offset;
  finalBlock.set(bytes.subarray(offset), 0);
  finalBlock[remaining] = 0x80;

  if (remaining + 1 > BLOCK_BYTES - LENGTH_FIELD_BYTES) {
    processBlock(state, finalBlock);
    finalBlock.fill(0);
  }

  const bitLength = BigInt(bytes.length) * 8n;
  writeBe64(finalBlock, 32, 0n);
  writeBe64(finalBlock, 40, 0n);
  writeBe64(finalBlock, 48, 0n);
  writeBe64(finalBlock, 56, bitLength);
  processBlock(state, finalBlock);

  const out = new Uint8Array(64);
  for (let i = 0; i < 8; i += 1) {
    writeLe64(out, i * 8, state[i]);
  }
  return out;
}

export function xorFold512To256(bytes64) {
  if (bytes64.length !== 64) {
    throw new Error(`Whirlpool output must be 64 bytes, got ${bytes64.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = bytes64[i] ^ bytes64[i + 32];
  }
  return out;
}
