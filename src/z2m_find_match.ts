/**
 * Helper script to quickly retrieve an image meta in the same manner as Zigbee2MQTT.
 */
import {BASE_INDEX_MANIFEST_FILENAME, PREV_INDEX_MANIFEST_FILENAME, readManifest} from "./common.js";
import type {ImageHeader, RepoImageMeta} from "./types.js";

const USAGE = `Usage: tsx src/z2m_find_match.ts <BASE|PREV> <current> [device] [extraMetas]
       Example: tsx src/z2m_find_match.ts BASE '{"imageType": 287, "manufacturerCode": 4107, "fileVersion": 16786436}' '{"modelID": "", "manufacturerName": "Philips"}'
       Formats:
         current: '{"imageType": number, "fileVersion": number, "manufacturerCode": number, "hardwareVersion": number | undefined}'
         device [optional]: '{"modelID": string, "manufacturerName": string}'
         extraMetas [optional]: '{"modelId": string, "otaHeaderString": string, "hardwareVersionMin": number | undefined, "hardwareVersionMax": number | undefined, "manufacturerName": string | undefined}'
`;

// #region Z2M
interface ImageInfo {
    imageType: ImageHeader["imageType"];
    fileVersion: ImageHeader["fileVersion"];
    manufacturerCode: ImageHeader["manufacturerCode"];
    hardwareVersion?: number;
}

interface Device {
    modelID: string;
    manufacturerName: string;
}

type ExtraMetas = Pick<RepoImageMeta, "modelId" | "otaHeaderString" | "hardwareVersionMin" | "hardwareVersionMax"> & {
    manufacturerName?: string;
};

function getImageMeta(imageList: RepoImageMeta[], current: ImageInfo, device: Device, extraMetas: ExtraMetas): RepoImageMeta | undefined {
    return imageList.find(
        (i) =>
            i.imageType === current.imageType &&
            i.manufacturerCode === current.manufacturerCode &&
            (i.minFileVersion === undefined || current.fileVersion >= i.minFileVersion) &&
            (i.maxFileVersion === undefined || current.fileVersion <= i.maxFileVersion) &&
            // let extra metas override the match from device.modelID, same for manufacturerName
            (!i.modelId || i.modelId === device.modelID || i.modelId === extraMetas.modelId) &&
            (!i.manufacturerName ||
                i.manufacturerName.includes(device.manufacturerName!) ||
                i.manufacturerName.includes(extraMetas.manufacturerName!)) &&
            (!extraMetas.otaHeaderString || i.otaHeaderString === extraMetas.otaHeaderString) &&
            (i.hardwareVersionMin === undefined ||
                (current.hardwareVersion !== undefined && current.hardwareVersion >= i.hardwareVersionMin) ||
                (extraMetas.hardwareVersionMin !== undefined && extraMetas.hardwareVersionMin >= i.hardwareVersionMin)) &&
            (i.hardwareVersionMax === undefined ||
                (current.hardwareVersion !== undefined && current.hardwareVersion <= i.hardwareVersionMax) ||
                (extraMetas.hardwareVersionMax !== undefined && extraMetas.hardwareVersionMax <= i.hardwareVersionMax)),
    );
}
// #endregion Z2M

function main(): void {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        throw new Error(USAGE);
    }

    const manifestName = args[0] === "PREV" ? PREV_INDEX_MANIFEST_FILENAME : BASE_INDEX_MANIFEST_FILENAME;
    const current = JSON.parse(args[1]);
    const device = args[2] ? JSON.parse(args[2]) : {};
    const extraMetas = args[3] ? JSON.parse(args[3]) : {};
    const manifest = readManifest(manifestName);
    const match = getImageMeta(manifest, current, device, extraMetas);

    console.log(match);
}

main();
