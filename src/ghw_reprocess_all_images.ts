import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";
import {
    addImageToBase,
    addImageToPrev,
    BASE_IMAGES_DIR,
    BASE_INDEX_MANIFEST_FILENAME,
    BASE_REPO_URL,
    computeSHA512,
    findMatchImage,
    getOutDir,
    getParsedImageStatus,
    getRepoFirmwareFileUrl,
    getValidMetas,
    ParsedImageStatus,
    PREV_IMAGES_DIR,
    PREV_INDEX_MANIFEST_FILENAME,
    parseImageHeader,
    REPO_BRANCH,
    readManifest,
    UPGRADE_FILE_IDENTIFIER,
    writeManifest,
} from "./common.js";
import type {RepoImageMeta} from "./types";

/** These are now handled by autodl */
const IGNORE_3RD_PARTIES = ["https://github.com/fairecasoimeme/", "https://github.com/xyzroe/"];

const DIR_3RD_PARTIES = {
    "https://otau.meethue.com/": "Hue",
    "https://images.tuyaeu.com/": "Tuya",
    "https://tr-zha.s3.amazonaws.com/": "ThirdReality",
    // NOTE: no longer valid / unable to access via script
    // 'https://www.elektroimportoren.no/docs/lib/4512772-Firmware-35.ota': 'Namron',
    // 'https://deconz.dresden-elektronik.de/': 'DresdenElektronik',
};

export const NOT_IN_BASE_MANIFEST_IMAGES_DIR = "not-in-manifest-images";
export const NOT_IN_PREV_MANIFEST_IMAGES_DIR = "not-in-manifest-images1";
export const NOT_IN_MANIFEST_FILENAME = "not-in-manifest.json";

function ignore3rdParty(meta: RepoImageMeta): boolean {
    for (const ignore of IGNORE_3RD_PARTIES) {
        if (meta.url.startsWith(ignore)) {
            return true;
        }
    }

    return false;
}

function get3rdPartyDir(meta: RepoImageMeta): string | undefined {
    for (const key in DIR_3RD_PARTIES) {
        if (meta.url.startsWith(key)) {
            return DIR_3RD_PARTIES[key as keyof typeof DIR_3RD_PARTIES];
        }
    }
}

async function download3rdParties(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    /* v8 ignore next */ outDirFinder = get3rdPartyDir,
): Promise<void> {
    if (!process.env.NODE_EXTRA_CA_CERTS) {
        throw new Error("Download 3rd Parties requires `NODE_EXTRA_CA_CERTS=cacerts.pem`.");
    }

    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const baseManifestCopy = baseManifest.slice();
    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);
    let baseImagesAddCount = 0;
    let prevImagesAddCount = 0;

    for (const meta of baseManifestCopy) {
        // just in case
        if (!meta.url) {
            core.error(`Ignoring malformed ${JSON.stringify(meta)}.`);
            baseManifest.splice(baseManifest.indexOf(meta), 1);
            continue;
        }

        if (meta.url.startsWith(BASE_REPO_URL + REPO_BRANCH)) {
            core.debug(`Ignoring local URL: ${meta.url}`);
            continue;
        }

        // remove itself from base manifest
        baseManifest.splice(baseManifest.indexOf(meta), 1);

        if (ignore3rdParty(meta)) {
            core.warning(`Removing ignored '${meta.url}'.`);
            continue;
        }

        const fileName = decodeURIComponent(meta.url.split("/").pop()!);
        const outDirName = outDirFinder(meta);

        if (outDirName) {
            core.info(`Downloading 3rd party '${fileName}' into '${outDirName}'`);

            let firmwareFilePath: string | undefined;

            try {
                const baseOutDir = getOutDir(outDirName, BASE_IMAGES_DIR);
                const prevOutDir = getOutDir(outDirName, PREV_IMAGES_DIR);
                const extraMetas = getValidMetas(meta, true);

                core.info(`Extra metas for ${fileName}: ${JSON.stringify(extraMetas)}.`);

                const firmwareFile = await fetch(meta.url);

                if (!firmwareFile.ok || !firmwareFile.body) {
                    core.error(`Invalid response from ${meta.url} status=${firmwareFile.status}.`);
                    continue;
                }

                const firmwareBuffer = Buffer.from(await firmwareFile.arrayBuffer());
                // make sure to parse from the actual start of the "spec OTA" portion of the file (e.g. Ikea has non-spec meta before)
                const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));
                const [baseMatchIndex, baseMatch] = findMatchImage(parsedImage, baseManifest, extraMetas);
                const statusToBase = getParsedImageStatus(parsedImage, baseMatch);

                switch (statusToBase) {
                    case ParsedImageStatus.Older: {
                        addImageToPrev(
                            `[${fileName}]`,
                            false, // no prev existed before
                            prevManifest,
                            -1,
                            // @ts-expect-error false above prevents issue
                            undefined,
                            prevOutDir,
                            fileName,
                            outDirName,
                            parsedImage,
                            firmwareBuffer,
                            meta.url,
                            extraMetas,
                            () => {
                                firmwareFilePath = path.join(prevOutDir, fileName);

                                // write before adding to manifest, in case of failure (throw), manifest won't have a broken link
                                writeFileSync(firmwareFilePath, firmwareBuffer);
                            },
                        );

                        prevImagesAddCount++;

                        break;
                    }

                    case ParsedImageStatus.Identical: {
                        core.warning(`Conflict with image at index \`${baseMatchIndex}\`: ${JSON.stringify(baseMatch)}`);
                        continue;
                    }

                    case ParsedImageStatus.Newer:
                    case ParsedImageStatus.New: {
                        addImageToBase(
                            `[${fileName}]`,
                            statusToBase === ParsedImageStatus.Newer,
                            prevManifest,
                            prevOutDir,
                            baseManifest,
                            baseMatchIndex,
                            baseMatch!,
                            baseOutDir,
                            fileName,
                            outDirName,
                            parsedImage,
                            firmwareBuffer,
                            meta.url,
                            extraMetas,
                            () => {
                                firmwareFilePath = path.join(baseOutDir, fileName);

                                // write before adding to manifest, in case of failure (throw), manifest won't have a broken link
                                writeFileSync(firmwareFilePath, firmwareBuffer);
                            },
                        );

                        baseImagesAddCount++;

                        break;
                    }
                }
            } catch (error) {
                core.error(`Ignoring ${fileName}: ${error}`);

                /* v8 ignore start */
                if (firmwareFilePath) {
                    rmSync(firmwareFilePath, {force: true});
                }
                /* v8 ignore stop */
            }
        } else {
            core.warning(`Ignoring '${fileName}' with no out dir specified.`);
        }
    }

    writeManifest(PREV_INDEX_MANIFEST_FILENAME, prevManifest);
    writeManifest(BASE_INDEX_MANIFEST_FILENAME, baseManifest);

    core.info(`Downloaded ${prevImagesAddCount} prev images.`);
    core.info(`Downloaded ${baseImagesAddCount} base images.`);

    core.info(`Base manifest now contains ${baseManifest.length} images.`);
    core.info(`Prev manifest now contains ${prevManifest.length} images.`);
}

