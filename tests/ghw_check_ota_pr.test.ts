import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import type {RepoImageMeta} from "../src/types";

import {existsSync, readFileSync, rmSync} from "node:fs";
import path from "node:path";

import {type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import * as common from "../src/common";
import {checkOtaPR} from "../src/ghw_check_ota_pr";
import {
    BASE_IMAGES_TEST_DIR_PATH,
    IMAGES_TEST_DIR,
    IMAGE_INVALID,
    IMAGE_V12_1,
    IMAGE_V12_1_METAS,
    IMAGE_V13_1,
    IMAGE_V13_1_METAS,
    IMAGE_V13_1_METAS_MAIN,
    IMAGE_V14_1,
    IMAGE_V14_1_METAS,
    IMAGE_V14_2,
    IMAGE_V14_2_METAS,
    PREV_IMAGES_TEST_DIR_PATH,
    getAdjustedContent,
    useImage,
    withExtraMetas,
} from "./data.test";

const github = {
    rest: {
        repos: {
            compareCommitsWithBasehead:
                vi.fn<
                    (
                        ...args: Parameters<Octokit["rest"]["repos"]["compareCommitsWithBasehead"]>
                    ) => ReturnType<Octokit["rest"]["repos"]["compareCommitsWithBasehead"]>
                >(),
        },
    },
};
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
    payload: {
        pull_request: {
            number: 1,
            head: {
                sha: "abcd",
            },
            base: {
                sha: "zyxw",
            },
        },
    },
    issue: {
        owner: "Koenkk",
        repo: "zigbee-OTA",
        number: 1,
    },
    repo: {
        owner: "Koenkk",
        repo: "zigbee-OTA",
    },
};

