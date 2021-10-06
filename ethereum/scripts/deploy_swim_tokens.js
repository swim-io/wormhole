// run this script with truffle exec

const ERC20 = artifacts.require("ERC20PresetMinterPauser");
const TokenImplementation = artifacts.require("TokenImplementation");


module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();

    usdc = await TokenImplementation.new();
    await usdc.initialize(
      "USD Coin",
      "USDC",
      6,
      0,
      accounts[0],
      0,
      "0x00"
    );
    usdt = await TokenImplementation.new();
    await usdt.initialize(
      "Tether USD",
      "USDT",
      6,
      0,
      accounts[0],
      0,
      "0x00"
    );

    console.log("USDC deployed at: " + usdc.address);
    console.log("USDT deployed at: " + usdt.address);

    // mint 1000 units of each
    await usdc.mint(accounts[0], "1000000000000000000000")
    await usdt.mint(accounts[0], "1000000000000000000000")

    callback();
  } catch (e) {
    callback(e);
  }
};