function checkImagesAgainstManifests(github: Octokit, core: typeof CoreApi, context: Context, removeNotInManifest: boolean): void {
    for (const [manifestName, imagesDir, moveDir] of [
        [PREV_INDEX_MANIFEST_FILENAME, PREV_IMAGES_DIR, NOT_IN_PREV_MANIFEST_IMAGES_DIR],
        [BASE_INDEX_MANIFEST_FILENAME, BASE_IMAGES_DIR, NOT_IN_BASE_MANIFEST_IMAGES_DIR],
    ]) {
        const manifest = readManifest(manifestName);
        const rewriteManifest: RepoImageMeta[] = [];
        const missingManifest: RepoImageMeta[] = [];

        core.info(`Checking ${manifestName} (currently ${manifest.length} images)...`);

        for (const subfolderName of readdirSync(imagesDir)) {
            // skip removal of anything not desired while running tests
            // compare should match data.test.ts > IMAGES_TEST_DIR
            /* v8 ignore start */
            if (process.env.VITEST_WORKER_ID && subfolderName !== "test-tmp") {
                continue;
            }
            /* v8 ignore stop */

            const subfolderPath = path.join(imagesDir, subfolderName);

            if (lstatSync(subfolderPath).isDirectory()) {
                core.startGroup(subfolderPath);

                for (const fileName of readdirSync(subfolderPath)) {
                    const firmwareFilePath = path.join(subfolderPath, fileName);
                    const fileRelUrl = path.posix.join(imagesDir, subfolderName, encodeURIComponent(fileName));
                    // take local images only
                    const inManifest = manifest.filter((m) => m.url.startsWith(BASE_REPO_URL + REPO_BRANCH) && m.url.endsWith(fileRelUrl));

                    if (inManifest.length === 0) {
                        core.warning(`Not found in base manifest: ${firmwareFilePath}.`);

                        if (removeNotInManifest) {
                            core.error(`Removing ${firmwareFilePath}.`);
                            rmSync(firmwareFilePath, {force: true});
                        } else {
                            const destDirPath = path.join(moveDir, subfolderName);

                            if (!existsSync(destDirPath)) {
                                mkdirSync(destDirPath, {recursive: true});
                            }

                            try {
                                const firmwareBuffer = Buffer.from(readFileSync(firmwareFilePath));
                                // make sure to parse from the actual start of the "spec OTA" portion of the file (e.g. Ikea has non-spec meta before)
                                const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));

                                renameSync(firmwareFilePath, path.join(destDirPath, fileName));
                                missingManifest.push({
                                    fileName,
                                    fileVersion: parsedImage.fileVersion,
                                    fileSize: parsedImage.totalImageSize,
                                    // originalUrl: meta.url,
                                    url: getRepoFirmwareFileUrl(subfolderName, fileName, imagesDir),
                                    imageType: parsedImage.imageType,
                                    manufacturerCode: parsedImage.manufacturerCode,
                                    sha512: computeSHA512(firmwareBuffer),
                                    otaHeaderString: parsedImage.otaHeaderString.replaceAll("\u0000", ""),
                                });
                            } catch (error) {
                                core.error(`Removing ${firmwareFilePath}: ${error}`);
                                rmSync(firmwareFilePath, {force: true});
                            }
                        }
                    } else {
                        if (inManifest.length !== 1) {
                            core.warning(`[${fileRelUrl}] found multiple times in ${manifestName} manifest:`);
                            core.warning(JSON.stringify(inManifest, undefined, 2));
                        }

                        for (const meta of inManifest) {
                            try {
                                const firmwareBuffer = Buffer.from(readFileSync(firmwareFilePath));
                                const extraMetas = getValidMetas(meta, true);
                                // make sure to parse from the actual start of the "spec OTA" portion of the file (e.g. Ikea has non-spec meta before)
                                const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));
                                const [, rewriteMatch] = findMatchImage(parsedImage, rewriteManifest, extraMetas);

                                // only add if not already present
                                if (!rewriteMatch) {
                                    rewriteManifest.push({
                                        fileName,
                                        fileVersion: parsedImage.fileVersion,
                                        fileSize: parsedImage.totalImageSize,
                                        // originalUrl: meta.url,
                                        url: getRepoFirmwareFileUrl(subfolderName, fileName, imagesDir),
                                        imageType: parsedImage.imageType,
                                        manufacturerCode: parsedImage.manufacturerCode,
                                        sha512: computeSHA512(firmwareBuffer),
                                        otaHeaderString: parsedImage.otaHeaderString.replaceAll("\u0000", ""),
                                        ...extraMetas,
                                    });
                                }
                            } catch (error) {
                                core.error(`Removing ${firmwareFilePath}: ${error}`);
                                rmSync(firmwareFilePath, {force: true});
                            }
                        }
                    }
                }

                core.endGroup();
            } else {
                // subfolderName here would actually be the file name
                throw new Error(`Detected file in ${imagesDir} not in subdirectory: ${subfolderName}.`);
            }
        }

        // will not run in case removeNotInManifest is true, since nothing added, `moveDir` will also already have been created
        if (missingManifest.length > 0) {
            writeManifest(path.join(moveDir, NOT_IN_MANIFEST_FILENAME), missingManifest);

            core.error(`${missingManifest.length} images not in ${manifestName} manifest.`);
        }

        writeManifest(manifestName, rewriteManifest);

        core.info(`Rewritten ${manifestName} manifest has ${rewriteManifest.length} images.`);
    }
}

