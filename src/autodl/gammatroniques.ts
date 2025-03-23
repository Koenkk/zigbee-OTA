import {getJson, readCacheJson, writeCacheJson} from "../common.js";
import {processFirmwareImage} from "../process_firmware_image.js";

type ImagesJsonBuildPart = {
    path: string; // .bin
    offset: number;
    type?: "app" | "storage";
    ota?: string; // .ota
};
type ImagesJsonBuild = {
    chipFamily: string;
    target: string;
    parts: ImagesJsonBuildPart[];
};
type ImagesJson = {
    name: string;
    version: string;
    home_assistant_domain: string;
    funding_url: string;
    new_install_prompt_erase: boolean;
    builds: ImagesJsonBuild[];
};

const NAME = "GammaTroniques";
// const LOG_PREFIX = `[${NAME}]`;
const BASE_URL = "https://update.gammatroniques.fr/";
const MANIFEST_URL_PATH = "/manifest.json";
const MODEL_IDS: [urlId: string, modelId: string][] = [["ticmeter", "TICMeter"]];

function isDifferent(newData: ImagesJson, cachedData?: ImagesJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.version !== newData.version;
}

export async function writeCache(): Promise<void> {
    for (const [urlId, modelId] of MODEL_IDS) {
        const url = `${BASE_URL}${urlId}${MANIFEST_URL_PATH}`;
        const page = await getJson<ImagesJson>(NAME, url);

        if (page?.builds?.length) {
            writeCacheJson(`${NAME}_${modelId}`, page);
        }
    }
}

export async function download(): Promise<void> {
    for (const [urlId, modelId] of MODEL_IDS) {
        const logPrefix = `[${NAME}:${modelId}]`;
        const url = `${BASE_URL}${urlId}${MANIFEST_URL_PATH}`;
        const page = await getJson<ImagesJson>(NAME, url);

        if (!page?.builds?.length) {
            console.error(`${logPrefix} No image data.`);
            continue;
        }

        const cacheFileName = `${NAME}_${modelId}`;

        if (!isDifferent(page, readCacheJson(cacheFileName))) {
            console.log(`${logPrefix} No change from last run.`);
            continue;
        }

        writeCacheJson(cacheFileName, page);

        const appUrl: ImagesJsonBuildPart | undefined = page.builds[0].parts.find((part) => part.type === "app");

        if (!appUrl || !appUrl.ota) {
            console.error(`${logPrefix} No image found.`);
            continue;
        }

        const firmwareFileName = appUrl.ota.split("/").pop()!;

        await processFirmwareImage(NAME, firmwareFileName, appUrl.ota, {modelId});
    }
}
