import {getJson, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";

type ImageJson = {
    model: string;
    version: string;
    url: string;
};
type ImagesJson = {
    versions: ImageJson[];
};

const NAME = "SalusControls";
const LOG_PREFIX = `[${NAME}]`;
const FIRMWARE_URL = "https://eu.salusconnect.io/demo/default/status/firmware?timestamp=0";

function findInCache(image: ImageJson, cachedData?: ImagesJson): ImageJson | undefined {
    return cachedData?.versions?.find((d) => d.model == image.model);
}

function isDifferent(newData: ImageJson, cachedData?: ImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.version !== newData.version;
}

export async function writeCache(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.versions?.length) {
        writeCacheJson(NAME, images);
    }
}

export async function download(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.versions?.length) {
        const cachedData = readCacheJson<ImagesJson>(NAME);

        for (const image of images.versions) {
            const archiveUrl = image.url; //.replace(/^http:\/\//, 'https://');
            const archiveFileName = archiveUrl.split("/").pop()!;

            if (!isDifferent(image, findInCache(image, cachedData))) {
                console.log(`[${NAME}:${archiveFileName}] No change from last run.`);
                continue;
            }

            await processFirmwareImage(NAME, archiveFileName, archiveUrl, {manufacturerName: [NAME]}, true, (fileName) => fileName.endsWith(".ota"));
        }

        writeCacheJson(NAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
