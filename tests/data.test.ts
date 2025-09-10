/**
 * Notes:
 *
 * - URLs are initially set to 'wherever the file should end up based on version'. For tests requiring special moves, they will need to be swapped.
 *
 */

import {copyFileSync, existsSync, mkdirSync} from "node:fs";
import path from "node:path";
import {it} from "vitest";
import * as common from "../src/common";
import type {ExtraMetas, RepoImageMeta} from "../src/types";

export const IMAGE_GLEDOPTO = "GL-B-008P_V17A1_OTAV7.ota";
export const IMAGE_TUYA = "1662693814-oem_mg21_zg_nh_win_cover_relay_OTA_1.0.7.bin";
export const IMAGE_V14_1 = "ZLinky_router_v14.ota";
export const IMAGE_V14_2 = "ZLinky_router_v14_limited.ota";
export const IMAGE_V13_1 = "ZLinky_router_v13.ota";
export const IMAGE_V13_2 = "ZLinky_router_v13_limited.ota";
export const IMAGE_V12_1 = "ZLinky_router_v12.ota";
export const IMAGE_V12_2 = "ZLinky_router_v12_limited.ota";
export const IMAGE_V14_2_COPY = "ZLinky_router_v14_limited-copy.ota";
export const IMAGE_INVALID = "not-a-valid-file.ota";
export const IMAGE_TAR = "45856_00000006.tar.gz";
export const IMAGE_TAR_OTA = "Jasco_5_0_1_OnOff_45856_v6.ota";
export const IMAGES_TEST_DIR = "test-tmp";
export const BASE_IMAGES_TEST_DIR_PATH = path.join(common.BASE_IMAGES_DIR, IMAGES_TEST_DIR);
export const PREV_IMAGES_TEST_DIR_PATH = path.join(common.PREV_IMAGES_DIR, IMAGES_TEST_DIR);
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 1,
 * - fileVersion: 14,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-JN5189-0000000000000',
 * - totalImageSize: 249694
 */
export const IMAGE_V14_1_METAS = {
    fileName: IMAGE_V14_1,
    fileVersion: 14,
    fileSize: 249694,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_V14_1}`,
    imageType: 1,
    manufacturerCode: 4151,
    sha512: "cc69b0745c72daf8deda935ba47aa7abd34dfcaaa4bc35bfa0605cd7937b0ecd8582ba0c08110df4f620c8aa87798d201f407d3d7e17198cfef1a4aa13c5013d",
    otaHeaderString: "OM15081-RTR-JN5189-0000000000000",
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 2,
 * - fileVersion: 14,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-LIMITED-JN5189-00000',
 * - totalImageSize: 249694
 */
export const IMAGE_V14_2_METAS = {
    fileName: IMAGE_V14_2,
    fileVersion: 14,
    fileSize: 249694,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_V14_2}`,
    imageType: 2,
    manufacturerCode: 4151,
    sha512: "f851cbff7297ba6223a969ba8da5182f9ef199cf9c8459c8408432e48485c1a8f018f6e1703a42f40143cccd3bf460c0acd92117d899e507a36845f24e970595",
    otaHeaderString: "OM15081-RTR-LIMITED-JN5189-00000",
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 1,
 * - fileVersion: 13,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-JN5189-0000000000000',
 * - totalImageSize: 245406
 */
