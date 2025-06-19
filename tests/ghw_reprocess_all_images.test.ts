import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync} from "node:fs";
import path from "node:path";
import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi} from "vitest";
import * as common from "../src/common";
import {
    NOT_IN_BASE_MANIFEST_IMAGES_DIR,
    NOT_IN_MANIFEST_FILENAME,
    NOT_IN_PREV_MANIFEST_IMAGES_DIR,
    reProcessAllImages,
} from "../src/ghw_reprocess_all_images";
import type {RepoImageMeta} from "../src/types";
import {
    BASE_IMAGES_TEST_DIR_PATH,
    getAdjustedContent,
    getImageOriginalDirPath,
    IMAGE_INVALID,
    IMAGE_INVALID_METAS,
    IMAGE_V12_1,
    IMAGE_V13_1,
    IMAGE_V13_1_METAS,
    IMAGE_V14_1,
    IMAGE_V14_1_METAS,
    IMAGES_TEST_DIR,
    PREV_IMAGES_TEST_DIR_PATH,
    useImage,
    withExtraMetas,
} from "./data.test";

/** not used */
const github = {};
const core: Partial<typeof CoreApi> = {
    debug: console.debug,
    info: console.log,
    warning: console.warn,
    error: console.error,
    notice: console.log,
    startGroup: vi.fn(),
    endGroup: vi.fn(),
};
const context: Partial<Context> = {
    payload: {},
    repo: {
        owner: "Koenkk",
        repo: "zigbee-OTA",
    },
};

const OLD_META_3RD_PARTY_1_REAL_IMAGE = IMAGE_V13_1;
const OLD_META_3RD_PARTY_1_REAL_METAS = IMAGE_V13_1_METAS;
const OLD_META_3RD_PARTY_1_METAS = {
    fileVersion: 1124103171,
    fileSize: 258104,
    manufacturerCode: 4107,
    imageType: 256,
    sha512: "c63a1eb02ac030f3a76d9e81a4d48695796457d263bb1dae483688134e550d9846c37a3fd0eab2d4670f12f11b79691a5cf2789af0dbd90d703512496190a0a5",
    // mock fileName to trigger mocked fetch properly
    url: `https://otau.meethue.com/storage/ZGB_100B_0100/2dcfe6e6-0177-4c81-a1d9-4d2bd2ea1fb7/${OLD_META_3RD_PARTY_1_REAL_IMAGE}`,
};
const OLD_META_3RD_PARTY_2_REAL_IMAGE = IMAGE_V14_1;
const OLD_META_3RD_PARTY_2_REAL_METAS = IMAGE_V14_1_METAS;
const OLD_META_3RD_PARTY_2_METAS = {
    fileVersion: 192,
    fileSize: 307682,
    manufacturerCode: 4417,
    imageType: 54179,
    modelId: "TS011F",
    sha512: "01939ca4fc790432d2c233e19b2440c1e0248d2ce85c9299e0b88928cb2341de675350ac7b78187a25f06a2768f93db0a17c4ba950b60c82c072e0c0833cfcfb",
    // mock fileName to trigger mocked fetch properly
    url: `https://images.tuyaeu.com/smart/firmware/upgrade/20220907/${OLD_META_3RD_PARTY_2_REAL_IMAGE}`,
};
const OLD_META_3RD_PARTY_IGNORED_METAS = {
    fileVersion: 317,
    fileSize: 693230,
    manufacturerCode: 13379,
    imageType: 4113,
    sha512: "66040fb2b2787bf8ebfc75bc3c7356c7d8b966b4c82282bd7393783b8dc453ec2c8dcb4d7c9fe7c0a83d87739bd3677f205d79edddfa4fa2749305ca987887b1",
    url: "https://github.com/xyzroe/ZigUSB_C6/releases/download/317/ZigUSB_C6.ota",
};
const NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH = path.join(NOT_IN_BASE_MANIFEST_IMAGES_DIR, IMAGES_TEST_DIR);
const NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH = path.join(NOT_IN_PREV_MANIFEST_IMAGES_DIR, IMAGES_TEST_DIR);
const NOT_IN_BASE_MANIFEST_FILEPATH = path.join(NOT_IN_BASE_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME);
const NOT_IN_PREV_MANIFEST_FILEPATH = path.join(NOT_IN_PREV_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME);
// move to tmp dirs in `beforeAll` to allow tests to run (reverted in `afterAll`)
const NOT_IN_PREV_MANIFEST_IMAGES_DIR_TMP = `${NOT_IN_PREV_MANIFEST_IMAGES_DIR}-moved-by-jest`;
const NOT_IN_BASE_MANIFEST_IMAGES_DIR_TMP = `${NOT_IN_BASE_MANIFEST_IMAGES_DIR}-moved-by-jest`;

