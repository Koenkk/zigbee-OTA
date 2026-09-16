import {getJson, getLatestImage, readCacheJson, writeCacheJson} from "../common.js";
import {ProcessFirmwareImageStatus, processFirmwareImage} from "../process_firmware_image.js";

type DeviceImageJson = {
    version: string;
    channel: "beta" | "production";
    firmware: string;
    manufacturer_id: number;
    image_type: number;
};
type ModelsJson = {
    [k: string]: DeviceImageJson[];
};
type GitHubTreeEntryJson = {
    path: string;
    sha: string;
    type: "blob" | "commit" | "tree";
};
type GitHubTreeJson = {
    tree: GitHubTreeEntryJson[];
    truncated: boolean;
};
type GitHubFirmwareFile = {
    path: string;
    sha: string;
};

const NAME = "Inovelli";
const LOG_PREFIX = `[${NAME}]`;
const LEGACY_FIRMWARE_URL = "https://files.inovelli.com/firmware/firmware.json";
const GITHUB_FIRMWARE_TREE_URL = "https://api.github.com/repos/InovelliUSA/Firmware/git/trees/main?recursive=1";
const GITHUB_RAW_FIRMWARE_URL = "https://raw.githubusercontent.com/InovelliUSA/Firmware/main/";
const GITHUB_ZIGBEE_PATH_PREFIX = "Blue-Series/Zigbee/";
const GITHUB_CACHE_NAME = `${NAME}GitHub`;

function sortByVersion(a: DeviceImageJson, b: DeviceImageJson): number {
    const aRadix = a.version.match(/[a-fA-F]/) ? 16 : 10;
    const bRadix = b.version.match(/[a-fA-F]/) ? 16 : 10;
    const aVersion = Number.parseInt(a.version, aRadix);
    const bVersion = Number.parseInt(b.version, bRadix);

    return aVersion < bVersion ? -1 : aVersion > bVersion ? 1 : 0;
}

function isDifferent(newData: DeviceImageJson, cachedData?: DeviceImageJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.version !== newData.version;
}

export function getGitHubFirmwareFiles(githubTree: GitHubTreeJson): GitHubFirmwareFile[] {
    if (githubTree.truncated) {
        throw new Error(`${LOG_PREFIX} GitHub firmware tree is truncated.`);
    }

    return githubTree.tree
        .filter((entry) => entry.type === "blob" && entry.path.startsWith(GITHUB_ZIGBEE_PATH_PREFIX) && entry.path.toLowerCase().endsWith(".ota"))
        .map(({path, sha}) => ({path, sha}))
        .sort((a, b) => a.path.localeCompare(b.path));
}

export function getChangedGitHubFirmwareFiles(
    githubFiles: GitHubFirmwareFile[],
    cachedFiles: GitHubFirmwareFile[] = [],
    ignoreCache = Boolean(process.env.IGNORE_CACHE),
): GitHubFirmwareFile[] {
    if (ignoreCache) {
        return githubFiles;
    }

    const cachedFilesByPath = new Map(cachedFiles.map((file) => [file.path, file.sha]));

    return githubFiles.filter((file) => cachedFilesByPath.get(file.path) !== file.sha);
}

export function getGitHubFirmwareUrl(filePath: string): string {
    return GITHUB_RAW_FIRMWARE_URL + filePath.split("/").map(encodeURIComponent).join("/");
}

export async function writeCache(): Promise<void> {
    const [models, githubTree] = await Promise.all([
        getJson<ModelsJson>(NAME, LEGACY_FIRMWARE_URL),
        getJson<GitHubTreeJson>(NAME, GITHUB_FIRMWARE_TREE_URL),
    ]);

    if (models) {
        writeCacheJson(NAME, models);
    }

    if (githubTree) {
        writeCacheJson(GITHUB_CACHE_NAME, getGitHubFirmwareFiles(githubTree));
    }
}

export async function download(): Promise<void> {
    const [models, githubTree] = await Promise.all([
        getJson<ModelsJson>(NAME, LEGACY_FIRMWARE_URL),
        getJson<GitHubTreeJson>(NAME, GITHUB_FIRMWARE_TREE_URL),
    ]);

    if (models) {
        const cachedData = readCacheJson<ModelsJson>(NAME);

        for (const model in models) {
            if (model === "") {
                // ignore empty key (bug)
                continue;
            }

            const image = getLatestImage(models[model], sortByVersion);

            if (!image) {
                continue;
            }

            const firmwareFileName = image.firmware.split("/").pop()!;

            if (cachedData && !isDifferent(image, getLatestImage(cachedData[model], sortByVersion))) {
                console.log(`[${NAME}:${firmwareFileName}] No change from last run.`);
                continue;
            }

            await processFirmwareImage(NAME, firmwareFileName, image.firmware);
        }

        writeCacheJson(NAME, models);
    } else {
        console.error(`${LOG_PREFIX} No legacy image data.`);
    }

    if (githubTree) {
        const githubFiles = getGitHubFirmwareFiles(githubTree);
        const cachedFiles = readCacheJson<GitHubFirmwareFile[]>(GITHUB_CACHE_NAME);
        const changedFiles = getChangedGitHubFirmwareFiles(githubFiles, cachedFiles);
        const processedFiles = new Map(cachedFiles?.map((file) => [file.path, file]));

        for (const file of changedFiles) {
            const firmwareFileName = file.path.split("/").pop()!;
            const status = await processFirmwareImage(NAME, firmwareFileName, getGitHubFirmwareUrl(file.path));

            if (status === ProcessFirmwareImageStatus.Success) {
                processedFiles.set(file.path, file);
            } else {
                processedFiles.delete(file.path);
            }
        }

        writeCacheJson(
            GITHUB_CACHE_NAME,
            githubFiles.filter((file) => processedFiles.get(file.path)?.sha === file.sha),
        );
    } else {
        console.error(`${LOG_PREFIX} No GitHub image data.`);
    }
}
