import {getJson, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";
import type {ExtraMetas} from "../types.js";

type DeviceImageJson = {
    fw_binary_url: string;
    fw_file_version: number;
    fw_filesize: number;
    fw_image_type: number;
    fw_manufacturer_id: number;
    model_id: string;
};

type ImagesJson = DeviceImageJson[];

const NAME = "Sonoff";
const LOG_PREFIX = `[${NAME}]`;
const FIRMWARE_URL = "https://zigbee-ota.sonoff.tech/releases/upgrade.json";
const TELINK_ENCRYPTED = ["SNZB-02DR2", "SNZB-02LWD"];

function findInCache(image: DeviceImageJson, cachedData?: ImagesJson): DeviceImageJson | undefined {
    return cachedData?.find((d) => d.fw_image_type === image.fw_image_type && d.fw_manufacturer_id === image.fw_manufacturer_id) as
        | DeviceImageJson
        | undefined;
}

function isDifferent(newData: DeviceImageJson, cachedData?: DeviceImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.fw_file_version !== newData.fw_file_version;
}

export async function writeCache(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.length) {
        writeCacheJson(NAME, images);
    }
}

export async function download(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.length) {
        // make sure we process images in order of version (maintain proper base/prev)
        images.sort((a, b) => a.fw_file_version - b.fw_file_version);

        const cachedData = readCacheJson<ImagesJson>(NAME);

        for (const image of images) {
            const firmwareFileName = image.fw_binary_url.split("/").pop()!;

            if (!isDifferent(image, findInCache(image, cachedData))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            const extraMetas: ExtraMetas = TELINK_ENCRYPTED.includes(image.model_id) ? {customParseLogic: "telinkEncrypted"} : {};

            await processFirmwareImage(NAME, firmwareFileName, image.fw_binary_url, extraMetas);
        }

        writeCacheJson(NAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
