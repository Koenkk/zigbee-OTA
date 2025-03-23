import type {RepoImageMeta} from "../src/types";

import {existsSync, mkdirSync, readFileSync, rmSync} from "node:fs";

import * as common from "../src/common";
import {ProcessFirmwareImageStatus, processFirmwareImage} from "../src/process_firmware_image";
import {
    BASE_IMAGES_TEST_DIR_PATH,
    IMAGES_TEST_DIR,
    IMAGE_INVALID,
    IMAGE_TAR,
    IMAGE_TAR_METAS,
    IMAGE_V12_1,
    IMAGE_V12_1_METAS,
    IMAGE_V13_1,
    IMAGE_V13_1_METAS,
    IMAGE_V14_1,
    IMAGE_V14_1_METAS,
    PREV_IMAGES_TEST_DIR_PATH,
    getAdjustedContent,
    getImageOriginalDirPath,
    useImage,
    withExtraMetas,
} from "./data.test";

describe("Process Firmware Image", () => {
    let baseManifest: RepoImageMeta[];
    let prevManifest: RepoImageMeta[];
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let readManifestSpy: jest.SpyInstance;
    let writeManifestSpy: jest.SpyInstance;
    let addImageToBaseSpy: jest.SpyInstance;
    let addImageToPrevSpy: jest.SpyInstance;
    let fetchSpy: jest.SpyInstance;
    let setTimeoutSpy: jest.SpyInstance;
    let fetchReturnedStatus: {ok: boolean; status: number; body?: object} = {ok: true, status: 200, body: {}};

    const getManifest = (fileName: string): RepoImageMeta[] => {
        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME) {
            return baseManifest;
        }

        if (fileName === common.PREV_INDEX_MANIFEST_FILENAME) {
            return prevManifest;
        }

        throw new Error(`${fileName} not supported`);
    };

    const setManifest = (fileName: string, content: RepoImageMeta[]): void => {
        const adjustedContent = getAdjustedContent(fileName, content);

        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME) {
            baseManifest = adjustedContent;
        } else if (fileName === common.PREV_INDEX_MANIFEST_FILENAME) {
            prevManifest = adjustedContent;
        } else {
            throw new Error(`${fileName} not supported`);
        }
    };

    const resetManifests = (): void => {
        baseManifest = [];
        prevManifest = [];
    };

    const withOriginalUrl = (originalUrl: string, meta: RepoImageMeta): RepoImageMeta => {
        const newMeta = structuredClone(meta);

        newMeta.originalUrl = originalUrl;

        return newMeta;
    };

    const expectNoChanges = (noReadManifest = false): void => {
        if (noReadManifest) {
            expect(readManifestSpy).toHaveBeenCalledTimes(0);
        } else {
            expect(readManifestSpy).toHaveBeenCalledTimes(2);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        }

        expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(0);
    };

    const expectWriteNoChanges = (inBase = true, inPrev = true): void => {
        if (inBase) {
            expect(writeManifestSpy).toHaveBeenNthCalledWith(
                1,
                common.PREV_INDEX_MANIFEST_FILENAME,
                getManifest(common.PREV_INDEX_MANIFEST_FILENAME),
            );
        }

        if (inPrev) {
            expect(writeManifestSpy).toHaveBeenNthCalledWith(
                2,
                common.BASE_INDEX_MANIFEST_FILENAME,
                getManifest(common.BASE_INDEX_MANIFEST_FILENAME),
            );
        }
    };

    beforeAll(() => {});

    afterAll(() => {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
        readManifestSpy.mockRestore();
        writeManifestSpy.mockRestore();
        addImageToBaseSpy.mockRestore();
        addImageToPrevSpy.mockRestore();
        fetchSpy.mockRestore();
        setTimeoutSpy.mockRestore();
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
    });

    beforeEach(() => {
        resetManifests();

        fetchReturnedStatus = {ok: true, status: 200, body: {}};
        consoleErrorSpy = jest.spyOn(console, "error");
        consoleLogSpy = jest.spyOn(console, "log");
        readManifestSpy = jest.spyOn(common, "readManifest").mockImplementation(getManifest);
        writeManifestSpy = jest.spyOn(common, "writeManifest").mockImplementation(setManifest);
        addImageToBaseSpy = jest.spyOn(common, "addImageToBase");
        addImageToPrevSpy = jest.spyOn(common, "addImageToPrev");
        fetchSpy = jest.spyOn(global, "fetch").mockImplementation(
            // @ts-expect-error mocked as needed
            (input) => {
                return {
                    ok: fetchReturnedStatus.ok,
                    status: fetchReturnedStatus.status,
                    body: fetchReturnedStatus.body,
                    // @ts-expect-error Buffer <> ArrayBuffer (props not used)
                    arrayBuffer: (): ArrayBuffer => readFileSync(getImageOriginalDirPath(input as string)),
                };
            },
        );
        setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(
            // @ts-expect-error mock
            (fn) => {
                fn();
            },
        );
    });

    afterEach(() => {
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
    });

    it("failure with fetch ok", async () => {
        fetchReturnedStatus.ok = false;
        fetchReturnedStatus.status = 429;
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.RequestFailed);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Invalid response from ${IMAGE_V14_1} status=${fetchReturnedStatus.status}.`),
        );
        expectNoChanges(false);
    });

    it("failure with fetch body", async () => {
        fetchReturnedStatus.body = undefined;
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.RequestFailed);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`Invalid response from ${IMAGE_V14_1} status=${fetchReturnedStatus.status}.`),
        );
        expectNoChanges(false);
    });

    it("failure with invalid OTA file", async () => {
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_INVALID, IMAGE_INVALID);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Error);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not a valid OTA fil"));
        expectNoChanges(false);
    });

    it("failure with identical OTA file", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Base manifest already has version"));
        expect(writeManifestSpy).toHaveBeenNthCalledWith(1, common.PREV_INDEX_MANIFEST_FILENAME, getManifest(common.PREV_INDEX_MANIFEST_FILENAME));
        expect(writeManifestSpy).toHaveBeenNthCalledWith(2, common.BASE_INDEX_MANIFEST_FILENAME, getManifest(common.BASE_INDEX_MANIFEST_FILENAME));
        expectWriteNoChanges();
    });

    it("failure with older OTA file that has identical in prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V13_1, IMAGE_V13_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("an equal or better match is already present in prev manifest"));
        expectWriteNoChanges();
    });

    it("failure with older OTA file that has newer in prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V12_1, IMAGE_V12_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("an equal or better match is already present in prev manifest"));
        expectWriteNoChanges();
    });

    it("success into base", async () => {
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
    });

    it("success into prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V13_1, IMAGE_V13_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expectWriteNoChanges(true, false);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
    });

    it("success with newer than current without existing prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
        useImage(IMAGE_V13_1, BASE_IMAGES_TEST_DIR_PATH);

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
    });

    it("success with newer than current with existing prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V12_1, IMAGE_V12_1_METAS)]);
        useImage(IMAGE_V13_1, BASE_IMAGES_TEST_DIR_PATH);
        useImage(IMAGE_V12_1, PREV_IMAGES_TEST_DIR_PATH);

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
    });

    it("success with older that is newer than prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V12_1, IMAGE_V12_1_METAS)]);
        useImage(IMAGE_V14_1, BASE_IMAGES_TEST_DIR_PATH);
        useImage(IMAGE_V12_1, PREV_IMAGES_TEST_DIR_PATH);

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V13_1, IMAGE_V13_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
    });

    it("success with newer with missing file", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V13_1, IMAGE_V13_1_METAS)]);
        // useImage(IMAGE_V13_1, BASE_IMAGES_TEST_DIR_PATH);

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1);

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_V14_1, IMAGE_V14_1_METAS)]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("success with extra metas", async () => {
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1, {manufacturerName: ["lixee"]});

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withOriginalUrl(IMAGE_V14_1, withExtraMetas(IMAGE_V14_1_METAS, {manufacturerName: ["lixee"]})),
        ]);
    });

    it("success with all extra metas", async () => {
        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_V14_1, IMAGE_V14_1, {
            originalUrl: `https://example.com/${IMAGE_V14_1}`,
            force: false,
            hardwareVersionMax: 2,
            hardwareVersionMin: 1,
            manufacturerName: ["lixee"],
            maxFileVersion: 5,
            minFileVersion: 3,
            modelId: "bogus",
            releaseNotes: "bugfixes",
        });

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withOriginalUrl(
                `https://example.com/${IMAGE_V14_1}`,
                withExtraMetas(IMAGE_V14_1_METAS, {
                    force: false,
                    hardwareVersionMax: 2,
                    hardwareVersionMin: 1,
                    manufacturerName: ["lixee"],
                    maxFileVersion: 5,
                    minFileVersion: 3,
                    modelId: "bogus",
                    releaseNotes: "bugfixes",
                }),
            ),
        ]);
    });

    it("success with tar", async () => {
        if (!existsSync(common.TMP_DIR)) {
            mkdirSync(common.TMP_DIR, {recursive: true});
        }

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_TAR, IMAGE_TAR, {}, true, (f) => f.endsWith(".ota"));

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.Success);
        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [withOriginalUrl(IMAGE_TAR, IMAGE_TAR_METAS)]);

        rmSync(common.TMP_DIR, {recursive: true, force: true});
    });

    it("failure with invalid tar", async () => {
        if (!existsSync(common.TMP_DIR)) {
            mkdirSync(common.TMP_DIR, {recursive: true});
        }

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_INVALID, IMAGE_INVALID, {}, true, (f) => f.endsWith(".ota"));

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.TarNoImage);
        expectNoChanges(true);

        rmSync(common.TMP_DIR, {recursive: true, force: true});
    });

    it("failure with extract tar (missing dir)", async () => {
        // if (!existsSync(common.TMP_DIR)) {
        //     mkdirSync(common.TMP_DIR, {recursive: true});
        // }

        const status = await processFirmwareImage(IMAGES_TEST_DIR, IMAGE_TAR, IMAGE_TAR, {}, true, (f) => f.endsWith(".ota"));

        expect(status).toStrictEqual(ProcessFirmwareImageStatus.TarNoImage);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({syscall: "chdir", code: "ENOENT"}));
        expectNoChanges(false);

        rmSync(common.TMP_DIR, {recursive: true, force: true});
    });
});
