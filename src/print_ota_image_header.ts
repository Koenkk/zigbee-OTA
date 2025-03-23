import {readFileSync} from "node:fs";

import {parseImageHeader} from "./common.js";

console.log(parseImageHeader(readFileSync(process.argv[2])));
