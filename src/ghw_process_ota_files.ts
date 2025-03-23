import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import type {ExtraMetas, GHExtraMetas, RepoImageMeta} from "./types.js";

import assert from "node:assert";
import {readFileSync, renameSync} from "node:fs";
import path from "node:path";

import {
    BASE_IMAGES_DIR,
    PREV_IMAGES_DIR,
    ParsedImageStatus,
    UPGRADE_FILE_IDENTIFIER,
    addImageToBase,
    addImageToPrev,
    findMatchImage,
    getOutDir,
    getParsedImageStatus,
    getValidMetas,
    parseImageHeader,
} from "./common.js";

const EXTRA_METAS_PR_BODY_START_TAG = "```json";
const EXTRA_METAS_PR_BODY_END_TAG = "```";

function getFileExtraMetas(extraMetas: GHExtraMetas, fileName: string): ExtraMetas {
    if (Array.isArray(extraMetas)) {
        const fileExtraMetas = extraMetas.find((m) => m.fileName === fileName) ?? {};
        /** @see getValidMetas */
        // biome-ignore lint/performance/noDelete: <explanation>
        delete fileExtraMetas.fileName;

        return fileExtraMetas;
    }

    // not an array, use same metas for all files
    return extraMetas;
}

async function getPRBody(github: Octokit, core: typeof CoreApi, context: Context): Promise<string | undefined> {
    assert(context.payload.pull_request || context.eventName === "push");

    if (context.payload.pull_request) {
        return context.payload.pull_request.body;
    }

    if (context.eventName === "push") {
        const pushMsg = context.payload.head_commit.message as string;
        const prMatch = pushMsg.match(/\(#(\d+)\)/);

        if (prMatch) {
            const prNumber = Number.parseInt(prMatch[1], 10);

            try {
                const pr = await github.rest.pulls.get({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    pull_number: prNumber,
                });

                return pr.data.body || undefined;
            } catch (error) {
                throw new Error(`Failed to get PR#${prNumber} for extra metas: ${error}`);
            }
        }
    }
}

async function parsePRBodyExtraMetas(github: Octokit, core: typeof CoreApi, context: Context): Promise<GHExtraMetas> {
    let extraMetas: GHExtraMetas = {};

    const prBody = await getPRBody(github, core, context);

    if (prBody) {
        try {
            const metasStart = prBody.indexOf(EXTRA_METAS_PR_BODY_START_TAG);
            const metasEnd = prBody.lastIndexOf(EXTRA_METAS_PR_BODY_END_TAG);

            if (metasStart !== -1 && metasEnd > metasStart) {
                const metas = JSON.parse(prBody.slice(metasStart + EXTRA_METAS_PR_BODY_START_TAG.length, metasEnd)) as GHExtraMetas;

                core.info("Extra metas from PR body:");
                core.info(JSON.stringify(metas, undefined, 2));

                if (Array.isArray(metas)) {
                    extraMetas = [];

                    for (const meta of metas) {
                        if (!meta.fileName || typeof meta.fileName !== "string") {
                            core.info("Ignoring meta in array with missing/invalid fileName:");
                            core.info(JSON.stringify(meta, undefined, 2));
                            continue;
                        }

                        extraMetas.push(getValidMetas(meta, false));
                    }
                } else {
                    extraMetas = getValidMetas(metas, false);
                }
            }
        } catch (error) {
            throw new Error(`Invalid extra metas in pull request body: ${(error as Error).message}`);
        }
    }

    return extraMetas;
}

export async function processOtaFiles(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    filePaths: string[],
    baseManifest: RepoImageMeta[],
    prevManifest: RepoImageMeta[],
): Promise<void> {
    const extraMetas = await parsePRBodyExtraMetas(github, core, context);

    for (const filePath of filePaths) {
        core.startGroup(filePath);

        const logPrefix = `[${filePath}]`;
        let failureComment = "";

        try {
            const firmwareFileName = path.basename(filePath);
            const manufacturer = filePath.replace(BASE_IMAGES_DIR, "").replace(firmwareFileName, "").replaceAll("/", "").trim();

            if (!manufacturer) {
                throw new Error("File should be in its associated manufacturer subfolder");
            }

            const firmwareBuffer = Buffer.from(readFileSync(filePath));
            const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));

            core.info(`${logPrefix} Parsed image header:`);
            core.info(JSON.stringify(parsedImage, undefined, 2));

            const fileExtraMetas = getFileExtraMetas(extraMetas, firmwareFileName);

            core.info(`${logPrefix} Extra metas:`);
            core.info(JSON.stringify(fileExtraMetas, undefined, 2));

            const baseOutDir = getOutDir(manufacturer, BASE_IMAGES_DIR);
            const prevOutDir = getOutDir(manufacturer, PREV_IMAGES_DIR);
            const [baseMatchIndex, baseMatch] = findMatchImage(parsedImage, baseManifest, fileExtraMetas);
            const statusToBase = getParsedImageStatus(parsedImage, baseMatch);

            switch (statusToBase) {
                case ParsedImageStatus.Older: {
                    // if prev doesn't have a match, move to prev
                    const [prevMatchIndex, prevMatch] = findMatchImage(parsedImage, prevManifest, fileExtraMetas);
                    const statusToPrev = getParsedImageStatus(parsedImage, prevMatch);

                    switch (statusToPrev) {
                        case ParsedImageStatus.Older:
                        case ParsedImageStatus.Identical: {
                            failureComment = `Base manifest has higher version:
\`\`\`json
${JSON.stringify(baseMatch, undefined, 2)}
\`\`\`
and an equal or better match is already present in prev manifest:
\`\`\`json
${JSON.stringify(prevMatch, undefined, 2)}
\`\`\`
Parsed image header:
\`\`\`json
${JSON.stringify(parsedImage, undefined, 2)}
\`\`\``;
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
                                undefined,
                                fileExtraMetas,
                                () => {
                                    // relocate file to prev
                                    renameSync(filePath, filePath.replace(`${BASE_IMAGES_DIR}/`, `${PREV_IMAGES_DIR}/`));
                                },
                            );

                            break;
                        }
                    }

                    break;
                }

                case ParsedImageStatus.Identical: {
                    failureComment = `Conflict with image at index \`${baseMatchIndex}\`:
\`\`\`json
${JSON.stringify(baseMatch, undefined, 2)}
\`\`\`
Parsed image header:
\`\`\`json
${JSON.stringify(parsedImage, undefined, 2)}
\`\`\``;
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
                        undefined,
                        fileExtraMetas,
                        () => {
                            /* noop */
                        },
                    );

                    break;
                }
            }
        } catch (error) {
            failureComment = (error as Error).message;
        }

        if (failureComment) {
            core.endGroup();
            throw new Error(`${logPrefix} ${failureComment}`);
        }

        core.endGroup();
    }
}