/**
 *
 * @param github
 * @param core
 * @param context
 * @param removeNotInManifest If false, move images to separate directories
 * @param skipDownload3rdParties Do not execute the download step
 * @param downloadOutDirFinder Used mainly for jest tests
 */
export async function reProcessAllImages(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    removeNotInManifest: boolean,
    skipDownload3rdParties: boolean,
    downloadOutDirFinder = get3rdPartyDir,
): Promise<void> {
    if (!removeNotInManifest && existsSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR) && readdirSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR).length > 0) {
        throw new Error(`${NOT_IN_BASE_MANIFEST_IMAGES_DIR} is not empty. Cannot run.`);
    }

    if (!removeNotInManifest && existsSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR) && readdirSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR).length > 0) {
        throw new Error(`${NOT_IN_PREV_MANIFEST_IMAGES_DIR} is not empty. Cannot run.`);
    }

    /* v8 ignore start */
    if (!existsSync(BASE_IMAGES_DIR)) {
        mkdirSync(BASE_IMAGES_DIR, {recursive: true});
    }
    /* v8 ignore stop */

    /* v8 ignore start */
    if (!existsSync(PREV_IMAGES_DIR)) {
        mkdirSync(PREV_IMAGES_DIR, {recursive: true});
    }
    /* v8 ignore stop */

    /* v8 ignore start */
    if (!existsSync(BASE_INDEX_MANIFEST_FILENAME)) {
        writeManifest(BASE_INDEX_MANIFEST_FILENAME, []);
    }
    /* v8 ignore stop */

    /* v8 ignore start */
    if (!existsSync(PREV_INDEX_MANIFEST_FILENAME)) {
        writeManifest(PREV_INDEX_MANIFEST_FILENAME, []);
    }
    /* v8 ignore stop */

    if (!skipDownload3rdParties) {
        await download3rdParties(github, core, context, downloadOutDirFinder);
    }

    checkImagesAgainstManifests(github, core, context, removeNotInManifest);
}

// To run locally uncomment below and run with `npx tsx src/ghw_reprocess_all_images.ts`
// const core = {
//     debug: console.debug,
//     info: console.info,
//     warning: console.warn,
//     error: console.error,
//     startGroup: console.group,
//     endGroup: console.groupEnd,
// }
// // @ts-expect-error run locally
// checkImagesAgainstManifests({}, core, {}, false);
