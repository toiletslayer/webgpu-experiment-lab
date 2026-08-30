// Milestone 7 CapStash Core PoW vector generator.
//
// Build and run this inside a local, already-buildable CapStash Core checkout.
// It intentionally calls CBlockHeader::GetPoWHash() for the folded consensus
// PoW value instead of reimplementing the browser path here.
//
// Typical manual flow:
//   1. Copy this file to the root of a CapStash Core checkout.
//   2. Build CapStash Core normally first.
//   3. Compile this file with the same include paths and objects/libraries that
//      provide primitives/block.cpp, uint256, and crypto/whirlpool.
//   4. Run it and save stdout to caps-webgpu/vectors/capstash-core-pow-vectors.json.
//
// No SHA-256 or Bitcoin double-SHA path belongs in this generator.

#include <primitives/block.h>
#include <uint256.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#if defined(CAPSTASH_CORE_VECTOR_WITH_WHIRLPOOL)
#include <crypto/whirlpool.h>
#endif

#ifndef CAPSTASH_CORE_VECTOR_GENERATED_AT
#define CAPSTASH_CORE_VECTOR_GENERATED_AT "MANUAL: replace with ISO-8601 timestamp from generation environment"
#endif

#ifndef CAPSTASH_CORE_VECTOR_REPO_URL
#define CAPSTASH_CORE_VECTOR_REPO_URL "https://github.com/CapStash/CapStash-Core"
#endif

#ifndef CAPSTASH_CORE_VECTOR_BRANCH
#define CAPSTASH_CORE_VECTOR_BRANCH "MANUAL: record CapStash Core branch"
#endif

#ifndef CAPSTASH_CORE_VECTOR_COMMIT
#define CAPSTASH_CORE_VECTOR_COMMIT "MANUAL: record git rev-parse HEAD from the CapStash Core checkout"
#endif

struct Fixture {
    const char* id;
    const char* name;
    const char* headerHexBeforeNonce;
    uint32_t nonceStart;
};

struct Bytes80 {
    std::array<unsigned char, 80> data;
};

static const std::array<uint32_t, 5> NONCE_COUNTS{{1, 2, 4, 8, 16}};

static const std::array<Fixture, 10> FIXTURES{{
    {
        "zero-header",
        "All-zero header except nonce",
        "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        0,
    },
    {
        "incrementing-bytes",
        "Incrementing byte pattern",
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f",
        0,
    },
    {
        "high-bit-bytes",
        "High-bit byte pattern",
        "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf",
        0,
    },
    {
        "deterministic-random",
        "Deterministic random fixture",
        "cca15fb965cd63709f68088e68480bff8f009fc015b7936ce22bc357e4d0f3f9f75a8c72193ffd58d9df9c38f76c555e9ec484d8c6cfbcd0911e729db0d0aa3c37003a085e4339dd17f6a40576665f98",
        0,
    },
    {
        "realistic-fields",
        "Realistic-looking CapStash fields",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000008f7d46d0d72f444078091ff50f02b18acfdf27a503ceca367f2a9b241fb4f95910aa5566ffff001d00000000",
        5,
    },
    {
        "time-mutated",
        "Only nTime changes",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000008f7d46d0d72f444078091ff50f02b18acfdf27a503ceca367f2a9b241fb4f95911aa5566ffff001d00000000",
        0,
    },
    {
        "bits-mutated",
        "Only nBits changes",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000008f7d46d0d72f444078091ff50f02b18acfdf27a503ceca367f2a9b241fb4f95910aa5566c0ff3f1c00000000",
        0,
    },
    {
        "merkle-mutated",
        "Only merkle root changes",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000001032547698badcfe0123456789abcdef00112233445566778899aabbccddeeff10aa5566ffff001d00000000",
        0,
    },
    {
        "near-overflow-nonce",
        "Nonce starts near 0xffffffff",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000008f7d46d0d72f444078091ff50f02b18acfdf27a503ceca367f2a9b241fb4f95910aa5566ffff001d00000000",
        0xfffffff0u,
    },
    {
        "overflow-rejected",
        "Nonce overflow rejection case",
        "04000000a241f9b00c0942997748f0bc18ac4ea3444c7f5fb571060000000000000000008f7d46d0d72f444078091ff50f02b18acfdf27a503ceca367f2a9b241fb4f95910aa5566ffff001d00000000",
        0xfffffff8u,
    },
}};

