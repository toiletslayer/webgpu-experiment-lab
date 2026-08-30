export const WHIRLPOOL_TEST_VECTORS = Object.freeze([
  {
    name: "WHIRLPOOL empty string",
    messageHex: "",
    whirlpoolHex:
      "19fa61d75522a4669b44e39c1d2e1726c530232130d407f89afee0964997f7a73e83be698b288febcf88e3e03c4f0757ea8964e59b63d93708b138cc42a66eb3",
  },
  {
    name: "WHIRLPOOL abc",
    messageText: "abc",
    whirlpoolHex:
      "4e2448a4c6f486bb16b6562c73b4020bf3043e3a731bce721ae1b303d97e6d4c7181eebdb6c57e277d0e34957114cbd6c797fc9d95d8b582d225292076d4eef5",
  },
]);

export const CAPSTASH_POW_TEST_VECTORS = Object.freeze([
  {
    name: "Bitcoin genesis-shaped header, CapStash PoW transform",
    header: {
      version: 1,
      previousBlockHash: "0000000000000000000000000000000000000000000000000000000000000000",
      merkleRoot: "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
      time: 1231006505,
      bits: 0x1d00ffff,
      nonce: 2083236893,
    },
    headerHex:
      "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c",
    powHashHex:
      "ec87c947721e47813d242676ad742b5d872bcbe01c7659ae909a215487e7c3c8",
    internalFoldHex:
      "c8c3e78754219a90ae59761ce0cb2b875d2b74ad7626243d81471e7247c987ec",
  },
  {
    name: "Synthetic CapStash header, nonce zero",
    header: {
      version: 0x20000000,
      previousBlockHash: "0000000000000000000b4d0f0000000000000000000000000000000000000000",
      merkleRoot: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      time: 1716400000,
      bits: 0x1c2ac4af,
      nonce: 0,
    },
    headerHex:
      "0000002000000000000000000000000000000000000000000f4d0b000000000000000000efcdab8967452301efcdab8967452301efcdab8967452301efcdab8967452301802f4e66afc42a1c00000000",
    powHashHex:
      "00eace4fb6972e6583e517378f429faf5923ee79a32ff2449a91f7b1be6d9b23",
    internalFoldHex:
      "239b6dbeb1f7919a44f22fa379ee2359af9f428f3717e583652e97b64fceea00",
  },
]);
