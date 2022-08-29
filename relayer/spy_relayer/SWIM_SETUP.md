# SWIM SETUP
This rough document focuses on setting up an environment that transfers from testnet Eth to testnet BNB, but should
be able to be used for other deployments as well.

# Environment setup

For testnet you'll need these things running:
- A spy container reading from testnet wormhole guardians
- A container running `npm run spy_relay`. Alternatively, you can have each portion of the engine running in separate containers. (see Tiltfile)
- A container running redis

## Running redis:
```bash
docker run --rm -p6379:6379 --name redis-docker -d redis
```

## Running a spy container on testnet wormhole:

```bash
docker run \
    --platform=linux/amd64 \
    -p 7073:7073 \
    --entrypoint /guardiand \
    ghcr.io/certusone/guardiand:latest \
spy --nodeKey /node.key --spyRPC "[::]:7073" --network /wormhole/testnet/2/1 --bootstrap /dns4/wormhole-testnet-v2-bootstrap.certus.one/udp/8999/quic/p2p/12D3KooWBY9ty9CXLBXGQzMuqkziLntsVcyz4pk1zWaJRvJn6Mmt
```

## Running spy relay:
```bash
npm run spy_relay
```

# Config setup

You'll need a configuration file similar to `.env.sample`. If you're running each portion of the engine separately make sure
they have correct configuration files for each (or share one for all of them). This is assuming you have one config file.

Make sure you update `loadConfig.ts` as well. I haven't figured out where to put the `SPY_RELAY_CONFIG` env var.

Variables to modify:
1. `SUPPORTED_CHAINS` - array of JSON objects with chain information. Used to setup wallet monitor, listener, and relayer environments.
2. `PRIVATE_KEYS` - Private keys of engine wallets, one private key per chain.
3. `SUPPORTED_TOKENS` - array of JSON objects with supported tokens and their chain IDs. Used for validation on listener.
4. `SPY_SERVICE_FILTERS` - only allows VAAs that are from the corresponding contract address + chain ID combo to be processed by the engine.
5. `SWIM_EVM_ROUTING_ADDRESS` - address of routing contract. Need this to validate where VAAs are coming from as well as to relay them.


## `PRIVATE_KEYS`
Initialize a new wallet for every chain, or use dev wallets.
```
PRIVATE_KEYS=[{"chainId":2,"privateKeys":["private key"]},{"chainId":4,"privateKeys":["private key"]}]
```

## `SUPPORTED_CHAINS`
```
SUPPORTED_CHAINS =
[
    {
        "chainId": 2,
        "chainName": "ETH",
        "nativeCurrencySymbol": "ETH",
        "nodeUrl": "https://ethereum-goerli-rpc.allthatnode.com",
        "tokenBridgeAddress": "0xF890982f9310df57d00f659cf4fd87e65adEd8d7",
        "wrappedAsset": "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"
    },
    {
        "chainId": 4,
        "chainName": "BSC",
        "nativeCurrencySymbol": "BNB",
        "nodeUrl": "https://data-seed-prebsc-1-s1.binance.org:8545/",
        "tokenBridgeAddress": "0x9dcF9D205C9De35334D646BeE44b2D2859712A09",
        "wrappedAsset": "0xae13d989dac2f0debff460ac112a837c89baa7cd"
    }
]
```

## `SUPPORTED_TOKENS`
This should be swimUSD addresses, since those are the tokens that will be attached in the VAAs we receive.
```
SUPPORTED_TOKENS =
[
    {
      "chainId": 1,
      "address": "5ctnNpb7h1SyPqZ8t8m2kCykrtDGVZBtZgYWv6UAeDhr"  //swimUSD solana hexapool, converted to solana address with tryHexToNativeString()
    }
]
```

## `SPY_SERVICE_FILTERS`
These should be wormhole token bridge addresses, since those are the contracts that will be generating the VAAs.
Token bridge addresses from: https://book.wormhole.com/reference/contracts.html
```
SPY_SERVICE_FILTERS=
[
    {
        "chainId": 2,
        "emitterAddress": "0xF890982f9310df57d00f659cf4fd87e65adEd8d7"
    },
    {
        "chainId": 4,
        "emitterAddress": "0x9dcF9D205C9De35334D646BeE44b2D2859712A09"
    }
]
```

#### Footnotes
Wormhole docs say to add wrapped asset addresses to SUPPORTED_TOKENS, link to those addresses here: https://github.com/certusone/wormhole/blob/dev.v2/bridge_ui/src/utils/consts.ts#L1030-L1044A