static unsigned char HexNibble(char c)
{
    if (c >= '0' && c <= '9') return static_cast<unsigned char>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<unsigned char>(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return static_cast<unsigned char>(c - 'A' + 10);
    throw std::runtime_error("non-hex character in fixture");
}

static Bytes80 ParseHeader80(const std::string& hex)
{
    if (hex.size() != 160) {
        throw std::runtime_error("fixture header must be exactly 160 hex characters");
    }
    Bytes80 out;
    for (size_t i = 0; i < out.data.size(); ++i) {
        out.data[i] = static_cast<unsigned char>((HexNibble(hex[i * 2]) << 4) | HexNibble(hex[i * 2 + 1]));
    }
    return out;
}

static std::string HexBytes(const unsigned char* bytes, size_t size)
{
    std::ostringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < size; ++i) {
        ss << std::setw(2) << static_cast<unsigned int>(bytes[i]);
    }
    return ss.str();
}

static uint32_t ReadLE32(const Bytes80& bytes, size_t offset)
{
    return static_cast<uint32_t>(bytes.data[offset]) |
        (static_cast<uint32_t>(bytes.data[offset + 1]) << 8) |
        (static_cast<uint32_t>(bytes.data[offset + 2]) << 16) |
        (static_cast<uint32_t>(bytes.data[offset + 3]) << 24);
}

static void WriteLE32(Bytes80& bytes, size_t offset, uint32_t value)
{
    bytes.data[offset] = static_cast<unsigned char>(value & 0xff);
    bytes.data[offset + 1] = static_cast<unsigned char>((value >> 8) & 0xff);
    bytes.data[offset + 2] = static_cast<unsigned char>((value >> 16) & 0xff);
    bytes.data[offset + 3] = static_cast<unsigned char>((value >> 24) & 0xff);
}

static CBlockHeader HeaderFromBytes(const Bytes80& bytes)
{
    CBlockHeader header;
    header.nVersion = static_cast<int32_t>(ReadLE32(bytes, 0));
    std::copy(bytes.data.begin() + 4, bytes.data.begin() + 36, header.hashPrevBlock.begin());
    std::copy(bytes.data.begin() + 36, bytes.data.begin() + 68, header.hashMerkleRoot.begin());
    header.nTime = ReadLE32(bytes, 68);
    header.nBits = ReadLE32(bytes, 72);
    header.nNonce = ReadLE32(bytes, 76);
    return header;
}

static bool NonceRangeSafe(uint32_t nonceStart, uint32_t nonceCount)
{
    return nonceCount > 0 && static_cast<uint64_t>(nonceStart) + static_cast<uint64_t>(nonceCount) - 1u <= 0xffffffffULL;
}

static std::string JsonEscape(const std::string& value)
{
    std::ostringstream ss;
    for (char c : value) {
        if (c == '\\' || c == '"') {
            ss << '\\' << c;
        } else if (c == '\n') {
            ss << "\\n";
        } else {
            ss << c;
        }
    }
    return ss.str();
}

static std::string InternalHex(const uint256& value)
{
    return HexBytes(value.begin(), 32);
}

static std::string Whirlpool512Hex(const Bytes80& bytes)
{
#if defined(CAPSTASH_CORE_VECTOR_WITH_WHIRLPOOL)
    unsigned char digest[64];
    CWhirlpool512().Write(bytes.data.data(), bytes.data.size()).Finalize(digest);
    return HexBytes(digest, sizeof(digest));
#else
    return "";
#endif
}

