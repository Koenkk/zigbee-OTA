import {getJson, getLatestImage, readCacheJson, writeCacheJson} from '../common.js';
import {processFirmwareImage, ProcessFirmwareImageStatus} from '../process_firmware_image.js';

type FirmwareJson = {
    blob: null;
    identity: {
        company: number;
        product: number;
        version: {
            major: number;
            minor: number;
            build: number;
            revision: number;
        };
    };
    releaseNotes: string;
    /** Ledvance's API docs state the checksum should be `sha_256` but it is actually `shA256` */
    shA256: string;
    name: string;
    productName: string;
    /**
     * The fileVersion in hex is included in the fullName between the `/`, e.g.:
     *   - PLUG COMPACT EU T/032b3674/PLUG_COMPACT_EU_T-0x00D6-0x032B3674-MF_DIS.OTA
     *   - A19 RGBW/00102428/A19_RGBW_IMG0019_00102428-encrypted.ota
     */
    fullName: string;
    extension: string;
    released: string;
    salesRegion: string;
    length: number;
};
type ImagesJson = {
    firmwares: FirmwareJson[];
};
type GroupedImagesJson = Record<string, FirmwareJson[]>;

const NAME = 'Ledvance';
const LOG_PREFIX = `[${NAME}]`;
const FIRMWARE_URL = 'https://api.update.ledvance.com/v1/zigbee/firmwares/';
// const UPDATE_CHECK_URL = 'https://api.update.ledvance.com/v1/zigbee/firmwares/newer';
// const UPDATE_CHECK_PARAMS = `?company=${manufCode}&product=${imageType}&version=0.0.0`;
const UPDATE_DOWNLOAD_URL = 'https://api.update.ledvance.com/v1/zigbee/firmwares/download';
/** XXX: getting 429 after a few downloads, force more throttling. Seems to trigger after around ~20 requests. */
const FETCH_FAILED_THROTTLE_MS = 60000;
const FETCH_FAILED_RETRIES = 3;

function groupByProduct(arr: FirmwareJson[]): GroupedImagesJson {
    return arr.reduce<GroupedImagesJson>((acc, cur) => {
        acc[cur.identity.product] = [...(acc[cur.identity.product] || []), cur];
        return acc;
    }, {});
}

function sortByReleased(a: FirmwareJson, b: FirmwareJson): number {
    return a.released < b.released ? -1 : a.released > b.released ? 1 : 0;
}

function getVersionString(firmware: FirmwareJson): string {
    const {major, minor, build, revision} = firmware.identity.version;

    return `${major}.${minor}.${build}.${revision}`;
}

function isDifferent(newData: FirmwareJson, cachedData?: FirmwareJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || getVersionString(cachedData) !== getVersionString(newData);
}

export async function writeCache(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.firmwares?.length) {
        writeCacheJson(NAME, images);
    }
}

export async function download(): Promise<void> {
    const images = await getJson<ImagesJson>(NAME, FIRMWARE_URL);

    if (images?.firmwares?.length) {
        const cachedData = readCacheJson<ImagesJson | undefined>(NAME);
        const cachedDataByProduct = cachedData?.firmwares?.length ? groupByProduct(cachedData.firmwares) : undefined;
        const firmwareByProduct = groupByProduct(images.firmwares);

        for (const product in firmwareByProduct) {
            const firmware = getLatestImage(firmwareByProduct[product], sortByReleased);

            if (!firmware) {
                console.error(`${LOG_PREFIX} No image found for ${product}.`);
                continue;
            }

            const fileVersionMatch = /\/(\d|\w+)\//.exec(firmware.fullName);

            if (fileVersionMatch == null) {
                // ignore possible unsupported patterns
                continue;
            }

            // const fileVersion = parseInt(fileVersionMatch[1], 16);
            const firmwareUrl = `${UPDATE_DOWNLOAD_URL}?company=${firmware.identity.company}&product=${firmware.identity.product}&version=${getVersionString(firmware)}`;
            const firmwareFileName = firmware.fullName.split('/').pop()!;

            if (cachedDataByProduct && !isDifferent(firmware, getLatestImage(cachedDataByProduct[product], sortByReleased))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            for (let i = 0; i < FETCH_FAILED_RETRIES; i++) {
                const status = await processFirmwareImage(NAME, firmwareFileName, firmwareUrl, {
                    manufacturerName: [NAME],
                    // workflow automatically computes sha512
                    // sha256: firmware.shA256,
                    releaseNotes: firmware.releaseNotes,
                });

                if (status === ProcessFirmwareImageStatus.REQUEST_FAILED) {
                    await new Promise((resolve) => setTimeout(resolve, FETCH_FAILED_THROTTLE_MS));
                } else {
                    break;
                }
            }
        }

        writeCacheJson(NAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
