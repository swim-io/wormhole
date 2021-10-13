// run this script with truffle exec

const jsonfile = require("jsonfile");
const TokenImplementationFullABI = jsonfile.readFileSync(
  "../build/contracts/TokenImplementation.json"
).abi;

const usdcEthAddress = "0x4bf3A7dFB3b76b5B3E169ACE65f888A4b4FCa5Ee";
const usdtEthAddress = "0x4339316e04CFfB5961D1c41fEF8E44bfA2A7fBd1";
const busdBscAddress = "0xc0b3B62DD0400E4baa721DdEc9B8A384147b23fF";
const usdtBscAddress = "0x47a2Db5D68751EeAdFBC44851E84AcDB4F7299Cc";

module.exports = async function(callback) {
  try {
    const [sender, recipient] = await web3.eth.getAccounts();
    const ethAmount = "1" + "0".repeat(15);
    const bscAmount = ethAmount + "0".repeat(12);

    const usdcEth = new web3.eth.Contract(
      TokenImplementationFullABI,
      usdcEthAddress,
      {}
    );
    const usdtEth = usdcEth.clone();
    usdtEth.options.address = usdtEthAddress;

    web3.eth.Contract.setProvider("http://127.0.0.1:8546");

    const busdBsc = usdcEth.clone();
    busdBsc.options.address = busdBscAddress;
    busdBsc.options.chain = 1397;

    const usdtBsc = busdBsc.clone();
    usdtBsc.options.address = usdtBscAddress;

    const tokensWithAmounts = [
      { token: usdcEth, amount: ethAmount },
      { token: usdtEth, amount: ethAmount },
      { token: busdBsc, amount: bscAmount },
      { token: usdtBsc, amount: bscAmount }
    ];

    for (const { token, amount } of tokensWithAmounts) {
      const receipt = await token.methods.mint(recipient, amount).send({
        from: sender,
        gas: 1_000_000
      });
      console.log(receipt);
    }

    callback();
  } catch (e) {
    callback(e);
  }
};