describe("Github Workflow: Re-Process All Images", () => {
    let baseManifest: RepoImageMeta[];
    let prevManifest: RepoImageMeta[];
    let notInBaseManifest: RepoImageMeta[];
    let notInPrevManifest: RepoImageMeta[];
    let readManifestSpy: MockInstance;
    let writeManifestSpy: MockInstance;
    let addImageToBaseSpy: MockInstance;
    let addImageToPrevSpy: MockInstance;
    let coreWarningSpy: MockInstance;
    let coreErrorSpy: MockInstance;

    const getManifest = (fileName: string): RepoImageMeta[] => {
        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME) {
            return baseManifest;
        }

        if (fileName === common.PREV_INDEX_MANIFEST_FILENAME) {
            return prevManifest;
        }

        if (fileName === path.join(NOT_IN_BASE_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME)) {
            return notInBaseManifest;
        }

        if (fileName === path.join(NOT_IN_PREV_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME)) {
            return notInPrevManifest;
        }

        throw new Error(`${fileName} not supported`);
    };

    const setManifest = (fileName: string, content: RepoImageMeta[]): void => {
        const adjustedContent = getAdjustedContent(fileName, content);

        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME) {
            baseManifest = adjustedContent;
        } else if (fileName === common.PREV_INDEX_MANIFEST_FILENAME) {
            prevManifest = adjustedContent;
        } else if (fileName === path.join(NOT_IN_BASE_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME)) {
            notInBaseManifest = adjustedContent;
        } else if (fileName === path.join(NOT_IN_PREV_MANIFEST_IMAGES_DIR, NOT_IN_MANIFEST_FILENAME)) {
            notInPrevManifest = adjustedContent;
        } else {
            throw new Error(`${fileName} not supported`);
        }
    };

    const resetManifests = (): void => {
        baseManifest = [];
        prevManifest = [];
    };

    const withOldMetas = (metas: RepoImageMeta): RepoImageMeta => {
        const oldMetas = structuredClone(metas);
        // biome-ignore lint/performance/noDelete: <explanation>
        delete oldMetas.originalUrl;
        // @ts-expect-error mock
        // biome-ignore lint/performance/noDelete: <explanation>
        delete oldMetas.sha512;

        return oldMetas;
    };

    const expectWriteNoChange = (nth: number, fileName: string): void => {
        expect(writeManifestSpy).toHaveBeenNthCalledWith(nth, fileName, getManifest(fileName));
    };

    beforeAll(() => {
        if (existsSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR)) {
            renameSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR, NOT_IN_PREV_MANIFEST_IMAGES_DIR_TMP);
        }

        if (existsSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR)) {
            renameSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR, NOT_IN_BASE_MANIFEST_IMAGES_DIR_TMP);
        }
    });

    afterAll(() => {
        readManifestSpy.mockRestore();
        writeManifestSpy.mockRestore();
        addImageToBaseSpy.mockRestore();
        addImageToPrevSpy.mockRestore();
        coreWarningSpy.mockRestore();
        coreErrorSpy.mockRestore();
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, {recursive: true, force: true});
        rmSync(NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH, {recursive: true, force: true});

        if (existsSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR_TMP)) {
            rmSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR, {recursive: true, force: true});
            renameSync(NOT_IN_PREV_MANIFEST_IMAGES_DIR_TMP, NOT_IN_PREV_MANIFEST_IMAGES_DIR);
        }

        if (existsSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR_TMP)) {
            rmSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR, {recursive: true, force: true});
            renameSync(NOT_IN_BASE_MANIFEST_IMAGES_DIR_TMP, NOT_IN_BASE_MANIFEST_IMAGES_DIR);
        }

        rmSync(IMAGES_TEST_DIR, {recursive: true, force: true});
    });

    beforeEach(() => {
        resetManifests();

        readManifestSpy = vi.spyOn(common, "readManifest").mockImplementation(getManifest);
        writeManifestSpy = vi.spyOn(common, "writeManifest").mockImplementation(setManifest);
        addImageToBaseSpy = vi.spyOn(common, "addImageToBase");
        addImageToPrevSpy = vi.spyOn(common, "addImageToPrev");
        coreWarningSpy = vi.spyOn(core, "warning");
        coreErrorSpy = vi.spyOn(core, "error");
    });

    afterEach(() => {
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, {recursive: true, force: true});
        rmSync(NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH, {recursive: true, force: true});
    });

    it("failure when moving not in manifest if base out directory is not empty", async () => {
        mkdirSync(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, {recursive: true});
        copyFileSync(getImageOriginalDirPath(IMAGE_V12_1), path.join(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, IMAGE_V12_1));

        await expect(async () => {
            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, false, true);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("is not empty")}));
    });

    it("failure when moving not in manifest if prev out directory is not empty", async () => {
        mkdirSync(NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH, {recursive: true});
        copyFileSync(getImageOriginalDirPath(IMAGE_V12_1), path.join(NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH, IMAGE_V12_1));

        await expect(async () => {
            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, false, true);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("is not empty")}));
    });

    it("failure when image not in subdirectory", async () => {
        // this is renaming the image to the same as the test dir name for simplicity in code exclusion
        const outPath = path.join(common.PREV_IMAGES_DIR, IMAGES_TEST_DIR);

        if (!existsSync(common.PREV_IMAGES_DIR)) {
            mkdirSync(common.PREV_IMAGES_DIR, {recursive: true});
        }

        copyFileSync(getImageOriginalDirPath(IMAGE_V12_1), outPath);

        await expect(async () => {
            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, false, true);
        }).rejects.toThrow(
            expect.objectContaining({message: expect.stringContaining(`Detected file in ${common.PREV_IMAGES_DIR} not in subdirectory`)}),
        );

        rmSync(outPath, {force: true});
    });

    it("removes image not in manifest", async () => {
        const imagePath = useImage(IMAGE_V12_1, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(imagePath.filename)).toStrictEqual(false);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
        expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
        expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Not found in base manifest:"));
    });

    it("removes multiple images not in manifest", async () => {
        const image1Path = useImage(IMAGE_V13_1, BASE_IMAGES_TEST_DIR_PATH);
        const image2Path = useImage(IMAGE_V12_1, BASE_IMAGES_TEST_DIR_PATH);
        const image3Path = useImage(IMAGE_V12_1, PREV_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(image1Path.filename)).toStrictEqual(false);
        expect(existsSync(image2Path.filename)).toStrictEqual(false);
        expect(existsSync(image3Path.filename)).toStrictEqual(false);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
        expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
        // prev first, then alphabetical
        expect(coreWarningSpy).toHaveBeenNthCalledWith(1, expect.stringContaining("Not found in base manifest:"));
        expect(coreWarningSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("Not found in base manifest:"));
        expect(coreWarningSpy).toHaveBeenNthCalledWith(3, expect.stringContaining("Not found in base manifest:"));
    });

    it("moves image not in manifest", async () => {
        const oldPath = useImage(IMAGE_V12_1, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, false, true);

        const newPath = path.join(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, IMAGE_V12_1);
        expect(existsSync(oldPath.filename)).toStrictEqual(false);
        expect(existsSync(newPath)).toStrictEqual(true);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(3);
        expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, NOT_IN_BASE_MANIFEST_FILEPATH, expect.any(Array));
        expectWriteNoChange(3, common.BASE_INDEX_MANIFEST_FILENAME);
    });

    it("moves multiple images not in manifest", async () => {
        const oldPath1 = useImage(IMAGE_V13_1, BASE_IMAGES_TEST_DIR_PATH);
        const oldPath2 = useImage(IMAGE_V12_1, BASE_IMAGES_TEST_DIR_PATH);
        const oldPath3 = useImage(IMAGE_V12_1, PREV_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, false, true);

        const newPath1 = path.join(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, IMAGE_V13_1);
        const newPath2 = path.join(NOT_IN_BASE_MANIFEST_IMAGE_DIR_PATH, IMAGE_V12_1);
        const newPath3 = path.join(NOT_IN_PREV_MANIFEST_IMAGE_DIR_PATH, IMAGE_V12_1);
        expect(existsSync(newPath1)).toStrictEqual(true);
        expect(existsSync(oldPath1.filename)).toStrictEqual(false);
        expect(existsSync(newPath2)).toStrictEqual(true);
        expect(existsSync(oldPath2.filename)).toStrictEqual(false);
        expect(existsSync(newPath3)).toStrictEqual(true);
        expect(existsSync(oldPath3.filename)).toStrictEqual(false);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(4);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, NOT_IN_PREV_MANIFEST_FILEPATH, expect.any(Array));
        expectWriteNoChange(2, common.PREV_INDEX_MANIFEST_FILENAME);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(3, NOT_IN_BASE_MANIFEST_FILEPATH, expect.any(Array));
        expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
    });

    it("removes invalid not in manifest even if remove disabled", async () => {
        const oldPath = useImage(IMAGE_INVALID, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, false, true);

        expect(existsSync(oldPath.filename)).toStrictEqual(false);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, []);
        expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Removing"));
        expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not a valid OTA file"));
        expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Not found in base manifest"));
    });

    it("removes invalid in manifest", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_INVALID_METAS]);
        const oldPath = useImage(IMAGE_INVALID, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(oldPath.filename)).toStrictEqual(false);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, []);
        expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Removing"));
        expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not a valid OTA file"));
    });

    it("keeps image and rewrites manifest", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOldMetas(IMAGE_V14_1_METAS)]);
        const imagePath = useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(imagePath.filename)).toStrictEqual(true);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
    });

    it("keeps image with escaped url and rewrites manifest", async () => {
        const oldMetas = withOldMetas(IMAGE_V14_1_METAS);
        const fileName = oldMetas.url.split("/").pop()!;
        const newName = fileName.replace(".ota", "(%1).ota");
        const baseUrl = oldMetas.url.replace(fileName, "");
        oldMetas.url = baseUrl + encodeURIComponent(newName);
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [oldMetas]);
        const imagePath = useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);
        const baseName = path.basename(imagePath.filename);
        const renamedPath = imagePath.filename.replace(baseName, newName);
        renameSync(imagePath.filename, renamedPath);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(renamedPath)).toStrictEqual(true);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        const outManifestMetas = withExtraMetas(
            IMAGE_V14_1_METAS,
            // @ts-expect-error override
            {fileName: newName, url: `${baseUrl}${encodeURIComponent(newName)}`},
        );
        // biome-ignore lint/performance/noDelete: <explanation>
        delete outManifestMetas.originalUrl;
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [outManifestMetas]);
    });

    it("ignores when same images referenced multiple times in manifest", async () => {
        const oldMetas1 = withOldMetas(IMAGE_V14_1_METAS);
        const oldMetas2 = withOldMetas(IMAGE_V14_1_METAS);
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [oldMetas1, oldMetas2]);
        const image1Path = useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(image1Path.filename)).toStrictEqual(true);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(coreWarningSpy).toHaveBeenCalledWith(
            expect.stringContaining(`found multiple times in ${common.BASE_INDEX_MANIFEST_FILENAME} manifest`),
        );
    });

    it("keeps same images referenced multiple times in manifest with different extra metas", async () => {
        const oldMetas1 = withExtraMetas(withOldMetas(IMAGE_V14_1_METAS), {modelId: "test1"});
        const oldMetas2 = withExtraMetas(withOldMetas(IMAGE_V14_1_METAS), {modelId: "test2"});
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [oldMetas1, oldMetas2]);
        const image1Path = useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);

        // @ts-expect-error mocked as needed
        await reProcessAllImages(github, core, context, true, true);

        expect(existsSync(image1Path.filename)).toStrictEqual(true);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V14_1_METAS, {modelId: "test1"}),
            withExtraMetas(IMAGE_V14_1_METAS, {modelId: "test2"}),
        ]);
        expect(coreWarningSpy).toHaveBeenCalledWith(
            expect.stringContaining(`found multiple times in ${common.BASE_INDEX_MANIFEST_FILENAME} manifest`),
        );
    });

    describe("downloads", () => {
        let fetchSpy: MockInstance;
        let setTimeoutSpy: MockInstance;
        let fetchReturnedStatus: {ok: boolean; status: number; body?: object} = {ok: true, status: 200, body: {}};
        const get3rdPartyDir = vi.fn().mockReturnValue(IMAGES_TEST_DIR);

        const adaptUrl = (originalUrl: string, manifestName: string): string => {
            if (manifestName === common.BASE_INDEX_MANIFEST_FILENAME) {
                return originalUrl.replace(`/${common.PREV_IMAGES_DIR}/`, `/${common.BASE_IMAGES_DIR}/`);
            }

            if (manifestName === common.PREV_INDEX_MANIFEST_FILENAME) {
                return originalUrl.replace(`/${common.BASE_IMAGES_DIR}/`, `/${common.PREV_IMAGES_DIR}/`);
            }

            throw new Error(`Not supported: ${manifestName}`);
        };

        afterAll(() => {
            fetchSpy.mockRestore();
            setTimeoutSpy.mockRestore();
        });

        beforeEach(() => {
            process.env.NODE_EXTRA_CA_CERTS = "cacerts.pem";

            get3rdPartyDir.mockClear();

            fetchReturnedStatus = {ok: true, status: 200, body: {}};
            fetchSpy = vi.spyOn(global, "fetch").mockImplementation(
                // @ts-expect-error mocked as needed
                (input) => {
                    return {
                        ok: fetchReturnedStatus.ok,
                        status: fetchReturnedStatus.status,
                        body: fetchReturnedStatus.body,
                        // @ts-expect-error Buffer <> ArrayBuffer (props not used)
                        arrayBuffer: (): ArrayBuffer => readFileSync(getImageOriginalDirPath((input as string).split("/").pop()!)),
                    };
                },
            );
            setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(
                // @ts-expect-error mock
                (fn) => {
                    fn();
                },
            );
        });

        it("failure without CA Certificates ENV", async () => {
            process.env.NODE_EXTRA_CA_CERTS = "";

            await expect(async () => {
                // @ts-expect-error mocked as needed
                await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);
            }).rejects.toThrow(
                expect.objectContaining({message: expect.stringContaining("Download 3rd Parties requires `NODE_EXTRA_CA_CERTS=cacerts.pem`")}),
            );
        });

        it("failure with malformed metas", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [
                // @ts-expect-error old metas
                {
                    fileVersion: 192,
                    fileSize: 307682,
                    manufacturerCode: 4417,
                    imageType: 54179,
                    modelId: "TS011F",
                    sha512: "01939ca4fc790432d2c233e19b2440c1e0248d2ce85c9299e0b88928cb2341de675350ac7b78187a25f06a2768f93db0a17c4ba950b60c82c072e0c0833cfcfb",
                    url: "", // not undefined to pass setManifest
                },
            ]);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(0);
            expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(3, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
            expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring malformed"));
        });

        it("failure from fetch ok", async () => {
            setManifest(
                common.BASE_INDEX_MANIFEST_FILENAME,
                // @ts-expect-error old metas
                [OLD_META_3RD_PARTY_1_METAS],
            );
            fetchReturnedStatus.ok = false;

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(3, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
            expect(coreErrorSpy).toHaveBeenCalledWith(
                `Invalid response from ${OLD_META_3RD_PARTY_1_METAS.url} status=${fetchReturnedStatus.status}.`,
            );
        });

        it("ignores urls from this repo", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
            // prevent trigger removal because of missing file
            useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(0);
            expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(3, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
        });

        it("ignores urls with no out dir specified", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [
                // @ts-expect-error old metas
                {
                    fileVersion: 192,
                    fileSize: 307682,
                    manufacturerCode: 4417,
                    imageType: 54179,
                    modelId: "TS011F",
                    sha512: "01939ca4fc790432d2c233e19b2440c1e0248d2ce85c9299e0b88928cb2341de675350ac7b78187a25f06a2768f93db0a17c4ba950b60c82c072e0c0833cfcfb",
                    url: "https://www.elektroimportoren.no/docs/lib/4512772-Firmware-35.ota",
                },
            ]);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(0);
            expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(3, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
            expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining("no out dir specified"));
        });

        it("ignores invalid OTA file", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [
                Object.assign({}, withOldMetas(IMAGE_INVALID_METAS), {
                    url: `https://images.tuyaeu.com/smart/firmware/upgrade/20220907/${IMAGES_TEST_DIR}/${IMAGE_INVALID}`,
                }),
            ]);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expectWriteNoChange(1, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(2, common.BASE_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(3, common.PREV_INDEX_MANIFEST_FILENAME);
            expectWriteNoChange(4, common.BASE_INDEX_MANIFEST_FILENAME);
            expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Ignoring"));
            expect(coreErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not a valid OTA file"));
        });

        it("ignores identical image", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [
                IMAGE_V14_1_METAS,
                Object.assign({}, withOldMetas(IMAGE_V14_1_METAS), {
                    url: `https://images.tuyaeu.com/smart/firmware/upgrade/20220907/${IMAGES_TEST_DIR}/${IMAGE_V14_1}`,
                }),
            ]);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
            expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
            expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Conflict with image at index `0`"));
        });

        it("success without mocked get3rdPartyDir", async () => {
            // NOTE: this is using a name (ZLinky_router_v13.ota) and out dir (Hue) that is unlikely to ever be in conflict with actual Hue images
            setManifest(
                common.BASE_INDEX_MANIFEST_FILENAME,
                // @ts-expect-error old metas
                [OLD_META_3RD_PARTY_1_METAS],
            );

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                    originalUrl: OLD_META_3RD_PARTY_1_METAS.url,
                    // @ts-expect-error override
                    url: adaptUrl(OLD_META_3RD_PARTY_1_REAL_METAS.url, common.BASE_INDEX_MANIFEST_FILENAME).replace(IMAGES_TEST_DIR, "Hue"),
                }),
            ]);

            rmSync(path.join(common.BASE_IMAGES_DIR, "Hue", OLD_META_3RD_PARTY_1_REAL_IMAGE));
        });

        it("success with add different metas and ignored", async () => {
            setManifest(
                common.BASE_INDEX_MANIFEST_FILENAME,
                // @ts-expect-error old metas
                [OLD_META_3RD_PARTY_1_METAS, OLD_META_3RD_PARTY_2_METAS, OLD_META_3RD_PARTY_IGNORED_METAS],
            );

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(get3rdPartyDir).toHaveBeenCalledTimes(2);
            expect(get3rdPartyDir).toHaveBeenNthCalledWith(1, OLD_META_3RD_PARTY_1_METAS);
            expect(get3rdPartyDir).toHaveBeenNthCalledWith(2, OLD_META_3RD_PARTY_2_METAS);
            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(addImageToBaseSpy).toHaveBeenCalledTimes(2); // adds both, second process moves first to prev
            expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                    originalUrl: OLD_META_3RD_PARTY_1_METAS.url,
                    // @ts-expect-error override
                    url: adaptUrl(OLD_META_3RD_PARTY_1_REAL_METAS.url, common.BASE_INDEX_MANIFEST_FILENAME),
                }),
                withExtraMetas(OLD_META_3RD_PARTY_2_REAL_METAS, {
                    originalUrl: OLD_META_3RD_PARTY_2_METAS.url,
                    // @ts-expect-error override
                    url: adaptUrl(OLD_META_3RD_PARTY_2_REAL_METAS.url, common.BASE_INDEX_MANIFEST_FILENAME),
                    modelId: OLD_META_3RD_PARTY_2_METAS.modelId,
                }),
            ]);
            expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining(`Removing ignored '${OLD_META_3RD_PARTY_IGNORED_METAS.url}'`));
        });

        it("success with add+move same and ignored", async () => {
            setManifest(
                common.BASE_INDEX_MANIFEST_FILENAME,
                // @ts-expect-error old metas
                [OLD_META_3RD_PARTY_1_METAS, OLD_META_3RD_PARTY_IGNORED_METAS, withExtraMetas(OLD_META_3RD_PARTY_2_METAS, {modelId: undefined})],
            );

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(addImageToBaseSpy).toHaveBeenCalledTimes(2); // adds both, second process moves first to prev
            expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                    originalUrl: OLD_META_3RD_PARTY_1_METAS.url,
                    // @ts-expect-error override
                    url: adaptUrl(OLD_META_3RD_PARTY_1_REAL_METAS.url, common.PREV_INDEX_MANIFEST_FILENAME),
                }),
            ]);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_2_REAL_METAS, {
                    originalUrl: OLD_META_3RD_PARTY_2_METAS.url,
                    // @ts-expect-error override
                    url: adaptUrl(OLD_META_3RD_PARTY_2_REAL_METAS.url, common.BASE_INDEX_MANIFEST_FILENAME),
                }),
            ]);
            expect(coreWarningSpy).toHaveBeenCalledWith(expect.stringContaining(`Removing ignored '${OLD_META_3RD_PARTY_IGNORED_METAS.url}'`));
        });

        it("success with add to prev", async () => {
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [
                IMAGE_V14_1_METAS,
                // @ts-expect-error old metas
                OLD_META_3RD_PARTY_1_METAS,
            ]);
            // prevent trigger removal because of missing file
            useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, get3rdPartyDir);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
            expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                    originalUrl: adaptUrl(OLD_META_3RD_PARTY_1_METAS.url, common.PREV_INDEX_MANIFEST_FILENAME),
                }),
            ]);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(3, common.PREV_INDEX_MANIFEST_FILENAME, [
                withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                    originalUrl: adaptUrl(OLD_META_3RD_PARTY_1_METAS.url, common.PREV_INDEX_MANIFEST_FILENAME),
                }),
            ]);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(4, common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        });

        it("success with escaped", async () => {
            const oldMetas = structuredClone(OLD_META_3RD_PARTY_1_METAS);
            const fileName = oldMetas.url.split("/").pop()!;
            const newName = fileName.replace(".ota", "(%1).ota");
            const baseUrl = oldMetas.url.replace(fileName, "");
            oldMetas.url = baseUrl + encodeURIComponent(newName);
            // @ts-expect-error old metas
            setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [oldMetas]);
            // link back to existing image from fetch
            fetchSpy = vi.spyOn(global, "fetch").mockImplementationOnce(
                // @ts-expect-error mocked as needed
                () => {
                    return {
                        ok: fetchReturnedStatus.ok,
                        status: fetchReturnedStatus.status,
                        body: fetchReturnedStatus.body,
                        // @ts-expect-error Buffer <> ArrayBuffer (props not used)
                        arrayBuffer: (): ArrayBuffer => readFileSync(getImageOriginalDirPath(fileName)),
                    };
                },
            );

            // @ts-expect-error mocked as needed
            await reProcessAllImages(github, core, context, true, false, () => IMAGES_TEST_DIR);

            expect(readManifestSpy).toHaveBeenCalledTimes(4);
            expect(writeManifestSpy).toHaveBeenCalledTimes(4);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, []);
            const outManifestMetas = withExtraMetas(OLD_META_3RD_PARTY_1_REAL_METAS, {
                // @ts-expect-error override
                fileName: newName,
                originalUrl: oldMetas.url,
                url: common.getRepoFirmwareFileUrl(IMAGES_TEST_DIR, newName, common.BASE_IMAGES_DIR),
            });
            expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, [outManifestMetas]);
        });
    });
});
