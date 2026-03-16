import assert from "node:assert";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import type * as CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import {
    BASE_INDEX_MANIFEST_FILENAME,
    execute,
    PR_ARTIFACT_DIFF_FILEPATH,
    PR_ARTIFACT_DIR,
    PR_ARTIFACT_ERROR_FILEPATH,
    PR_ARTIFACT_NUMBER_FILEPATH,
    PREV_INDEX_MANIFEST_FILENAME,
    readManifest,
    writeManifest,
} from "./common.js";
import {getChangedOtaFiles} from "./ghw_get_changed_ota_files.js";
import {processOtaFiles} from "./ghw_process_ota_files.js";

function throwError(comment: string): void {
    writeFileSync(PR_ARTIFACT_ERROR_FILEPATH, comment);

    throw new Error(comment);
}

export async function checkOtaPR(github: Octokit, core: typeof CoreApi, context: Context): Promise<void> {
    assert(context.payload.pull_request, "Not a pull request");
    assert(!context.payload.pull_request.merged, "Should not be executed on a merged pull request");

    if (!existsSync(PR_ARTIFACT_DIR)) {
        mkdirSync(PR_ARTIFACT_DIR, {recursive: true});
    }

    writeFileSync(PR_ARTIFACT_NUMBER_FILEPATH, context.issue.number.toString(10), "utf8");

    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);

    try {
        const filePaths = await getChangedOtaFiles(
            github,
            core,
            context,
            `${context.payload.pull_request.base.sha}...${context.payload.pull_request.head.sha}`,
            true,
        );

        await processOtaFiles(github, core, context, filePaths, baseManifest, prevManifest);
    } catch (error) {
        throwError((error as Error).message);
    }

    writeManifest(PREV_INDEX_MANIFEST_FILENAME, prevManifest);
    writeManifest(BASE_INDEX_MANIFEST_FILENAME, baseManifest);

    core.info(`Prev manifest has ${prevManifest.length} images.`);
    core.info(`Base manifest has ${baseManifest.length} images.`);

    const diff = await execute("git diff");

    core.startGroup("diff");
    core.info(diff);
    core.endGroup();

    writeFileSync(PR_ARTIFACT_DIFF_FILEPATH, diff);
}
