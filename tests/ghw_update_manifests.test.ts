import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import type {RepoImageMeta} from "../src/types";

import {rmSync} from "fs";

import * as common from "../src/common";
import {updateManifests} from "../src/ghw_update_manifests";
import {
    BASE_IMAGES_TEST_DIR_PATH,
    IMAGE_V13_1,
    IMAGE_V14_1,
    IMAGE_V14_1_METAS,
    PREV_IMAGES_TEST_DIR_PATH,
    getAdjustedContent,
    useImage,
    withExtraMetas,
} from "./data.test";

const github = {
    rest: {
        pulls: {
            get: jest.fn<ReturnType<Octokit["rest"]["pulls"]["get"]>, Parameters<Octokit["rest"]["pulls"]["get"]>, unknown>(),
        },
        repos: {
            compareCommitsWithBasehead: jest.fn<
                ReturnType<Octokit["rest"]["repos"]["compareCommitsWithBasehead"]>,
                Parameters<Octokit["rest"]["repos"]["compareCommitsWithBasehead"]>,
                unknown
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
    startGroup: jest.fn(),
    endGroup: jest.fn(),
};
const context: Partial<Context> = {
    eventName: "push",
    payload: {
        head_commit: {
            message: "push from pr (#213)",
        },
    },
    repo: {
        owner: "Koenkk",
        repo: "zigbee-OTA",
    },
};

describe("Github Workflow: Update manifests", () => {
    let baseManifest: RepoImageMeta[];
    let prevManifest: RepoImageMeta[];
    let readManifestSpy: jest.SpyInstance;
    let writeManifestSpy: jest.SpyInstance;
    let addImageToBaseSpy: jest.SpyInstance;
    let addImageToPrevSpy: jest.SpyInstance;
    let filePaths: ReturnType<typeof useImage>[] = [];
    let prBody: string | undefined;

    const getManifest = (fileName: string): RepoImageMeta[] => {
        if (fileName === common.BASE_INDEX_MANIFEST_FILENAME) {
            return baseManifest;
        } else if (fileName === common.PREV_INDEX_MANIFEST_FILENAME) {
            return prevManifest;
        } else {
            throw new Error(`${fileName} not supported`);
        }
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
    });

    beforeEach(() => {
        resetManifests();

        filePaths = [];
        readManifestSpy = jest.spyOn(common, "readManifest").mockImplementation(getManifest);
        writeManifestSpy = jest.spyOn(common, "writeManifest").mockImplementation(setManifest);
        addImageToBaseSpy = jest.spyOn(common, "addImageToBase");
        addImageToPrevSpy = jest.spyOn(common, "addImageToPrev");
        github.rest.pulls.get.mockImplementation(
            // @ts-expect-error mock
            () => ({data: {body: prBody}}),
        );
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

    it("hard failure from outside push context", async () => {
        filePaths = [useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await updateManifests(github, core, {payload: {}});
        }).rejects.toThrow(`Not a push`);

        expectNoChanges(true);
    });

    it("failure with file outside of images directory", async () => {
        filePaths = [useImage(IMAGE_V13_1, PREV_IMAGES_TEST_DIR_PATH), useImage(IMAGE_V14_1)];

        await expect(async () => {
            // @ts-expect-error mock
            await updateManifests(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: expect.stringContaining(`Cannot run with files outside`)}));

        expectNoChanges(true);
    });

    it("success into base", async () => {
        filePaths = [useImage(IMAGE_V14_1)];

        // @ts-expect-error mock
        await updateManifests(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [IMAGE_V14_1_METAS]);
    });

    it("success with extra metas", async () => {
        filePaths = [useImage(IMAGE_V14_1)];
        prBody = `Text before start tag \`\`\`json {"manufacturerName": ["lixee"]} \`\`\` Text after end tag`;

        // @ts-expect-error mock
        await updateManifests(github, core, context);

        expect(readManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME);
        expect(readManifestSpy).toHaveBeenCalledWith(common.PREV_INDEX_MANIFEST_FILENAME);
        expect(addImageToBaseSpy).toHaveBeenCalledTimes(1);
        expect(addImageToPrevSpy).toHaveBeenCalledTimes(0);
        expect(writeManifestSpy).toHaveBeenCalledTimes(2);
        expect(writeManifestSpy).toHaveBeenCalledWith(common.BASE_INDEX_MANIFEST_FILENAME, [
            withExtraMetas(IMAGE_V14_1_METAS, {manufacturerName: ["lixee"]}),
        ]);
    });

    it("fails to get PR for extra metas", async () => {
        filePaths = [useImage(IMAGE_V14_1)];
        github.rest.pulls.get.mockRejectedValueOnce("403");

        await expect(async () => {
            // @ts-expect-error mock
            await updateManifests(github, core, context);
        }).rejects.toThrow(expect.objectContaining({message: `Failed to get PR#213 for extra metas: 403`}));

        expectNoChanges(false);
    });
});
