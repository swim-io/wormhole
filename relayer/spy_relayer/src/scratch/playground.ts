import { ethers } from "ethers";

const num = ethers.BigNumber.from(10).pow(18);
console.log(num);
console.log(num.toString());
console.log(ethers.utils.formatEther(num));

const test = Number("2");
console.log("setting test as " + test + " eth");
