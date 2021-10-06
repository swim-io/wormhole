// run this script with truffle exec
const TokenImplementation = artifacts.require("TokenImplementation");

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();

    // Ethereum
    const usdc = await TokenImplementation.new();
    await usdc.initialize("USD Coin", "USDC", 6, 0, accounts[0], 0, "0x00");
    const usdt = await TokenImplementation.new();
    await usdt.initialize("Tether USD", "USDT", 6, 0, accounts[0], 0, "0x00");

    console.log("USDC deployed at: " + usdc.address);
    console.log("USDT deployed at: " + usdt.address);

    // mint 1,000,000,000 units of each
    await usdc.mint(accounts[0], "1000000000000000");
    await usdt.mint(accounts[0], "1000000000000000");

    // BSC
    const busd = await TokenImplementation.new();
    await busd.initialize(
      "Binance-Peg BUSD Token",
      "BUSD",
      18,
      0,
      accounts[0],
      0,
      "0x00"
    );
    const bscUsd = await TokenImplementation.new(); // USDT on BSC
    await bscUsd.initialize(
      "Binance-Peg BSC-USD",
      "BSC-USD",
      18,
      0,
      accounts[0],
      0,
      "0x00"
    );

    console.log("BUSD deployed at: " + busd.address);
    console.log("BSC-USD (USDT on BSC) deployed at: " + bscUsd.address);

    // mint 1,000,000,000 units of each
    await busd.mint(accounts[0], "1000000000000000000000000000");
    await bscUsd.mint(accounts[0], "1000000000000000000000000000");

    callback();
  } catch (e) {
    callback(e);
  }
};
