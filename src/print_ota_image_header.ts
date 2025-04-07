import {readFileSync} from "node:fs";

import {UPGRADE_FILE_IDENTIFIER, parseImageHeader} from "./common.js";

const firmwareBuffer = readFileSync(process.argv[2]);

console.log(parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER))));
