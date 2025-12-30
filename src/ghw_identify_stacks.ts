import {readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import {BASE_INDEX_MANIFEST_FILENAME, BASE_REPO_URL, parseImageHeader, REPO_BRANCH, readManifest, UPGRADE_FILE_IDENTIFIER} from "./common.js";

enum ZigbeeStackVersion {
    Zigbee2006 = 0x0000,
    Zigbee2007 = 0x0001,
    ZigbeePro = 0x0002,
    ZigbeeIP = 0x0003,
}

type FirmwareStack = {
    url: string;
    modelId?: string;
    stack:
        | "EmberZNet" // Silabs https://github.com/SiliconLabs/simplicity_sdk or https://github.com/SiliconLabs/gecko_sdk
        | "zStack" // TI https://github.com/TexasInstruments/simplelink-lowpower-f2-sdk
        | "Telink" // https://github.com/telink-semi/telink_zigbee_sdk
        | "NXP"
        | "BitCloud" // Microchip https://github.com/Microchip-MPLAB-Harmony/wireless_zigbee
        | "ZBOSS" // https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk or https://github.com/nrfconnect/ncs-zigbee/ or https://github.com/nrfconnect/ncs-zigbee-r22/ or https://github.com/espressif/esp-zigbee-sdk
        | "Unknown";
    stackDetails: string;
    /** @see ZigbeeStackVersion */
    zigbeeStackVersion: string;
};

type OtaSubElement = {
    tagId: number;
    length: number;
    data: Buffer;
};

const INDEX_STACKINFO_MANIFEST_FILENAME = "index-stackinfo.json";
const SI_GBL_HEADER_TAG = Buffer.from([0xeb, 0x17, 0xa6, 0x03]);
const SI_EBL_TAG_HEADER = 0x0;
const SI_EBL_IMAGE_SIGNATURE = 0xe350;
const SI_EBL_TAG_ENC_HEADER = 0xfb05;
const TI_OAD_IMG_ID_VAL_CC26X2R1 = Buffer.from("CC26x2R1", "utf8");
const TI_OAD_IMG_ID_VAL_CC13X2R1 = Buffer.from("CC13x2R1", "utf8");
const TI_OAD_IMG_ID_VAL_CC13X4 = Buffer.from("CC13x4  ", "utf8");
const TI_OAD_IMG_ID_VAL_CC26X3 = Buffer.from("CC26x3  ", "utf8");
const TI_OAD_IMG_ID_VAL_CC26X4 = Buffer.from("CC26x4  ", "utf8");
const TI_OAD_IMG_ID_VAL_OADIMG = Buffer.from("OAD IMG ", "utf8");
const TI_OAD_IMG_ID_VAL_CC23X0R2 = Buffer.from("CC23x0R2", "utf8");
const TL_START_UP_FLAG_WHOLE = 0x544c4e4b; // Buffer.from('KNLT', 'utf8');
const TL_SR_TAG = Buffer.from("TLSR", "utf8");

function parseSubElements(otaData: Buffer, totalImageSize: number): OtaSubElement[] {
    let position = 0;
    const elements: OtaSubElement[] = [];

    try {
        while (position < totalImageSize) {
            const tagId = otaData.readUInt16LE(position);
            position += 2;
            const length = otaData.readUInt32LE(position);
            position += 4;
            const data = otaData.subarray(position, position + length);
            position += length;

            if (data.byteLength !== length) {
                throw new Error("Invalid data byte length");
            }

            elements.push({tagId, length, data});
        }
    } catch {
        /* ignore */
    }

    return elements;
}

export function identifyStacks(_github: Octokit, core: typeof CoreApi, _context: Context): void {
    try {
        const firmwareList: FirmwareStack[] = [];
        const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);

        for (const meta of baseManifest) {
            const filePath = decodeURIComponent(meta.url.replace(BASE_REPO_URL + REPO_BRANCH, ""));
            const fileBuf = readFileSync(join(".", filePath));
            const otaImage = fileBuf.subarray(fileBuf.indexOf(UPGRADE_FILE_IDENTIFIER));
            const header = parseImageHeader(otaImage);
            const otaData = otaImage.subarray(header.otaHeaderLength);
            let stack: FirmwareStack["stack"] = "Unknown";
            let stackDetails = "";

            for (const {tagId, data} of parseSubElements(otaData, header.totalImageSize)) {
                if (data.indexOf(SI_GBL_HEADER_TAG) === 0) {
                    stack = "EmberZNet";
                    stackDetails = "GBL";

                    break;
                }

                if (data.readUInt16BE(0) === SI_EBL_TAG_HEADER && data.readUInt16BE(6) === SI_EBL_IMAGE_SIGNATURE) {
                    stack = "EmberZNet";
                    stackDetails = "EBL";

                    break;
                }

                if (data.readUInt16BE(0) === SI_EBL_TAG_ENC_HEADER) {
                    stack = "EmberZNet";
                    stackDetails = "EBL ENC";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC26X2R1) === 0) {
                    stack = "zStack";
                    stackDetails = "CC26x2R1";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC13X2R1) === 0) {
                    stack = "zStack";
                    stackDetails = "CC13x2R1";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC13X4) === 0) {
                    stack = "zStack";
                    stackDetails = "CC13x4";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC26X3) === 0) {
                    stack = "zStack";
                    stackDetails = "CC26x3";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC26X4) === 0) {
                    stack = "zStack";
                    stackDetails = "CC26x4";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_OADIMG) === 0) {
                    stack = "zStack";
                    stackDetails = "OAD IMG";

                    break;
                }

                if (data.indexOf(TI_OAD_IMG_ID_VAL_CC23X0R2) === 0) {
                    stack = "zStack";
                    stackDetails = "CC23x0R2";

                    break;
                }

                if (data.byteLength >= 12 && data.readUInt32LE(8) === TL_START_UP_FLAG_WHOLE) {
                    stack = "Telink";
                    const tlsrIndex = data.indexOf(TL_SR_TAG);

                    if (tlsrIndex !== -1) {
                        stackDetails = data.subarray(tlsrIndex, tlsrIndex + 8).toString("utf8");
                    }

                    break;
                }

                if (
                    data.indexOf(Buffer.from("nRF", "utf8")) !== -1 ||
                    data.indexOf(Buffer.from("nrf5", "utf8")) !== -1 ||
                    data.indexOf(Buffer.from("nrf_", "utf8")) !== -1
                ) {
                    stack = "ZBOSS";
                    stackDetails = "Nordic (fuzzy matching)";
                    break;
                }

                core.info(`UNKNOWN ${filePath} tagId=${tagId} firstBytes=${data.subarray(0, 16).toString("hex")}`);
            }

            if (stack === "Unknown") {
                if (header.otaHeaderString.includes("Telink")) {
                    stack = "Telink";
                    stackDetails = "(fallback matching)";
                } else if (header.otaHeaderString.includes("GBL")) {
                    stack = "EmberZNet";
                    stackDetails = "GBL (fallback matching)";
                } else if (header.otaHeaderString.includes("EBL")) {
                    stack = "EmberZNet";
                    stackDetails = "EBL (fallback matching)";
                } /* else if () {
                    // stack = 'zStack';
                }*/
            }

            firmwareList.push({
                url: meta.url,
                // modelId: meta.modelId,
                stack,
                stackDetails,
                zigbeeStackVersion: ZigbeeStackVersion[header.zigbeeStackVersion],
            });
        }

        writeFileSync(INDEX_STACKINFO_MANIFEST_FILENAME, JSON.stringify(firmwareList, undefined, 2), "utf8");
    } catch (error) {
        core.error((error as Error).message);
        core.debug((error as Error).stack!);
    }
}

// // @ts-expect-error run locally
// identifyStacks({}, console, {});
