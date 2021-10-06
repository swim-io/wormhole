// run this script with truffle exec

const ERC20 = artifacts.require("ERC20PresetMinterPauser");
const TokenImplementation = artifacts.require("TokenImplementation");


module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const decimals = 6;

    tk1 = await TokenImplementation.new();
    await tk1.initialize(
      "TestFrom",
      "FROM",
      decimals,
      0,
      accounts[0],
      0,
      "0x00"
    );
    tk2 = await TokenImplementation.new();
    await tk2.initialize(
      "TestTo",
      "TO",
      decimals,
      0,
      accounts[0],
      0,
      "0x00"
    );

    console.log("TK1 deployed at: " + tk1.address);
    console.log("TK2 deployed at: " + tk2.address);

    // mint 1000 units of each
    await tk1.mint(accounts[0], "1000000000000000000000")
    await tk2.mint(accounts[0], "1000000000000000000000")

    callback();
  } catch (e) {
    callback(e);
  }
};
