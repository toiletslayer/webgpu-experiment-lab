# Future Work

- Browser pool mining: feasible only after correct WebGPU hashing, but not in scope.
- `getblocktemplate`: feasible for local/test RPC later, but not in scope.
- `submitblock`: feasible only after full block assembly and validation work, not in scope.
- Stratum: would require WebSocket bridging because browsers cannot use raw TCP directly.
- PWA: feasible for packaging, not a performance solution.
- Mobile: likely limited by thermals, battery policy, and background throttling.
- Apple Silicon, AMD, Intel Arc, and NVIDIA: all need direct WebGPU and native baseline measurements.
