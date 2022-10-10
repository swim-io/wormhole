# SWIM SETUP
This rough document focuses on setting up an environment that transfers from testnet Eth to testnet BNB, but should
be able to be used for other deployments as well.

# Running testnet on local machine

For testnet on a local machine, you'll need these things running:
- A spy container reading from testnet wormhole guardians
- A container running `npm run swim_spy_relay`.
- A container running redis

## Running redis:
```bash
docker run --rm -p6379:6379 --name redis-docker -d redis
```
To view redis tables:
```bash
docker exec -it redis-docker redis-cli
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
npm run swim_spy_relay
```
`swim_spy_relay` uses the config file `.env.testnet.local`, which is already configured for local machine usage.

# Running testnet remotely using Tilt

To run testnet on Tilt, you'll need to setup a separate remote environment. You can use Digital Ocean to create a new droplet, then ssh into that droplet.

Once inside the droplet, run these commands:
```bash
$ cd wormhole/relayer/spy_relayer
$ npm install
$ npm run build
$ cd ../..
$ tilt up
```
This will use the config files located in `/swim_testnet`, as well as the config files `.env.testnet.relayer` and `.env.testnet.listener`

# Config setup

If you are making a new config file, then follow these instructions:

You'll need a configuration file similar to `.env.sample`. If you're running each portion of the engine separately make sure
they have correct configuration files for each (or share one for all of them). This is assuming you have one config file.

Variables to modify:
1. `SUPPORTED_CHAINS` - array of JSON objects with chain information. Used to setup wallet monitor, listener, and relayer environments.
2. `PRIVATE_KEYS` - Private keys of engine wallets, one private key per chain.
3. `SUPPORTED_TOKENS` - array of JSON objects with supported tokens and their chain IDs. Used for validation on listener.
4. `SPY_SERVICE_FILTERS` - only allows VAAs that are from the corresponding contract address + chain ID combo to be processed by the engine.
5. `SWIM_EVM_ROUTING_ADDRESS` - address of EVM routing contract. Need this to validate where VAAs are coming from as well as to relay them.
6. `SWIM_SOLANA_ROUTING_ADDRESS` - address of solana routing contract.
7. `SWIM_TWO_POOL_ADDRESS` - solana address of Two Pool program. Used to generate transactions when relaying solana.
8. `SWIM_USD_MINT_ADDRESS` - solana address of swimUSD. Used for relaying solana.


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
      "address": "5ctnNpb7h1SyPqZ8t8m2kCykrtDGVZBtZgYWv6UAeDhr"  //swimUSD solana hexapool, converted to solana address with tryHexToNativeString(), using translateAddress.ts
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

## `SWIM_EVM_ROUTING_ADDRESS`
```
SWIM_EVM_ROUTING_ADDRESS=0x280999aB9aBfDe9DC5CE7aFB25497d6BB3e8bDD4
```

## `SWIM_SOLANA_ROUTING_ADDRESS`
```
SWIM_SOLANA_ROUTING_ADDRESS=9z6G41AyXk73r1E4nTv81drQPtEqupCSAnsLdGV5WGfK
```

## `SWIM_TWO_POOL_ADDRESS`
```
SWIM_TWO_POOL_ADDRESS=8VNVtWUae4qMe535i4yL1gD3VTo8JhcfFEygaozBq8aM
```

## `SWIM_USD_MINT_ADDRESS`
```
SWIM_USD_MINT_ADDRESS=3ngTtoyP9GFybFifX1dr7gCFXFiM2Wr6NfXn6EuU7k6C
```

#### Footnotes
Wormhole docs say to add wrapped asset addresses to SUPPORTED_TOKENS, link to those addresses here: https://github.com/wormhole-foundation/example-token-bridge-ui/blob/main/src/utils/consts.ts
