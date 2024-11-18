import type {ExtraMetas, ExtraMetasWithFileName, ImageHeader, RepoImageMeta} from './types';

import assert from 'assert';
import {exec} from 'child_process';
import {createHash} from 'crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'fs';
import path from 'path';

export const UPGRADE_FILE_IDENTIFIER = Buffer.from([0x1e, 0xf1, 0xee, 0x0b]);
export const BASE_REPO_URL = `https://github.com/Koenkk/zigbee-OTA/raw/`;
export const REPO_BRANCH = 'master';
/** Images used by OTA upgrade process */
export const BASE_IMAGES_DIR = 'images';
/** Images used by OTA downgrade process */
export const PREV_IMAGES_DIR = 'images1';
/** Manifest used by OTA upgrade process */
export const BASE_INDEX_MANIFEST_FILENAME = 'index.json';
/** Manifest used by OTA downgrade process */
export const PREV_INDEX_MANIFEST_FILENAME = 'index1.json';
export const CACHE_DIR = '.cache';
export const TMP_DIR = 'tmp';
export const PR_ARTIFACT_DIR = 'pr';
export const PR_DIFF_FILENAME = 'PR_DIFF';
export const PR_ERROR_FILENAME = 'PR_ERROR';
export const PR_NUMBER_FILENAME = 'PR_NUMBER';
export const PR_ARTIFACT_DIFF_FILEPATH = path.join(PR_ARTIFACT_DIR, PR_DIFF_FILENAME);
export const PR_ARTIFACT_ERROR_FILEPATH = path.join(PR_ARTIFACT_DIR, PR_ERROR_FILENAME);
export const PR_ARTIFACT_NUMBER_FILEPATH = path.join(PR_ARTIFACT_DIR, PR_NUMBER_FILENAME);
/**
 * 'ikea_new' first, to prioritize downloads from new URL
 */
export const ALL_AUTODL_MANUFACTURERS = [
    'gammatroniques',
    'ikea_new',
    'ikea',
    'inovelli',
    'jethome',
    'ledvance',
    'lixee',
    'salus',
    'ubisys',
    'xyzroe',
];

