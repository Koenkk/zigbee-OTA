import type CoreApi from '@actions/core';
import type {Context} from '@actions/github/lib/context';
import type {Octokit} from '@octokit/rest';

import type {ExtraMetas, GHExtraMetas} from './types';

import assert from 'assert';
import {readFileSync, renameSync} from 'fs';
import path from 'path';

import {
    addImageToBase,
    addImageToPrev,
    BASE_IMAGES_DIR,
    BASE_INDEX_MANIFEST_FILENAME,
    execute,
    findMatchImage,
    getOutDir,
    getParsedImageStatus,
    getValidMetas,
    ParsedImageStatus,
    parseImageHeader,
    PREV_IMAGES_DIR,
    PREV_INDEX_MANIFEST_FILENAME,
    readManifest,
    UPGRADE_FILE_IDENTIFIER,
    writeManifest,
} from './common.js';

const EXTRA_METAS_PR_BODY_START_TAG = '```json';
const EXTRA_METAS_PR_BODY_END_TAG = '```';

function getFileExtraMetas(extraMetas: GHExtraMetas, fileName: string): ExtraMetas {
    if (Array.isArray(extraMetas)) {
        const fileExtraMetas = extraMetas.find((m) => m.fileName === fileName) ?? {};
        /** @see getValidMetas */
        delete fileExtraMetas.fileName;

        return fileExtraMetas;
    }

    // not an array, use same metas for all files
    return extraMetas;
}

