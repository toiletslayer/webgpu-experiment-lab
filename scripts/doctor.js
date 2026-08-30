import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function checkFile(path, label) {
  const absolute = join(root, path);
  const exists = existsSync(absolute);
  return {
    label,
    path,
    ok: exists,
    detail: exists ? "found" : "missing",
  };
}

function commandVersion(command, args = ["--version"]) {
  try {
    return {
      ok: true,
      detail: execFileSync(command, args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error.code === "ENOENT"
        ? `${command} was not found on PATH`
        : `${command} failed: ${error.message}`,
    };
  }
}

function npmVersion() {
  const direct = os.platform() === "win32"
    ? commandVersion("cmd.exe", ["/c", "npm", "--version"])
    : commandVersion("npm");
  if (direct.ok) return direct;
  if (os.platform() === "win32") {
    return {
      ok: false,
      detail: `${direct.detail}; if PowerShell blocks npm.ps1, try npm.cmd --version`,
    };
  }
  return direct;
}

function dependencyStatus() {
  const packageLockExists = existsSync(join(root, "package-lock.json"));
  const nodeModulesExists = existsSync(join(root, "node_modules"));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const dependencyCount = Object.keys(packageJson.dependencies || {}).length
    + Object.keys(packageJson.devDependencies || {}).length
    + Object.keys(packageJson.optionalDependencies || {}).length;
  if (packageLockExists && dependencyCount === 0) {
    return {
      ok: true,
      detail: "package lock exists and package.json declares no external dependencies",
    };
  }
  if (!packageLockExists && !nodeModulesExists) {
    return {
      ok: true,
      detail: "no external npm dependencies are currently required",
    };
  }
  if (nodeModulesExists) {
    return {
      ok: true,
      detail: "node_modules exists",
    };
  }
  return {
    ok: false,
    detail: "package lock exists but node_modules is missing; run npm install",
  };
}

function vectorStatus() {
  const path = join(root, "vectors", "capstash-core-pow-vectors.json");
  if (!existsSync(path)) {
    return {
      ok: false,
      detail: "vectors/capstash-core-pow-vectors.json is missing",
    };
  }
  const size = statSync(path).size;
  return {
    ok: size > 0,
    detail: `${size.toLocaleString()} bytes`,
  };
}

const checks = [
  { label: "Node.js", ...commandVersion("node") },
  { label: "npm", ...npmVersion() },
  { label: "Operating system", ok: true, detail: `${os.type()} ${os.release()} ${os.arch()}` },
  checkFile("package.json", "package.json"),
  checkFile("index.html", "index.html"),
  checkFile("src/cpu/capstash-pow.js", "CPU PoW reference"),
  checkFile("src/webgpu/whirlpool-minimal.js", "WGSL Whirlpool path"),
  checkFile("src/vectors/core-vector-compare.js", "Core vector comparison logic"),
  checkFile("vectors/capstash-core-pow-vectors.json", "Core vector JSON"),
  { label: "Core vector JSON size", ...vectorStatus() },
  { label: "npm dependencies", ...dependencyStatus() },
];

let failures = 0;
console.log("caps-webgpu doctor");
console.log("==================");
for (const check of checks) {
  const marker = check.ok ? "OK " : "ERR";
  if (!check.ok) failures += 1;
  console.log(`${marker} ${check.label}: ${check.detail}${check.path ? ` (${check.path})` : ""}`);
}

console.log("");
if (failures === 0) {
  console.log("Environment check passed.");
  console.log("Next commands: npm test, npm run compare:core-vectors, npm run dev");
  console.log("For WGSL/Core verification, open the dev server in normal Chrome or Edge, not an embedded browser.");
} else {
  console.log("Environment check found issues.");
  console.log("On Windows, install Node.js LTS, close and reopen PowerShell, then run npm install.");
  console.log("See LOCAL_DEV_SETUP.md for detailed setup and WebGPU troubleshooting.");
  if (globalThis.process) {
    globalThis.process.exitCode = 1;
  }
}
