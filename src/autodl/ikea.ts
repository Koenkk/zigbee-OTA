import {getJson, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";

type GatewayImageJson = {
    fw_binary_url: string;
    fw_filesize: number;
    fw_hotfix_version: number;
    fw_major_version: number;
    fw_minor_version: number;
    fw_req_hotfix_version: number;
    fw_req_major_version: number;
    fw_req_minor_version: number;
    fw_type: 0;
    fw_update_prio: number;
    fw_weblink_relnote: string;
};
type DeviceImageJson = {
    fw_binary_url: string;
    // biome-ignore lint/style/useNamingConvention: <explanation>
    fw_file_version_LSB: number;
    // biome-ignore lint/style/useNamingConvention: <explanation>
    fw_file_version_MSB: number;
    fw_filesize: number;
    fw_image_type: number;
    fw_manufacturer_id: number;
    fw_type: 2;
};
type ImagesJson = (GatewayImageJson | DeviceImageJson)[];

const NAME = "IKEA";
const LOG_PREFIX = `[${NAME}]`;
const PRODUCTION_FIRMWARE_URL = "http://fw.ota.homesmart.ikea.net/feed/version_info.json";
// const TEST_FIRMWARE_URL = 'http://fw.test.ota.homesmart.ikea.net/feed/version_info.json';
export const RELEASE_NOTES_URL = "https://ww8.ikea.com/ikeahomesmart/releasenotes/releasenotes.html";

function findInCache(image: DeviceImageJson, cachedData?: ImagesJson): DeviceImageJson | undefined {
    // `fw_type` compare ensures always `DeviceImagesJson`
    return cachedData?.find(
        (d) => d.fw_type === image.fw_type && d.fw_image_type === image.fw_image_type && d.fw_manufacturer_id === image.fw_manufacturer_id,
    ) as DeviceImageJson | undefined;
}

function isDifferent(newData: DeviceImageJson, cachedData?: DeviceImageJson): boolean {
    return (
        Boolean(process.env.IGNORE_CACHE) ||
        !cachedData ||
        cachedData.fw_file_version_LSB !== newData.fw_file_version_LSB ||
        cachedData.fw_file_version_MSB !== newData.fw_file_version_MSB
    );
}

export async function writeCache(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, PRODUCTION_FIRMWARE_URL);

    if (images?.length) {
        writeCacheJson(NAME, images);
    }
}

export async function download(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, PRODUCTION_FIRMWARE_URL);

    if (images?.length) {
        const cachedData = readCacheJson<ImagesJson>(NAME);

        for (const image of images) {
            if (image.fw_type !== 2) {
                // ignore gateway firmware
                continue;
            }

            const firmwareFileName = image.fw_binary_url.split("/").pop()!;

            if (!isDifferent(image, findInCache(image, cachedData))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            await processFirmwareImage(NAME, firmwareFileName, image.fw_binary_url, {releaseNotes: RELEASE_NOTES_URL});
        }

        writeCacheJson(NAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
