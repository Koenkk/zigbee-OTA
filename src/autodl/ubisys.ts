import url from 'url';

import {getLatestImage, getText, readCacheJson, writeCacheJson} from '../common.js';
import {processFirmwareImage} from '../process_firmware_image.js';

type Image = {
    fileName: string;
    imageType: string;
    hardwareVersionMin: number;
    hardwareVersionMax: number;
    fileVersion: number;
};
type GroupedImages = {
    [k: string]: Image[];
};

const NAME = 'Ubisys';
const LOG_PREFIX = `[${NAME}]`;
const FIRMWARE_HTML_URL = 'http://fwu.ubisys.de/smarthome/OTA/release/index';

function groupByImageType(arr: Image[]): GroupedImages {
    return arr.reduce<GroupedImages>((acc, cur) => {
        acc[cur.imageType] = [...(acc[cur.imageType] || []), cur];
        return acc;
    }, {});
}

function sortByFileVersion(a: Image, b: Image): number {
    return a.fileVersion < b.fileVersion ? -1 : a.fileVersion > b.fileVersion ? 1 : 0;
}

function isDifferent(newData: Image, cachedData?: Image): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.fileVersion !== newData.fileVersion;
}

function parseText(pageText: string): Image[] {
    const lines = pageText.split('\n');
    const images: Image[] = [];

    for (const line of lines) {
        // XXX: there are other images on the page that do not match this pattern
        const imageMatch = /10F2-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{8})\S*ota1?\.zigbee/gi.exec(line);

        if (imageMatch != null) {
            images.push({
                fileName: imageMatch[0],
                imageType: imageMatch[1],
                hardwareVersionMin: parseInt(imageMatch[2], 16),
                hardwareVersionMax: parseInt(imageMatch[3], 16),
                fileVersion: parseInt(imageMatch[4], 16),
            });
        }
    }

    return images;
}

export async function writeCache(): Promise<void> {
    const pageText = await getText(NAME, FIRMWARE_HTML_URL);

    if (pageText?.length) {
        const images = parseText(pageText);

        writeCacheJson(NAME, images);
    }
}

export async function download(): Promise<void> {
    const pageText = await getText(NAME, FIRMWARE_HTML_URL);

    if (pageText?.length) {
        const images = parseText(pageText);
        const imagesByType = groupByImageType(images);
        const cachedData = readCacheJson<Image[]>(NAME);
        const cachedDataByType = cachedData ? groupByImageType(cachedData) : undefined;

        for (const imageType in imagesByType) {
            const image = getLatestImage(imagesByType[imageType], sortByFileVersion);

            if (!image) {
                console.error(`${LOG_PREFIX} No image found for ${imageType}.`);
                continue;
            }

            if (cachedDataByType && !isDifferent(image, getLatestImage(cachedDataByType[imageType], sortByFileVersion))) {
                console.log(`[${NAME}:${image.fileName}] No change from last run.`);
                continue;
            }

            // NOTE: removes `index` from url
            const firmwareUrl = url.resolve(FIRMWARE_HTML_URL, image.fileName);

            await processFirmwareImage(NAME, image.fileName, firmwareUrl, {
                hardwareVersionMin: image.hardwareVersionMin,
                hardwareVersionMax: image.hardwareVersionMax,
            });
        }

        writeCacheJson(NAME, images);
    } else {
        console.error(`${LOG_PREFIX} No image data.`);
    }
}
