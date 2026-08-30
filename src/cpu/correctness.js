import {
  buildHeader80,
  bytesToHex,
  capstashPoWHashHex,
  capstashPoWInternalHex,
  hexToBytes,
} from "./capstash-pow.js";
import { whirlpool512 } from "./whirlpool.js";
import { CAPSTASH_POW_TEST_VECTORS, WHIRLPOOL_TEST_VECTORS } from "../vectors/consensus-vectors.js";

function bytesFromVector(vector) {
  if (Object.hasOwn(vector, "messageText")) {
    return new TextEncoder().encode(vector.messageText);
  }
  return hexToBytes(vector.messageHex);
}

export function runCorrectnessTests() {
  const results = [];

  for (const vector of WHIRLPOOL_TEST_VECTORS) {
    const actual = bytesToHex(whirlpool512(bytesFromVector(vector)));
    results.push({
      name: vector.name,
      expected: vector.whirlpoolHex,
      actual,
      pass: actual === vector.whirlpoolHex,
    });
  }

  for (const vector of CAPSTASH_POW_TEST_VECTORS) {
    const builtHeaderHex = bytesToHex(buildHeader80(vector.header));
    const header = hexToBytes(vector.headerHex);
    const powHashHex = capstashPoWHashHex(header);
    const internalFoldHex = capstashPoWInternalHex(header);
    results.push({
      name: `${vector.name} serialization`,
      expected: vector.headerHex,
      actual: builtHeaderHex,
      pass: builtHeaderHex === vector.headerHex,
    });
    results.push({
      name: `${vector.name} Core-style hash`,
      expected: vector.powHashHex,
      actual: powHashHex,
      pass: powHashHex === vector.powHashHex,
    });
    results.push({
      name: `${vector.name} internal folded bytes`,
      expected: vector.internalFoldHex,
      actual: internalFoldHex,
      pass: internalFoldHex === vector.internalFoldHex,
    });
  }

  return {
    pass: results.every((result) => result.pass),
    results,
  };
}
