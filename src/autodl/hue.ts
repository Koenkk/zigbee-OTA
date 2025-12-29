import {getJson, getLatestImage, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";

type ImageJson = {
    createdAt: string;
    updatedAt: string;
    fileSize: number;
    md5: string;
    binaryUrl: string;
    version: number;
    versionName: string;
    releaseNotes: string;
};
type PageJson = {updates: ImageJson[]};

const NAME = "Hue";
const BASE_URL = "https://firmware.meethue.com/v1/checkupdate?version=0&deviceTypeId=";
const DEVICE_TYPE_IDS: string[] = [
    "100b-111",
    "100b-112",
    // '100b-113',
    "100b-114",
    "100b-115",
    // '100b-116',
    "100b-117",
    "100b-118",
    // '100b-119',
    "100b-11a",
    // '100b-11b',
    // '100b-11c',
    "100b-11d",
    "100b-11e",
    "100b-11f",
    "100b-120",
    // '100b-121',
    // '100b-122',
    "100b-123",
    // '100b-124',
    "100b-125",
    // '100b-126',
    "100b-127",
    "100b-128",
    "100b-129",
    "100b-12a",
    // '100b-12b',
    // '100b-12c',
    // '100b-12d',
    // '100b-12e',
    // '100b-12f',
];

function sortByVersion(a: ImageJson, b: ImageJson): number {
    return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}

function isDifferent(newData: PageJson, cachedData?: PageJson): boolean {
    return (
        Boolean(process.env.IGNORE_CACHE) ||
        !cachedData?.updates.length ||
        getLatestImage(cachedData.updates, sortByVersion)?.version !== getLatestImage(newData.updates, sortByVersion)?.version
    );
}

export async function writeCache(): Promise<void> {
    for (const deviceTypeId of DEVICE_TYPE_IDS) {
        const url = `${BASE_URL}${deviceTypeId}`;
        const page = await getJson<PageJson>(NAME, url);

        if (page?.updates.length) {
            writeCacheJson(`${NAME}_${deviceTypeId}`, page);
        }
    }
}

export async function download(): Promise<void> {
    for (const deviceTypeId of DEVICE_TYPE_IDS) {
        const logPrefix = `[${NAME}:${deviceTypeId}]`;
        const url = `${BASE_URL}${deviceTypeId}`;
        const page = await getJson<PageJson>(NAME, url);

        if (!page?.updates.length) {
            console.error(`${logPrefix} No image data.`);
            continue;
        }

        const cacheFileName = `${NAME}_${deviceTypeId}`;

        if (!isDifferent(page, readCacheJson(cacheFileName))) {
            console.log(`${logPrefix} No change from last run.`);
            continue;
        }

        writeCacheJson(cacheFileName, page);

        page.updates.sort(sortByVersion);

        let previousImage: (typeof page.updates)[number] | undefined;

        for (const image of page.updates) {
            const firmwareFileName = image.binaryUrl.split("/").pop()!;

            await processFirmwareImage(NAME, firmwareFileName, image.binaryUrl, {
                releaseNotes: image.versionName
                    ? `Version: ${image.versionName}${image.releaseNotes ? ` | ${image.releaseNotes}` : ""}`
                    : image.releaseNotes || undefined,
                minFileVersion: previousImage?.version,
            });

            previousImage = image;
        }
    }
}
