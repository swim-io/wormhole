import { createClient } from "redis";

var date = new Date;
//var minute = date.getMinutes();
var minute = 10;
console.log(minute);
console.log("hello" + ":" + minute);
console.log(Math.floor(minute / 10) * 10)

