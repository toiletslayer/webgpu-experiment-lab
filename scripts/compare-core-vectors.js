import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareCoreVectorsToCpu } from "../src/vectors/core-vector-compare.js";

const vectorPath = resolve(process.cwd(), process.argv[2] || "vectors/capstash-core-pow-vectors.json");
const coreData = JSON.parse(readFileSync(vectorPath, "utf8"));
const result = compareCoreVectorsToCpu(coreData);

console.log(JSON.stringify(result, null, 2));

if (!result.pending && result.mismatches.length > 0) {
  process.exitCode = 1;
}
