# Known Limitations

- Current benchmark hashing path is JavaScript CPU reference, not WGSL.
- No live network mining.
- No wallet, login, analytics, ads, telemetry, pool connection, payouts, Stratum, `getblocktemplate`, or `submitblock`.
- Browsers do not reliably expose GPU temperature, fan, clock, or power telemetry.
- WebGPU adapter details may be redacted.
- Native comparison is estimated from efficiency assumptions until real native baselines exist.
- Deterministic vectors need regeneration from latest CapStash-Core before production-adjacent work.