describe("Github Workflow: Check OTA PR", () => {
    let baseManifest: RepoImageMeta[];
    let prevManifest: RepoImageMeta[];
    let readManifestSpy: MockInstance;
    let writeManifestSpy: MockInstance;
    let addImageToBaseSpy: MockInstance;
    let addImageToPrevSpy: MockInstance;
    let filePaths: ReturnType<typeof useImage>[] = [];

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

    const withBody = (body: string): Partial<Context> => {
        const newContext = structuredClone(context);

        newContext.payload!.pull_request!.body = body;

        return newContext;
    };

    const expectNoChanges = (noReadManifest = false): void => {
        if (noReadManifest) {
            expect(readManifestSpy).toHaveBeenCalledTimes(0);
        } else {
            expect(readManifestSpy).toHaveBeenCalledTimes(2);
        }

        expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(0);
    };

    beforeAll(() => {});

    afterAll(() => {
        readManifestSpy.mockRestore();
        writeManifestSpy.mockRestore();
        addImageToBaseSpy.mockRestore();
        addImageToPrevSpy.mockRestore();
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(IMAGES_TEST_DIR, {recursive: true, force: true});
    });

    beforeEach(() => {
        resetManifests();

        filePaths = [];
        readManifestSpy = vi.spyOn(common, "readManifest").mockImplementation(getManifest);
        writeManifestSpy = vi.spyOn(common, "writeManifest").mockImplementation(setManifest);
        addImageToBaseSpy = vi.spyOn(common, "addImageToBase");
        addImageToPrevSpy = vi.spyOn(common, "addImageToPrev");
        github.rest.repos.compareCommitsWithBasehead.mockImplementation(
            // @ts-expect-error mock
            () => ({data: {files: filePaths}}),
        );
    });

    afterEach(() => {
        rmSync(BASE_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(PREV_IMAGES_TEST_DIR_PATH, {recursive: true, force: true});
        rmSync(common.PR_ARTIFACT_DIR, {recursive: true, force: true});
    });

    // XXX: Util
    // it('Get headers', async () => {
    //     const firmwareBuffer = readFileSync(getImageOriginalDirPath(IMAGE_V14_1));
    //     console.log(IMAGE_V14_1);
    //     console.log(JSON.stringify(common.parseImageHeader(firmwareBuffer)));
    //     console.log(`URL: ${common.getRepoFirmwareFileUrl(IMAGES_TEST_DIR, IMAGE_V14_1, common.BASE_IMAGES_DIR)}`);
    //     console.log(`SHA512: ${common.computeSHA512(firmwareBuffer)}`);
    // })

    it("hard failure from outside PR context", async () => {
        filePaths = [useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, {payload: {}});
        }).rejects.toThrow("Not a pull request");

        expectNoChanges(true);
    });

    it("hard failure from merged PR context", async () => {
        filePaths = [useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, {payload: {pull_request: {merged: true}}});
        }).rejects.toThrow("Should not be executed on a merged pull request");

        expectNoChanges(true);
    });

    it("hard failure with no file changed", async () => {
        filePaths = [];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow("No file");

        expectNoChanges(false);
        expect(existsSync(common.PR_ARTIFACT_NUMBER_FILEPATH)).toStrictEqual(true);
        expect(readFileSync(common.PR_ARTIFACT_NUMBER_FILEPATH, "utf8")).toStrictEqual(`${context.payload?.pull_request?.number}`);
        expect(existsSync(common.PR_ARTIFACT_DIFF_FILEPATH)).toStrictEqual(false);
        expect(existsSync(common.PR_ARTIFACT_ERROR_FILEPATH)).toStrictEqual(true);
        expect(readFileSync(common.PR_ARTIFACT_ERROR_FILEPATH, "utf8")).toStrictEqual("No file");
    });

    it("failure with file outside of images directory", async () => {
        filePaths = [useImage(IMAGE_V13_1, PREV_IMAGES_TEST_DIR_PATH), useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("Detected changes in files outside")}));

        expectNoChanges(false);
    });

    it("failure when no manufacturer subfolder", async () => {
        filePaths = [useImage(IMAGE_V14_1, common.BASE_IMAGES_DIR)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("File should be in its associated manufacturer subfolder")}));

        expectNoChanges(false);

        rmSync(path.join(common.BASE_IMAGES_DIR, IMAGE_V14_1), {force: true});
    });

    it("failure with invalid OTA file", async () => {
        filePaths = [useImage(IMAGE_INVALID)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("Not a valid OTA file")}));

        expectNoChanges(false);
    });

    it("failure with identical OTA file", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        filePaths = [useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining("Conflict with image at index `0`")}));

        expectNoChanges(false);
    });

    it("failure with older OTA file that has identical in prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
        filePaths = [useImage(IMAGE_V13_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(
            expect.objectContaining({message: expect.stringContaining("an equal or better match is already present in prev manifest")}),
        );

        expectNoChanges(false);
    });

    it("failure with older OTA file that has newer in prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
        filePaths = [useImage(IMAGE_V12_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, context);
        }).rejects.toThrow(
            expect.objectContaining({message: expect.stringContaining("an equal or better match is already present in prev manifest")}),
        );

        expectNoChanges(false);
    });

    it("success into base", async () => {
        filePaths = [useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(existsSync(common.PR_ARTIFACT_NUMBER_FILEPATH)).toStrictEqual(true);
        expect(readFileSync(common.PR_ARTIFACT_NUMBER_FILEPATH, "utf8")).toStrictEqual(`${context.payload?.pull_request?.number}`);
        expect(existsSync(common.PR_ARTIFACT_DIFF_FILEPATH)).toStrictEqual(true);
        expect(existsSync(common.PR_ARTIFACT_ERROR_FILEPATH)).toStrictEqual(false);
    });

    it("success into prev", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);

        filePaths = [useImage(IMAGE_V13_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(0);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
    });

    it("success with newer than current without existing prev", async () => {
        filePaths = [useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2); // adds both, relocates first during second processing
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
    });

    it("success with newer than current with existing prev", async () => {
        filePaths = [useImage(IMAGE_V12_1), useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(3); // adds both, relocates first during second processing
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
    });

    it("success with older that is newer than prev", async () => {
        setManifest(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V12_1_METAS]);
        filePaths = [useImage(IMAGE_V14_1), useImage(IMAGE_V13_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
    });

    it("success with newer with missing file", async () => {
        setManifest(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V13_1_METAS]);
        filePaths = [useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("success with multiple different files", async () => {
        filePaths = [useImage(IMAGE_V14_2), useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await checkOtaPR(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2); // adds both, relocates first during second processing
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_2_METAS, IMAGE_V14_1_METAS]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("success with extra metas", async () => {
        filePaths = [useImage(IMAGE_V14_1)];
        const newContext = withBody(`Text before start tag \`\`\`json {"manufacturerName": ["lixee"]} \`\`\` Text after end tag`);

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V14_1_METAS, {manufacturerName: ["lixee"]}),
        ]);
    });

    it("success with all extra metas", async () => {
        filePaths = [useImage(IMAGE_V14_1)];
        const newContext = withBody(`Text before start tag 
\`\`\`json
{
    "force": false,
    "hardwareVersionMax": 2,
    "hardwareVersionMin": 1,
    "manufacturerName": ["lixee"],
    "maxFileVersion": 5,
    "minFileVersion": 3,
    "modelId": "bogus",
    "releaseNotes": "bugfixes"
}
\`\`\`
Text after end tag`);

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
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
        ]);
    });

    it("success with newer than current but minFileVersion keeps both", async () => {
        filePaths = [useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];
        const newContext = withBody(
            `Text before start tag \`\`\`json [{"fileName":"ZLinky_router_v14.ota", "minFileVersion": 16783874}] \`\`\` Text after end tag`,
        );

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V13_1_METAS, {
                // @ts-expect-error override
                url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/${common.BASE_IMAGES_DIR}/${IMAGES_TEST_DIR}/${IMAGE_V13_1}`,
            }),
            withExtraMetas(IMAGE_V14_1_METAS, {minFileVersion: 16783874}),
        ]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("success with newer than current but maxFileVersion keeps both", async () => {
        filePaths = [useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];
        const newContext = withBody(
            `Text before start tag \`\`\`json [{"fileName":"ZLinky_router_v13.ota", "maxFileVersion": 16783873}] \`\`\` Text after end tag`,
        );

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V13_1_METAS, {
                // @ts-expect-error override
                url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/${common.BASE_IMAGES_DIR}/${IMAGES_TEST_DIR}/${IMAGE_V13_1}`,
                maxFileVersion: 16783873,
            }),
            IMAGE_V14_1_METAS,
        ]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("success with newer than current but maxFileVersion/minFileVersion keeps both", async () => {
        filePaths = [useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];
        const newContext = withBody(
            `Text before start tag \`\`\`json [{"fileName":"ZLinky_router_v13.ota", "maxFileVersion": 16783873},{"fileName":"ZLinky_router_v14.ota", "minFileVersion": 16783874}] \`\`\` Text after end tag`,
        );

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledTimes(2);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V13_1_METAS, {
                // @ts-expect-error override
                url: `${common.BASE_REPO_URL}${common.REPO_BRANCH}/${common.BASE_IMAGES_DIR}/${IMAGES_TEST_DIR}/${IMAGE_V13_1}`,
                maxFileVersion: 16783873,
            }),
            withExtraMetas(IMAGE_V14_1_METAS, {minFileVersion: 16783874}),
        ]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, []);
    });

    it("failure with invalid extra metas", async () => {
        filePaths = [useImage(IMAGE_V14_1)];
        const newContext = withBody(`Text before start tag \`\`\`json {"manufacturerName": "myManuf"} \`\`\` Text after end tag`);

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, newContext);
        }).rejects.toThrow(
            expect.objectContaining({message: expect.stringContaining(`Invalid format for 'manufacturerName', expected 'array of string' type.`)}),
        );

        expectNoChanges(false);
    });

    it.each([
        ["fileName"],
        ["originalUrl"],
        ["force"],
        ["hardwareVersionMax"],
        ["hardwareVersionMin"],
        ["manufacturerName"],
        ["maxFileVersion"],
        ["minFileVersion"],
        ["modelId"],
        ["releaseNotes"],
    ])("failure with invalid type for extra meta %s", async (metaName) => {
        filePaths = [useImage(IMAGE_V14_1)];
        // use object since no value type is ever expected to be object
        const newContext = withBody(`Text before start tag \`\`\`json {"${metaName}": {}} \`\`\` Text after end tag`);

        await expect(async () => {
            // @ts-expect-error mock
            await checkOtaPR(github, core, newContext);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining(`Invalid format for '${metaName}'`)}));

        expectNoChanges(false);
    });

    it("success with multiple files and specific extra metas", async () => {
        filePaths = [useImage(IMAGE_V13_1), useImage(IMAGE_V14_1), useImage(IMAGE_V12_1)];
        const newContext = withBody(`Text before start tag 
\`\`\`json
[
    {"fileName": "${IMAGE_V14_1}", "manufacturerName": ["lixee"], "hardwareVersionMin": 2},
    {"fileName": "${IMAGE_V13_1}", "manufacturerName": ["lixee"]},
    {"fileName": "${IMAGE_V12_1}", "manufacturerName": ["lixee"]}
]
\`\`\`
Text after end tag`);

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(2);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(1);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V13_1_METAS_MAIN, {manufacturerName: ["lixee"]}),
            withExtraMetas(IMAGE_V14_1_METAS, {manufacturerName: ["lixee"], hardwareVersionMin: 2}),
        ]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V12_1_METAS, {manufacturerName: ["lixee"]}),
        ]);
    });

    it("success with multiple files and specific extra metas, ignore without fileName", async () => {
        filePaths = [useImage(IMAGE_V12_1), useImage(IMAGE_V13_1), useImage(IMAGE_V14_1)];
        const newContext = withBody(`Text before start tag 
\`\`\`json
[
    {"fileName": "${IMAGE_V14_1}", "manufacturerName": ["lixee"], "hardwareVersionMin": 2},
    {"manufacturerName": ["lixee"]}
]
\`\`\`
Text after end tag`);

        // @ts-expect-error mock
        await checkOtaPR(github, core, newContext);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(3);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            IMAGE_V13_1_METAS_MAIN,
            withExtraMetas(IMAGE_V14_1_METAS, {manufacturerName: ["lixee"], hardwareVersionMin: 2}),
        ]);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME, [IMAGE_V12_1_METAS]);
    });
});
