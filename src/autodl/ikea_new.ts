import {getJson, readCacheJson, writeCacheJson} from '../common.js';
import {processFirmwareImage} from '../process_firmware_image.js';
import {RELEASE_NOTES_URL} from './ikea.js';

type GatewayImageJson = {
    fw_type: 3;
    fw_sha3_256: string;
    fw_binary_url: string;
    fw_update_prio: number;
    fw_filesize: number;
    fw_minor_version: number;
    fw_major_version: number;
    fw_hotfix_version: number;
    fw_binary_checksum: string;
};
type DeviceImageJson = {
    fw_image_type: number;
    fw_type: 2;
    fw_sha3_256: string;
    fw_binary_url: string;
};

type ImagesJson = (GatewayImageJson | DeviceImageJson)[];

// same name as `ikea.ts` to keep everything in same folder
const NAME = 'IKEA';
const CACHE_FILENAME = `${NAME}_new`;
const LOG_PREFIX = `[${NAME}_new]`;
// requires cacerts/ikea_new.pem
const FIRMWARE_URL = 'https://fw.ota.homesmart.ikea.com/check/update/prod';

function findInCache(image: DeviceImageJson, cachedData?: ImagesJson): DeviceImageJson | undefined {
    // `fw_type` compare ensures always `DeviceImagesJson`
    return cachedData?.find((d) => d.fw_type == image.fw_type && d.fw_image_type == image.fw_image_type) as DeviceImageJson | undefined;
}

function isDifferent(newData: DeviceImageJson, cachedData?: DeviceImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.fw_sha3_256 !== newData.fw_sha3_256;
}

export async function writeCache(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.length) {
        writeCacheJson(CACHE_FILENAME, images);
    }
}

export async function download(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.length) {
        const cachedData = readCacheJson<ImagesJson | undefined>(CACHE_FILENAME);

        for (const image of images) {
            if (image.fw_type !== 2) {
                // ignore gateway firmware
                continue;
            }

            const firmwareFileName = image.fw_binary_url.split('/').pop()!;

            if (!isDifferent(image, findInCache(image, cachedData))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            await processFirmwareImage(NAME, firmwareFileName, image.fw_binary_url, {manufacturerName: [NAME], releaseNotes: RELEASE_NOTES_URL});
        }

        writeCacheJson(CACHE_FILENAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