async function parsePRBodyExtraMetas(github: Octokit, core: typeof CoreApi, context: Context): Promise<GHExtraMetas> {
    let extraMetas: GHExtraMetas = {};

    if (context.payload.pull_request?.body) {
        try {
            const prBody = context.payload.pull_request.body;
            const metasStart = prBody.indexOf(EXTRA_METAS_PR_BODY_START_TAG);
            const metasEnd = prBody.lastIndexOf(EXTRA_METAS_PR_BODY_END_TAG);

            if (metasStart !== -1 && metasEnd > metasStart) {
                const metas = JSON.parse(prBody.slice(metasStart + EXTRA_METAS_PR_BODY_START_TAG.length, metasEnd)) as GHExtraMetas;

                core.info(`Extra metas from PR body:`);
                core.info(JSON.stringify(metas, undefined, 2));

                if (Array.isArray(metas)) {
                    extraMetas = [];

                    for (const meta of metas) {
                        if (!meta.fileName || typeof meta.fileName != 'string') {
                            core.info(`Ignoring meta in array with missing/invalid fileName:`);
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
            const failureComment = `Invalid extra metas in pull request body: ` + (error as Error).message;

            core.error(failureComment);

            await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: failureComment,
            });

            throw new Error(failureComment);
        }
    }

    return extraMetas;
}

export async function updateOtaPR(github: Octokit, core: typeof CoreApi, context: Context, fileParam: string): Promise<void> {
    assert(fileParam, 'No file found in pull request.');
    assert(context.payload.pull_request, 'Not a pull request');

    const fileParamArr = fileParam.trim().split(',');
    // take care of empty strings (GH workflow adds a comma at end), ignore files not stored in images dir
    const fileList = fileParamArr.filter((f) => f.startsWith(`${BASE_IMAGES_DIR}/`));

    assert(fileList.length > 0, 'No image found in pull request.');
    core.info(`Images in pull request: ${fileList}.`);

    const fileListWrongDir = fileParamArr.filter((f) => f.startsWith(`${PREV_IMAGES_DIR}/`));

    if (fileListWrongDir.length > 0) {
        const failureComment = `Detected files in 'images1':
\`\`\`
${fileListWrongDir.join('\n')}
\`\`\`
Please move all files to 'images' (in appropriate subfolders). The pull request will automatically determine the proper location on merge.`;

        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: failureComment,
        });

        throw new Error(failureComment);
    }

    const fileListNoIndex = fileParamArr.filter((f) => f.startsWith(BASE_INDEX_MANIFEST_FILENAME) || f.startsWith(PREV_INDEX_MANIFEST_FILENAME));

    if (fileListNoIndex.length > 0) {
        const failureComment = `Detected manual changes in ${fileListNoIndex.join(', ')}. Please remove these changes. The pull request will automatically determine the manifests on merge.`;

        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: failureComment,
        });

        throw new Error(failureComment);
    }

    // called at the top, fail early if invalid PR body metas
    const extraMetas = await parsePRBodyExtraMetas(github, core, context);
    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);

    for (const file of fileList) {
        core.startGroup(file);
        core.info(`Processing '${file}'...`);

        let failureComment: string = '';

        try {
            const firmwareFileName = path.basename(file);
            const manufacturer = file.replace(BASE_IMAGES_DIR, '').replace(firmwareFileName, '').replaceAll('/', '').trim();

            if (!manufacturer) {
                throw new Error(`\`${file}\` should be in its associated manufacturer subfolder.`);
            }

            const firmwareBuffer = Buffer.from(readFileSync(file));
            const parsedImage = parseImageHeader(firmwareBuffer.subarray(firmwareBuffer.indexOf(UPGRADE_FILE_IDENTIFIER)));

            core.info(`[${file}] Parsed image header:`);
            core.info(JSON.stringify(parsedImage, undefined, 2));

            const fileExtraMetas = getFileExtraMetas(extraMetas, firmwareFileName);

            core.info(`[${file}] Extra metas:`);
            core.info(JSON.stringify(fileExtraMetas, undefined, 2));

            const baseOutDir = getOutDir(manufacturer, BASE_IMAGES_DIR);
            const prevOutDir = getOutDir(manufacturer, PREV_IMAGES_DIR);
            const [baseMatchIndex, baseMatch] = findMatchImage(parsedImage, baseManifest, fileExtraMetas);
            const statusToBase = getParsedImageStatus(parsedImage, baseMatch);

            switch (statusToBase) {
                case ParsedImageStatus.OLDER: {
                    // if prev doesn't have a match, move to prev
                    const [prevMatchIndex, prevMatch] = findMatchImage(parsedImage, prevManifest, fileExtraMetas);
                    const statusToPrev = getParsedImageStatus(parsedImage, prevMatch);

                    switch (statusToPrev) {
                        case ParsedImageStatus.OLDER:
                        case ParsedImageStatus.IDENTICAL: {
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

                        case ParsedImageStatus.NEWER:
                        case ParsedImageStatus.NEW: {
                            addImageToPrev(
                                `[${file}]`,
                                statusToPrev === ParsedImageStatus.NEWER,
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
                                    renameSync(file, file.replace(`${BASE_IMAGES_DIR}/`, `${PREV_IMAGES_DIR}/`));
                                },
                            );

                            break;
                        }
                    }

                    break;
                }

                case ParsedImageStatus.IDENTICAL: {
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

                case ParsedImageStatus.NEWER:
                case ParsedImageStatus.NEW: {
                    addImageToBase(
                        `[${file}]`,
                        statusToBase === ParsedImageStatus.NEWER,
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
            core.error(`[${file}] ` + failureComment);
            await github.rest.pulls.createReviewComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.issue.number,
                body: failureComment,
                commit_id: context.payload.pull_request.head.sha,
                path: file,
                subject_type: 'file',
            });

            throw new Error(failureComment);
        }

        core.endGroup();
    }

    writeManifest(PREV_INDEX_MANIFEST_FILENAME, prevManifest);
    writeManifest(BASE_INDEX_MANIFEST_FILENAME, baseManifest);

    core.info(`Prev manifest has ${prevManifest.length} images.`);
    core.info(`Base manifest has ${baseManifest.length} images.`);

    if (!context.payload.pull_request.merged) {
        const diff = await execute(`git diff`);

        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: `Merging this pull request will add these changes in a following commit:
\`\`\`diff
${diff}
\`\`\`
`,
        });
    }
}
