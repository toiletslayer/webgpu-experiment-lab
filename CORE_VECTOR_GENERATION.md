# Core Vector Generation

This repository now includes independent CapStash Core Proof-of-Work vectors.

Current status: `vectors/capstash-core-pow-vectors.json` has `status: "generated"` and was produced from CapStash Core, not from the JavaScript CPU reference.

## Source Used

- Repository: `https://github.com/CapStash/CapStash-Core`
- Branch: `main`
- Commit: `d5443789469376ca3cad2a892ab99978b88a4471`

Relevant Core files inspected:

- `src/primitives/block.h`
- `src/primitives/block.cpp`
- `src/pow.cpp`
- `src/rpc/mining.cpp`
- `src/crypto/whirlpool.h`
- `src/crypto/whirlpool.cpp`
- `src/crypto/whirlpool/whirlpool.c`

## Consensus Path

The generated vectors call:

```cpp
CBlockHeader::GetPoWHash()
```

That Core path hashes exactly this 80-byte header layout:

| Offset | Size | Field | Encoding |
| --- | ---: | --- | --- |
| 0 | 4 | `nVersion` | little-endian `uint32` |
| 4 | 32 | `hashPrevBlock` | internal `uint256` bytes |
| 36 | 32 | `hashMerkleRoot` | internal `uint256` bytes |
| 68 | 4 | `nTime` | little-endian `uint32` |
| 72 | 4 | `nBits` | little-endian `uint32` |
| 76 | 4 | `nNonce` | little-endian `uint32` |

Core applies plain Whirlpool-512 to those 80 bytes, then folds:

```text
folded[i] = whirlpool[i] ^ whirlpool[i + 32], for i = 0..31
```

No SHA-256 or Bitcoin double-SHA path is valid for CapStash PoW.

## Generator

The generator is:

```text
scripts/core_pow_vector_generator.cpp
```

It embeds the Milestone 6 fixture headers and nonce-count plan, patches nonce bytes `76..79` little-endian, constructs a `CBlockHeader`, calls `header.GetPoWHash()`, and emits JSON to stdout.

The generated file is:

```text
vectors/capstash-core-pow-vectors.json
```

This run generated `294` vectors. `whirlpool512Hex` is `null` because the generator was built without `CAPSTASH_CORE_VECTOR_WITH_WHIRLPOOL`; the folded 256-bit PoW values still come directly from Core consensus `GetPoWHash()`.

## Windows Build Record

The generator was compiled beside the local Core checkout using MSVC 2022 `vcvars64.bat` and C++20.

The compile linked:

- `scripts/core_pow_vector_generator.cpp`
- Core `src/primitives/block.cpp`
- Core `src/crypto/whirlpool.cpp`
- Core `src/crypto/whirlpool/whirlpool.c`
- Core `src/uint256.cpp`
- Core `src/util/strencodings.cpp`

Because this standalone vector executable only needs `CBlockHeader::GetPoWHash()`, the local build used tiny link stubs for unused `CBlock::ToString()` and `CBlockHeader::GetHash()` dependencies pulled in by `block.cpp`. The stubs do not participate in `GetPoWHash()` or the emitted folded vectors.

The generator compile defined:

```text
CAPSTASH_CORE_VECTOR_REPO_URL="https://github.com/CapStash/CapStash-Core"
CAPSTASH_CORE_VECTOR_BRANCH="main"
CAPSTASH_CORE_VECTOR_COMMIT="d5443789469376ca3cad2a892ab99978b88a4471"
```

The resulting JSON was written as BOM-free UTF-8.

## Output Fields

Each generated vector includes:

- `fixtureId`
- `fixtureName`
- `headerHexBeforeNonce`
- `nonceStart`
- `nonceCount`
- `nonce`
- `patchedHeaderHex`
- `whirlpool512Hex`
- `foldedInternalHex`
- `foldedHashHex`
- `notes`

Byte order:

- `patchedHeaderHex` is the exact 80 bytes hashed by Core.
- `foldedInternalHex` is raw internal `uint256` byte order.
- `foldedHashHex` is Core display order from `uint256::GetHex()`, reversed relative to internal bytes.

## Comparison

Run:

```bash
npm run compare:core-vectors
npm test
```

Result for this generated file:

- Core vectors loaded: `294`
- CPU JavaScript matches: `294`
- CPU JavaScript mismatches: `0`

In this Codex shell, `npm` was not on `PATH`, so the same comparison and Node test runner were executed through the available Node runtime. The result was equivalent: Core vs CPU JavaScript passed for all `294` vectors and the Node suite passed.

## Browser/WGSL Verification

Browser/manual comparison should check:

1. Core vectors
2. CPU JavaScript reference
3. WGSL WebGPU output

Manual steps:

1. Run `npm run dev`.
2. Open `http://127.0.0.1:8080/`.
3. Select `WebGPU Whirlpool minimal`.
4. Click `Start Benchmark`.
5. Confirm `CPU/Core Matches` is `294 / 294`.
6. Confirm `WGSL Verification Subset` is `1 fixture x 1 nonce` for the default first pass.
7. Confirm `WGSL Against Core` reports `WGSL/Core verification: Passed selected subset; 1 / 1 selected matches, 0 mismatches`.
8. Record shader size, pipeline creation time, timeout setting, and any first pipeline error details.

Observed pre-Milestone-8 embedded-browser attempt:

- Browser: Chrome `149.0.0.0` user agent reported by the in-app browser
- Adapter: `nvidia / blackwell`
- WebGPU support: yes
- Core vectors loaded in UI: `294`
- CPU/Core UI status: `294 matches / 0 mismatches`
- WGSL/Core result: not verified
- Blocking error: `createComputePipelineAsync timed out after 15000 ms`

The earlier Milestone 8 embedded-browser rerun was blocked by local-target browser policy before execution. Later normal-browser runs returned WGSL rows and compared them against Core vectors for all currently exposed manual selected presets.

Observed normal-browser WGSL/Core verification:

- Adapter: `nvidia / blackwell`
- Presets: `1x1`, `1x2`, `1x4`, `3x1`, `3x2`, and `10x1`
- Largest selected subset tested against WGSL: `10` vectors
- WGSL/Core matches in largest selected subset: `10`
- WGSL/Core mismatches: `0`
- First cold pipeline creation: about `31,112 ms`
- Shader size: `13,763 bytes / 13,763 code units`

The later `Full 294 Core vectors` browser run passed with `294 / 294` selected matches and `0` mismatches for batch size `1`. This proves the current single-dispatch-per-hash WGSL path matches the generated Core fixture set, while still remaining a correctness harness rather than optimized mining code.

For local Windows setup, run `npm run doctor` and follow [LOCAL_DEV_SETUP.md](./LOCAL_DEV_SETUP.md). Use normal Chrome or Edge for the browser run, not an embedded/in-app browser.

The manual browser results are recorded in [BROWSER_VERIFICATION_RESULTS.md](./BROWSER_VERIFICATION_RESULTS.md). Batched WGSL verification reuses the same generated Core vector JSON and must compare every returned folded internal hash to the Core vector before any batch size greater than `1` is considered verified.