export const IMAGE_V13_1_METAS = {
    fileName: IMAGE_V13_1,
    fileVersion: 13,
    fileSize: 245406,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images1/${IMAGES_TEST_DIR}/${IMAGE_V13_1}`,
    imageType: 1,
    manufacturerCode: 4151,
    sha512: "4d7ab47dcb24e478e0abb35e691222b7691e77ed5a56de3f9c82e8682730649b1a154110b7207d4391c32eae53a869e20878e880fc153dbe046690b870be8486",
    otaHeaderString: "OM15081-RTR-JN5189-0000000000000",
};

/**
 * Use when V14 has a hardware constraint set.
 */
export const IMAGE_V13_1_METAS_MAIN = {
    ...IMAGE_V13_1_METAS,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_V13_1}`,
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 2,
 * - fileVersion: 13,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-LIMITED-JN5189-00000',
 * - totalImageSize: 245406
 */
export const IMAGE_V13_2_METAS = {
    fileName: IMAGE_V13_2,
    fileVersion: 13,
    fileSize: 245406,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images1/${IMAGES_TEST_DIR}/${IMAGE_V13_2}`,
    imageType: 2,
    manufacturerCode: 4151,
    sha512: "dd77b28a3b4664e7ad944fcffaa9eca9f3adb0bbe598e12bdd6eece8070a8cdda6792bed378d173dd5b4532b4cdb88cebda0ef0c432c4c4d6581aa9f2bbba54d",
    otaHeaderString: "OM15081-RTR-LIMITED-JN5189-00000",
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 1,
 * - fileVersion: 12,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-JN5189-0000000000000',
 * - totalImageSize: 245710
 */
export const IMAGE_V12_1_METAS = {
    fileName: IMAGE_V12_1,
    fileVersion: 12,
    fileSize: 245710,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images1/${IMAGES_TEST_DIR}/${IMAGE_V12_1}`,
    imageType: 1,
    manufacturerCode: 4151,
    sha512: "5d7e0a20141b78b85b4b046e623bc2bba24b28563464fe70227e79d0acdd5c0bde2adbd9d2557bd6cdfef2036d964c35c9e1746a8f1356af3325dd96f7a80e56",
    otaHeaderString: "OM15081-RTR-JN5189-0000000000000",
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4151,
 * - imageType: 2,
 * - fileVersion: 12,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'OM15081-RTR-LIMITED-JN5189-00000',
 * - totalImageSize: 245710
 */
export const IMAGE_V12_2_METAS = {
    fileName: IMAGE_V12_2,
    fileVersion: 12,
    fileSize: 245710,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images1/${IMAGES_TEST_DIR}/${IMAGE_V12_2}`,
    imageType: 2,
    manufacturerCode: 4151,
    sha512: "4e178e56c1559e11734c07abbb95110675df7738f3ca3e5dbc99393325295ff6c66bd63ba55c0ef6043a80608dbec2be7a1e845f31ffd94f1cb63f32f0d48c6e",
    otaHeaderString: "OM15081-RTR-LIMITED-JN5189-00000",
};
/** with manuf */
export const IMAGE_V14_2_MANUF_METAS = {
    fileName: IMAGE_V14_2_COPY,
    fileVersion: 14,
    fileSize: 249694,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_V14_2_COPY}`,
    imageType: 2,
    manufacturerCode: 4151,
    sha512: "f851cbff7297ba6223a969ba8da5182f9ef199cf9c8459c8408432e48485c1a8f018f6e1703a42f40143cccd3bf460c0acd92117d899e507a36845f24e970595",
    otaHeaderString: "OM15081-RTR-LIMITED-JN5189-00000",
    manufacturerName: ["lixee"],
};
/** obviously bogus, just for mocking */
export const IMAGE_INVALID_METAS = {
    fileName: IMAGE_INVALID,
    fileVersion: 0,
    fileSize: 0,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_INVALID}`,
    imageType: 1,
    manufacturerCode: 65535,
    sha512: "abcd",
    otaHeaderString: "nothing",
};
/**
 * - otaUpgradeFileIdentifier: <Buffer 1e f1 ee 0b>,
 * - otaHeaderVersion: 256,
 * - otaHeaderLength: 56,
 * - otaHeaderFieldControl: 0,
 * - manufacturerCode: 4388,
 * - imageType: 2,
 * - fileVersion: 6,
 * - zigbeeStackVersion: 2,
 * - otaHeaderString: 'Jasco 45856 image',
 * - totalImageSize: 162302
 */
export const IMAGE_TAR_METAS = {
    fileName: IMAGE_TAR_OTA,
    fileVersion: 6,
    fileSize: 162302,
    originalUrl: undefined,
    url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/images/${IMAGES_TEST_DIR}/${IMAGE_TAR_OTA}`,
    imageType: 2,
    manufacturerCode: 4388,
    sha512: "3306332e001eab9d71c9360089d450ea21e2c08bac957b523643c042707887e85db0c510f3480bdbcfcfe2398eeaad88d455f346f1e07841e1d690d8c16dc211",
    otaHeaderString: "Jasco 45856 image",
};

export const getImageOriginalDirPath = (imageName: string): string => {
    // allow running in vitest explorer
    return path.join(path.resolve().endsWith("tests") ? "." : "tests", common.BASE_IMAGES_DIR, imageName);
};

export const useImage = (imageName: string, outDir: string = BASE_IMAGES_TEST_DIR_PATH): {filename: string} => {
    const realPath = path.join(outDir, imageName);

    if (!existsSync(outDir)) {
        mkdirSync(outDir, {recursive: true});
    }

    copyFileSync(getImageOriginalDirPath(imageName), realPath);

    // return as posix for github match
    return {filename: path.posix.join(outDir.replaceAll("\\", "/"), imageName)};
};

export const withExtraMetas = (meta: RepoImageMeta, extraMetas: ExtraMetas): RepoImageMeta => {
    return Object.assign({}, structuredClone(meta), extraMetas);
};

export const getAdjustedContent = (fileName: string, content: RepoImageMeta[]): RepoImageMeta[] => {
    return content.map((c) => {
        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME && c.url.includes(`/${common.PREV_IMAGES_DIR}/`)) {
            return withExtraMetas(c, {
                // @ts-expect-error override
                url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/${common.BASE_IMAGES_DIR}/${IMAGES_TEST_DIR}/${c.fileName}`,
            });
        }

        if (fileName === common.PREV_INDEX_MANIFEST_FILENAME && c.url.includes(`${common.BASE_IMAGES_DIR}`)) {
            return withExtraMetas(c, {
                // @ts-expect-error override
                url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/${common.PREV_IMAGES_DIR}/${IMAGES_TEST_DIR}/${c.fileName}`,
            });
        }

        return c;
    });
};

// required to consider as a 'test suite'
it("passes", () => {});