export async function execute(command: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        exec(command, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

export function primitivesArrayEquals(a: (string | number | boolean)[], b: (string | number | boolean)[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
}

export function computeSHA512(buffer: Buffer): string {
    const hash = createHash('sha512');

    hash.update(buffer);

    return hash.digest('hex');
}

export function getOutDir(folderName: string, basePath: string = BASE_IMAGES_DIR): string {
    const outDir = path.join(basePath, folderName);

    if (!existsSync(outDir)) {
        mkdirSync(outDir, {recursive: true});
    }

    return outDir;
}

export function getRepoFirmwareFileUrl(folderName: string, fileName: string, basePath: string = BASE_IMAGES_DIR): string {
    return BASE_REPO_URL + path.posix.join(REPO_BRANCH, basePath, folderName, fileName);
}

export function writeManifest(fileName: string, firmwareList: RepoImageMeta[]): void {
    writeFileSync(fileName, JSON.stringify(firmwareList, undefined, 2), 'utf8');
}

export function readManifest(fileName: string): RepoImageMeta[] {
    return JSON.parse(readFileSync(fileName, 'utf8'));
}

export function writeCacheJson<T>(fileName: string, contents: T, basePath: string = CACHE_DIR): void {
    writeFileSync(path.join(basePath, `${fileName}.json`), JSON.stringify(contents), 'utf8');
}

export function readCacheJson<T>(fileName: string, basePath: string = CACHE_DIR): T {
    const filePath = path.join(basePath, `${fileName}.json`);

    return existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : undefined;
}

export function parseImageHeader(buffer: Buffer): ImageHeader {
    try {
        const header: ImageHeader = {
            otaUpgradeFileIdentifier: buffer.subarray(0, 4),
            otaHeaderVersion: buffer.readUInt16LE(4),
            otaHeaderLength: buffer.readUInt16LE(6),
            otaHeaderFieldControl: buffer.readUInt16LE(8),
            manufacturerCode: buffer.readUInt16LE(10),
            imageType: buffer.readUInt16LE(12),
            fileVersion: buffer.readUInt32LE(14),
            zigbeeStackVersion: buffer.readUInt16LE(18),
            otaHeaderString: buffer.toString('utf8', 20, 52),
            totalImageSize: buffer.readUInt32LE(52),
        };
        let headerPos = 56;

        if (header.otaHeaderFieldControl & 1) {
            header.securityCredentialVersion = buffer.readUInt8(headerPos);
            headerPos += 1;
        }

        if (header.otaHeaderFieldControl & 2) {
            header.upgradeFileDestination = buffer.subarray(headerPos, headerPos + 8);
            headerPos += 8;
        }

        if (header.otaHeaderFieldControl & 4) {
            header.minimumHardwareVersion = buffer.readUInt16LE(headerPos);
            headerPos += 2;
            header.maximumHardwareVersion = buffer.readUInt16LE(headerPos);
            headerPos += 2;
        }

        assert(UPGRADE_FILE_IDENTIFIER.equals(header.otaUpgradeFileIdentifier), `Invalid upgrade file identifier`);

        return header;
    } catch (error) {
        throw new Error(`Not a valid OTA file (${(error as Error).message}).`);
    }
}

/**
 * Adapted from zigbee-herdsman-converters logic
 */
export function findMatchImage(
    image: ImageHeader,
    imageList: RepoImageMeta[],
    extraMetas: ExtraMetas,
): [index: number, image: RepoImageMeta | undefined] {
    const imageIndex = imageList.findIndex(
        (i) =>
            i.imageType === image.imageType &&
            i.manufacturerCode === image.manufacturerCode &&
            extraMetas.minFileVersion === i.minFileVersion &&
            extraMetas.maxFileVersion === i.maxFileVersion &&
            i.modelId === extraMetas.modelId &&
            (!(i.manufacturerName && extraMetas.manufacturerName) || primitivesArrayEquals(i.manufacturerName, extraMetas.manufacturerName)),
    );

    return [imageIndex, imageIndex === -1 ? undefined : imageList[imageIndex]];
}

export function changeRepoUrl(repoUrl: string, fromDir: string, toDir: string): string {
    return repoUrl.replace(path.posix.join(REPO_BRANCH, fromDir), path.posix.join(REPO_BRANCH, toDir));
}

export async function getJson<T>(manufacturer: string, pageUrl: string): Promise<T | undefined> {
    const response = await fetch(pageUrl);

    if (!response.ok || !response.body) {
        console.error(`[${manufacturer}] Invalid response from ${pageUrl} status=${response.status}.`);
        return;
    }

    return (await response.json()) as T;
}

export async function getText(manufacturer: string, pageUrl: string): Promise<string | undefined> {
    const response = await fetch(pageUrl);

    if (!response.ok || !response.body) {
        console.error(`[${manufacturer}] Invalid response from ${pageUrl} status=${response.status}.`);
        return;
    }

    return await response.text();
}

export function getLatestImage<T>(list: T[], compareFn: (a: T, b: T) => number): T | undefined {
    const sortedList = list.sort(compareFn);

    return sortedList.slice(0, sortedList.length > 1 && process.env.PREV ? -1 : undefined).pop();
}

export const enum ParsedImageStatus {
    NEW = 0,
    NEWER = 1,
    OLDER = 2,
    IDENTICAL = 3,
}

export function getParsedImageStatus(parsedImage: ImageHeader, match?: RepoImageMeta): ParsedImageStatus {
    if (match) {
        if (match.fileVersion > parsedImage.fileVersion) {
            return ParsedImageStatus.OLDER;
        } else if (match.fileVersion < parsedImage.fileVersion) {
            return ParsedImageStatus.NEWER;
        } else {
            return ParsedImageStatus.IDENTICAL;
        }
    } else {
        return ParsedImageStatus.NEW;
    }
}

/**
 * Prevent irrelevant metas from being added to manifest.
 *
 * NOTE: fileName should be deleted before adding to manifest for consistency (always use original file name).
 * @param metas
 * @returns
 */
export function getValidMetas(metas: Partial<ExtraMetas & ExtraMetasWithFileName & RepoImageMeta>, ignoreFileName: boolean): ExtraMetasWithFileName {
    const validMetas: ExtraMetasWithFileName = {};

    if (!ignoreFileName) {
        if (metas.fileName != undefined) {
            if (typeof metas.fileName != 'string') {
                throw new Error(`Invalid format for 'fileName', expected 'string' type.`);
            }

            validMetas.fileName = metas.fileName;
        }
    }

    if (metas.originalUrl != undefined) {
        if (typeof metas.originalUrl != 'string') {
            throw new Error(`Invalid format for 'originalUrl', expected 'string' type.`);
        }

        validMetas.originalUrl = metas.originalUrl;
    }

    if (metas.force != undefined) {
        if (typeof metas.force != 'boolean') {
            throw new Error(`Invalid format for 'force', expected 'boolean' type.`);
        }

        validMetas.force = metas.force;
    }

    if (metas.hardwareVersionMax != undefined) {
        if (typeof metas.hardwareVersionMax != 'number') {
            throw new Error(`Invalid format for 'hardwareVersionMax', expected 'number' type.`);
        }

        validMetas.hardwareVersionMax = metas.hardwareVersionMax;
    }

    if (metas.hardwareVersionMin != undefined) {
        if (typeof metas.hardwareVersionMin != 'number') {
            throw new Error(`Invalid format for 'hardwareVersionMin', expected 'number' type.`);
        }

        validMetas.hardwareVersionMin = metas.hardwareVersionMin;
    }

    if (metas.manufacturerName != undefined) {
        if (!Array.isArray(metas.manufacturerName) || metas.manufacturerName.length < 1 || metas.manufacturerName.some((m) => typeof m != 'string')) {
            throw new Error(`Invalid format for 'manufacturerName', expected 'array of string' type.`);
        }

        validMetas.manufacturerName = metas.manufacturerName;
    }

    if (metas.maxFileVersion != undefined) {
        if (typeof metas.maxFileVersion != 'number') {
            throw new Error(`Invalid format for 'maxFileVersion', expected 'number' type.`);
        }

        validMetas.maxFileVersion = metas.maxFileVersion;
    }

    if (metas.minFileVersion != undefined) {
        if (typeof metas.minFileVersion != 'number') {
            throw new Error(`Invalid format for 'minFileVersion', expected 'number' type.`);
        }

        validMetas.minFileVersion = metas.minFileVersion;
    }

    if (metas.modelId != undefined) {
        if (typeof metas.modelId != 'string') {
            throw new Error(`Invalid format for 'modelId', expected 'string' type.`);
        }

        validMetas.modelId = metas.modelId;
    }

    if (metas.releaseNotes != undefined) {
        if (typeof metas.releaseNotes != 'string') {
            throw new Error(`Invalid format for 'releaseNotes', expected 'string' type.`);
        }

        validMetas.releaseNotes = metas.releaseNotes;
    }

    return validMetas;
}

export function addImageToPrev(
    logPrefix: string,
    isNewer: boolean,
    prevManifest: RepoImageMeta[],
    prevMatchIndex: number,
    prevMatch: RepoImageMeta,
    prevOutDir: string,
    firmwareFileName: string,
    manufacturer: string,
    parsedImage: ImageHeader,
    firmwareBuffer: Buffer,
    originalUrl: string | undefined,
    extraMetas: ExtraMetas,
    onBeforeManifestPush: () => void,
): void {
    console.log(`${logPrefix} Base manifest has higher version. Adding to prev instead.`);

    if (isNewer) {
        console.log(`${logPrefix} Removing prev image.`);
        prevManifest.splice(prevMatchIndex, 1);

        // make sure fileName exists for migration from old system
        const prevFileName = prevMatch.fileName ? prevMatch.fileName : prevMatch.url.split('/').pop()!;

        rmSync(path.join(prevOutDir, prevFileName), {force: true});
    }

    onBeforeManifestPush();
    prevManifest.push({
        fileName: firmwareFileName,
        fileVersion: parsedImage.fileVersion,
        fileSize: parsedImage.totalImageSize,
        originalUrl,
        url: getRepoFirmwareFileUrl(manufacturer, firmwareFileName, PREV_IMAGES_DIR),
        imageType: parsedImage.imageType,
        manufacturerCode: parsedImage.manufacturerCode,
        sha512: computeSHA512(firmwareBuffer),
        otaHeaderString: parsedImage.otaHeaderString,
        ...extraMetas,
    });
}

export function addImageToBase(
    logPrefix: string,
    isNewer: boolean,
    prevManifest: RepoImageMeta[],
    prevOutDir: string,
    baseManifest: RepoImageMeta[],
    baseMatchIndex: number,
    baseMatch: RepoImageMeta,
    baseOutDir: string,
    firmwareFileName: string,
    manufacturer: string,
    parsedImage: ImageHeader,
    firmwareBuffer: Buffer,
    originalUrl: string | undefined,
    extraMetas: ExtraMetas,
    onBeforeManifestPush: () => void,
): void {
    if (isNewer) {
        console.log(`${logPrefix} Base manifest has older version ${baseMatch.fileVersion}. Replacing with ${parsedImage.fileVersion}.`);

        const [prevMatchIndex, prevMatch] = findMatchImage(parsedImage, prevManifest, extraMetas);
        const prevStatus = getParsedImageStatus(parsedImage, prevMatch);

        if (prevStatus !== ParsedImageStatus.OLDER && prevStatus !== ParsedImageStatus.NEW) {
            console.warn(`${logPrefix} Base image is new/newer but prev image is not older/non-existing.`);
        }

        if (prevStatus !== ParsedImageStatus.NEW) {
            console.log(`${logPrefix} Removing prev image.`);
            prevManifest.splice(prevMatchIndex, 1);

            // make sure fileName exists for migration from old system
            const prevFileName = prevMatch!.fileName ? prevMatch!.fileName : prevMatch!.url.split('/').pop()!;

            rmSync(path.join(prevOutDir, prevFileName), {force: true});
        }

        // relocate base to prev
        // make sure fileName exists for migration from old system
        const baseFileName = baseMatch.fileName ? baseMatch.fileName : baseMatch.url.split('/').pop()!;
        const baseFilePath = path.join(baseOutDir, baseFileName);

        // if for some reason the file is no longer present (should not happen), don't add it to prev since link is broken
        if (existsSync(baseFilePath)) {
            renameSync(baseFilePath, path.join(prevOutDir, baseFileName));

            baseMatch!.url = changeRepoUrl(baseMatch.url, BASE_IMAGES_DIR, PREV_IMAGES_DIR);

            prevManifest.push(baseMatch);
        } else {
            console.error(`${logPrefix} Image file '${baseFilePath}' does not exist. Not moving to prev.`);
        }

        baseManifest.splice(baseMatchIndex, 1);
    } else {
        console.log(`${logPrefix} Base manifest does not have version ${parsedImage.fileVersion}. Adding.`);
    }

    onBeforeManifestPush();
    baseManifest.push({
        fileName: firmwareFileName,
        fileVersion: parsedImage.fileVersion,
        fileSize: parsedImage.totalImageSize,
        originalUrl,
        url: getRepoFirmwareFileUrl(manufacturer, firmwareFileName, BASE_IMAGES_DIR),
        imageType: parsedImage.imageType,
        manufacturerCode: parsedImage.manufacturerCode,
        sha512: computeSHA512(firmwareBuffer),
        otaHeaderString: parsedImage.otaHeaderString,
        ...extraMetas,
    });
}