int main()
{
    std::cout << "{\n";
    std::cout << "  \"schemaVersion\": 1,\n";
    std::cout << "  \"status\": \"generated\",\n";
    std::cout << "  \"generatedAt\": \"" << JsonEscape(CAPSTASH_CORE_VECTOR_GENERATED_AT) << "\",\n";
    std::cout << "  \"generator\": {\n";
    std::cout << "    \"repository\": \"caps-webgpu\",\n";
    std::cout << "    \"script\": \"scripts/core_pow_vector_generator.cpp\",\n";
    std::cout << "    \"capstashCoreRepoUrl\": \"" << JsonEscape(CAPSTASH_CORE_VECTOR_REPO_URL) << "\",\n";
    std::cout << "    \"capstashCoreBranch\": \"" << JsonEscape(CAPSTASH_CORE_VECTOR_BRANCH) << "\",\n";
    std::cout << "    \"capstashCoreCommit\": \"" << JsonEscape(CAPSTASH_CORE_VECTOR_COMMIT) << "\",\n";
    std::cout << "    \"sourceNote\": \"Generated inside a built CapStash Core checkout by calling CBlockHeader::GetPoWHash(); Whirlpool-512 output is ";
#if defined(CAPSTASH_CORE_VECTOR_WITH_WHIRLPOOL)
    std::cout << "included via CWhirlpool512";
#else
    std::cout << "null because CAPSTASH_CORE_VECTOR_WITH_WHIRLPOOL was not enabled";
#endif
    std::cout << ".\"\n";
    std::cout << "  },\n";
    std::cout << "  \"byteOrderNotes\": {\n";
    std::cout << "    \"headerHexBeforeNonce\": \"80-byte serialized header before nonce patching, internal byte order exactly as hashed.\",\n";
    std::cout << "    \"patchedHeaderHex\": \"80-byte serialized header after little-endian nonce patch at bytes 76..79.\",\n";
    std::cout << "    \"foldedInternalHex\": \"32 folded PoW bytes in internal uint256 byte order.\",\n";
    std::cout << "    \"foldedHashHex\": \"Core uint256 display hex, the reverse of foldedInternalHex bytes.\",\n";
    std::cout << "    \"whirlpool512Hex\": \"Plain Whirlpool-512 digest bytes before XOR folding when available.\"\n";
    std::cout << "  },\n";
    std::cout << "  \"limitations\": [],\n";
    std::cout << "  \"vectors\": [\n";

    bool first = true;
    for (const Fixture& fixture : FIXTURES) {
        const Bytes80 base = ParseHeader80(fixture.headerHexBeforeNonce);
        for (const uint32_t nonceCount : NONCE_COUNTS) {
            if (!NonceRangeSafe(fixture.nonceStart, nonceCount)) {
                continue;
            }
            for (uint32_t index = 0; index < nonceCount; ++index) {
                const uint32_t nonce = fixture.nonceStart + index;
                Bytes80 patched = base;
                WriteLE32(patched, 76, nonce);
                const CBlockHeader header = HeaderFromBytes(patched);
                const uint256 pow = header.GetPoWHash();
                if (!first) {
                    std::cout << ",\n";
                }
                first = false;
                std::cout << "    {\n";
                std::cout << "      \"fixtureId\": \"" << JsonEscape(fixture.id) << "\",\n";
                std::cout << "      \"fixtureName\": \"" << JsonEscape(fixture.name) << "\",\n";
                std::cout << "      \"headerHexBeforeNonce\": \"" << fixture.headerHexBeforeNonce << "\",\n";
                std::cout << "      \"nonceStart\": " << fixture.nonceStart << ",\n";
                std::cout << "      \"nonceCount\": " << nonceCount << ",\n";
                std::cout << "      \"nonce\": " << nonce << ",\n";
                std::cout << "      \"patchedHeaderHex\": \"" << HexBytes(patched.data.data(), patched.data.size()) << "\",\n";
                const std::string whirlpoolHex = Whirlpool512Hex(patched);
                if (whirlpoolHex.empty()) {
                    std::cout << "      \"whirlpool512Hex\": null,\n";
                } else {
                    std::cout << "      \"whirlpool512Hex\": \"" << whirlpoolHex << "\",\n";
                }
                std::cout << "      \"foldedInternalHex\": \"" << InternalHex(pow) << "\",\n";
                std::cout << "      \"foldedHashHex\": \"" << pow.GetHex() << "\",\n";
                std::cout << "      \"notes\": \"foldedInternalHex is raw uint256 bytes; foldedHashHex is Core display order\"\n";
                std::cout << "    }";
            }
        }
    }

    std::cout << "\n  ]\n";
    std::cout << "}\n";
    return 0;
}
