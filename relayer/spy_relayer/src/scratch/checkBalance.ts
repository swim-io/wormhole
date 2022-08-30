import { ethers } from "ethers";

(async () => {
  const walletPrivateKey = "0c5c8b4a383a0afd815a4689554c978b19760f37e4e1b8b2a3460821db87ef3a";
  const provider = new ethers.providers.JsonRpcProvider("https://data-seed-prebsc-1-s1.binance.org:8545/");
  const signer = new ethers.Wallet(walletPrivateKey, provider);
  console.log("signer address:");
  console.log(signer.address);
  const balanceBigNumber = await signer.getBalance();
  console.log(balanceBigNumber.toBigInt());
})();
