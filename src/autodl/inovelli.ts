import {getJson, getLatestImage, readCacheJson, writeCacheJson} from '../common.js';
import {processFirmwareImage} from '../process_firmware_image.js';

type DeviceImageJson = {
    version: string;
    channel: 'beta' | 'production';
    firmware: string;
    manufacturer_id: number;
    image_type: number;
};
type ModelsJson = {
    [k: string]: DeviceImageJson[];
};

const NAME = 'Inovelli';
const LOG_PREFIX = `[${NAME}]`;
const FIRMWARE_URL = 'https://files.inovelli.com/firmware/firmware.json';

function sortByVersion(a: DeviceImageJson, b: DeviceImageJson): number {
    const aRadix = a.version.match(/[a-fA-F]/) ? 16 : 10;
    const bRadix = b.version.match(/[a-fA-F]/) ? 16 : 10;
    const aVersion = parseInt(a.version, aRadix);
    const bVersion = parseInt(b.version, bRadix);

    return aVersion < bVersion ? -1 : aVersion > bVersion ? 1 : 0;
}

function isDifferent(newData: DeviceImageJson, cachedData?: DeviceImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.version !== newData.version;
}

export async function writeCache(): Promise<void> {
    const models = await getJson<ModelsJson>(NAME, FIRMWARE_URL);

    if (models) {
        writeCacheJson(NAME, models);
    }
}

export async function download(): Promise<void> {
    const models = await getJson<ModelsJson>(NAME, FIRMWARE_URL);

    if (models) {
        const cachedData = readCacheJson<ModelsJson | undefined>(NAME);

        for (const model in models) {
            if (model == '') {
                // ignore empty key (bug)
                continue;
            }

            const image = getLatestImage(models[model], sortByVersion);

            if (!image) {
                continue;
            }

            const firmwareFileName = image.firmware.split('/').pop()!;

            if (cachedData && !isDifferent(image, getLatestImage(cachedData[model], sortByVersion))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            await processFirmwareImage(NAME, firmwareFileName, image.firmware);
        }

        writeCacheJson(NAME, models);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
