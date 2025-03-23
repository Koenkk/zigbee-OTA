import type {ExtraMetas} from "./types";

import assert from "node:assert";
import {readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";

import {extract} from "tar";

import {
    BASE_IMAGES_DIR,
    BASE_INDEX_MANIFEST_FILENAME,
    PREV_IMAGES_DIR,
    PREV_INDEX_MANIFEST_FILENAME,
    ParsedImageStatus,
    TMP_DIR,
    UPGRADE_FILE_IDENTIFIER,
    addImageToBase,
    addImageToPrev,
    findMatchImage,
    getOutDir,
    getParsedImageStatus,
    parseImageHeader,
    readManifest,
    writeManifest,
} from "./common.js";

export enum ProcessFirmwareImageStatus {
    Error = -1,
    Success = 0,
    RequestFailed = 1,
    TarNoImage = 2,
}

async function tarExtract(filePath: string, outDir: string, tarImageFinder: (fileName: string) => boolean): Promise<string> {
    let outFileName: string | undefined;

    try {
        console.log(`[${filePath}] Extracting TAR...`);

        await extract({file: filePath, cwd: TMP_DIR});

        for (const file of readdirSync(TMP_DIR)) {
            const archiveFilePath = path.join(TMP_DIR, file);

            if (tarImageFinder(file)) {
                outFileName = file;
                renameSync(archiveFilePath, path.join(outDir, outFileName));
            } else {
                rmSync(archiveFilePath, {force: true});
            }
        }
    } catch (error) {
        console.error(error);

        // force throw below, just in case something crashed in-between this being assigned and the end of the try block
        outFileName = undefined;
    }

    // always remove archive file once done
    rmSync(filePath, {force: true});

    if (!outFileName) {
        throw new Error(`No image found in ${filePath}.`);
    }

    return outFileName;
}

export async function processFirmwareImage(
    manufacturer: string,
    firmwareFileName: string,
    firmwareFileUrl: string,
    extraMetas: ExtraMetas = {},
    tar = false,
    tarImageFinder?: (fileName: string) => boolean,
): Promise<ProcessFirmwareImageStatus> {
    // throttle requests (this is done at the top to ensure always executed)
    await new Promise((resolve) => setTimeout(resolve, 300));

    let firmwareFilePath: string | undefined;
    const logPrefix = `[${manufacturer}:${firmwareFileName}]`;

    if (tar && !firmwareFileName.endsWith(".tar.gz")) {
        // ignore non-archive
        return ProcessFirmwareImageStatus.TarNoImage;
    }

    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);
    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const baseOutDir = getOutDir(manufacturer, BASE_IMAGES_DIR);
    const prevOutDir = getOutDir(manufacturer, PREV_IMAGES_DIR);

    try {
        const firmwareFile = await fetch(firmwareFileUrl);

        if (!firmwareFile.ok || !firmwareFile.body) {
            console.error(`${logPrefix} Invalid response from ${firmwareFileUrl} status=${firmwareFile.status}.`);
            return ProcessFirmwareImageStatus.RequestFailed;
        }

        if (tar) {
            assert(tarImageFinder, "No image finder function supplied for tar.");

            const archiveBuffer = Buffer.from(await firmwareFile.arrayBuffer());
            const archiveFilePath = path.join(baseOutDir, firmwareFileName);

            writeFileSync(archiveFilePath, archiveBuffer);

            try {
                firmwareFileName = await tarExtract(archiveFilePath, baseOutDir, tarImageFinder);
            } catch {
                console.error(`${logPrefix} No image found for ${firmwareFileUrl}.`);
                return ProcessFirmwareImageStatus.TarNoImage;
            }
        }

        const firmwareBuffer = tar ? readFileSync(path.join(baseOutDir, firmwareFileName)) : Buffer.from(await firmwareFile.arrayBuffer());
        // make sure to parse from the actual start of the "spec OTA" portion of the file (e.g. Ikea has non-spec meta before)
        const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));
        const [baseMatchIndex, baseMatch] = findMatchImage(parsedImage, baseManifest, extraMetas);
        const statusToBase = getParsedImageStatus(parsedImage, baseMatch);

        switch (statusToBase) {
            case ParsedImageStatus.Older: {
                // if prev doesn't have a match, move to prev
                const [prevMatchIndex, prevMatch] = findMatchImage(parsedImage, prevManifest, extraMetas);
                const statusToPrev = getParsedImageStatus(parsedImage, prevMatch);

                switch (statusToPrev) {
                    case ParsedImageStatus.Older:
                    case ParsedImageStatus.Identical: {
                        console.log(
                            `${logPrefix} Base manifest has higher version and an equal or better match is already present in prev manifest. Ignoring.`,
                        );

                        break;
                    }

                    case ParsedImageStatus.Newer:
                    case ParsedImageStatus.New: {
                        addImageToPrev(
                            logPrefix,
                            statusToPrev === ParsedImageStatus.Newer,
                            prevManifest,
                            prevMatchIndex,
                            prevMatch!,
                            prevOutDir,
                            firmwareFileName,
                            manufacturer,
                            parsedImage,
                            firmwareBuffer,
                            firmwareFileUrl,
                            extraMetas,
                            () => {
                                firmwareFilePath = path.join(prevOutDir, firmwareFileName);

                                // write before adding to manifest, in case of failure (throw), manifest won't have a broken link
                                writeFileSync(firmwareFilePath, firmwareBuffer);
                            },
                        );

                        break;
                    }
                }

                break;
            }

            case ParsedImageStatus.Identical: {
                console.log(`${logPrefix} Base manifest already has version ${parsedImage.fileVersion}. Ignoring.`);

                break;
            }

            case ParsedImageStatus.Newer:
            case ParsedImageStatus.New: {
                addImageToBase(
                    logPrefix,
                    statusToBase === ParsedImageStatus.Newer,
                    prevManifest,
                    prevOutDir,
                    baseManifest,
                    baseMatchIndex,
                    baseMatch!,
                    baseOutDir,
                    firmwareFileName,
                    manufacturer,
                    parsedImage,
                    firmwareBuffer,
                    firmwareFileUrl,
                    extraMetas,
                    () => {
                        firmwareFilePath = path.join(baseOutDir, firmwareFileName);

                        // write before adding to manifest, in case of failure (throw), manifest won't have a broken link
                        writeFileSync(firmwareFilePath, firmwareBuffer);
                    },
                );

                break;
            }
        }
    } catch (error) {
        console.error(`${logPrefix} Failed to save firmware file ${firmwareFileName}: ${(error as Error).stack!}.`);

        /* v8 ignore start */
        if (firmwareFilePath) {
            rmSync(firmwareFilePath, {force: true});
        }
        /* v8 ignore stop */

        return ProcessFirmwareImageStatus.Error;
    }

    writeManifest(PREV_INDEX_MANIFEST_FILENAME, prevManifest);
    writeManifest(BASE_INDEX_MANIFEST_FILENAME, baseManifest);

    console.log(`Prev manifest has ${prevManifest.length} images.`);
    console.log(`Base manifest has ${baseManifest.length} images.`);

    return ProcessFirmwareImageStatus.Success;
}
