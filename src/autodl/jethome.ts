import {getJson, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";

type ImageJson = {
    vendor: string;
    vendor_name: string;
    device: string;
    device_name: string;
    platform: string;
    platform_name: string;
    latest_firmware: {
        release: {
            version: string;
            date: string;
            images: {
                "zigbee.ota": {
                    url: string;
                    hash: string;
                    filesize: number;
                };
                "zigbee.bin": {
                    url: string;
                    hash: string;
                    filesize: number;
                };
            };
            changelog: string;
        };
    };
};

const NAME = "JetHome";
const LOG_PREFIX = `[${NAME}]`;
const BASE_URL = "https://fw.jethome.ru";
const DEVICE_URL = `${BASE_URL}/api/devices/`;

const MODEL_IDS = ["WS7"];

function getCacheFileName(modelId: string): string {
    return `${NAME}_${modelId}`;
}

function isDifferent(newData: ImageJson, cachedData?: ImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.latest_firmware.release.version !== newData.latest_firmware.release.version;
}

export async function writeCache(): Promise<void> {
    for (const modelId of MODEL_IDS) {
        const url = `${DEVICE_URL}${modelId}/info`;
        const image = await getJson<ImageJson>(NAME, url);

        if (image?.latest_firmware?.release?.images) {
            writeCacheJson(getCacheFileName(modelId), image);
        }
    }
}

export async function download(): Promise<void> {
    for (const modelId of MODEL_IDS) {
        const url = `${DEVICE_URL}${modelId}/info`;
        const image = await getJson<ImageJson>(NAME, url);

        // XXX: this is assumed to always be present even for devices that support OTA but without images yet available?
        if (image?.latest_firmware?.release?.images) {
            const firmware = image.latest_firmware.release.images["zigbee.ota"];

            if (!firmware) {
                continue;
            }

            const firmwareUrl = BASE_URL + firmware.url;
            const firmwareFileName = firmwareUrl.split("/").pop()!;
            const cacheFileName = getCacheFileName(modelId);

            if (!isDifferent(image, readCacheJson(cacheFileName))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            writeCacheJson(cacheFileName, image);

            await processFirmwareImage(NAME, firmwareFileName, firmwareUrl, {
                manufacturerName: [NAME],
                releaseNotes: BASE_URL + image.latest_firmware.release.changelog,
            });
        } else {
            console.error(`${LOG_PREFIX} No image data for ${modelId}.`);
        }
    }
}
