import assert from "node:assert";
import type * as CoreApi from "@actions/core";
import type {Octokit} from "@octokit/rest";

import {BASE_IMAGES_DIR} from "./common.js";
import type {Context} from "./types.js";

export async function getChangedOtaFiles(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    basehead: string,
    throwIfFilesOutsideOfImages: boolean,
): Promise<string[]> {
    // NOTE: includes up to 300 files, per https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#compare-two-commits
    const compare = await github.rest.repos.compareCommitsWithBasehead({
        owner: context.repo.owner,
        repo: context.repo.repo,
        basehead,
    });

    assert(compare.data.files && compare.data.files.length > 0, "No file");

    core.info(`Changed files: ${compare.data.files.map((f) => f.filename).join(", ")}`);

    const fileList = compare.data.files.filter((f) => f.filename.startsWith(`${BASE_IMAGES_DIR}/`));
    // existing images must not be replaced in place (same file name for a different image), renamed or deleted:
    // the manifest entry would keep pointing at the old file name with the old sha512/version, and archiving would move the wrong binary
    const alteredFiles = fileList.filter(
        (f) =>
            f.status === "modified" ||
            f.status === "removed" ||
            f.status === "changed" ||
            // a rename from outside `images` (e.g. a retracted image added back) is a new image
            (f.status === "renamed" && f.previous_filename?.startsWith(`${BASE_IMAGES_DIR}/`)),
    );

    if (alteredFiles.length > 0) {
        throw new Error(
            `Detected modified/renamed/deleted existing images: ${alteredFiles.map((f) => `${f.filename} (${f.status})`).join(", ")}. Existing images must not be altered, add new images under a different file name instead.`,
        );
    }

    if (throwIfFilesOutsideOfImages && fileList.length !== compare.data.files.length) {
        if (context.payload.pull_request) {
            throw new Error("Detected changes in files outside of `images` directory. This is not allowed for a pull request with OTA files.");
        }

        throw new Error("Cannot run with files outside of `images` directory.");
    }

    return fileList.map((f) => f.filename);
}
