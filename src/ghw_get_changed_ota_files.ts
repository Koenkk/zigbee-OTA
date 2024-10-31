import type CoreApi from '@actions/core';
import type {Context} from '@actions/github/lib/context';
import type {Octokit} from '@octokit/rest';

import assert from 'assert';

import {BASE_IMAGES_DIR} from './common.js';

export async function getChangedOtaFiles(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    basehead: string,
    isPR: boolean,
): Promise<string[]> {
    // NOTE: includes up to 300 files, per https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#compare-two-commits
    const compare = await github.rest.repos.compareCommitsWithBasehead({
        owner: context.repo.owner,
        repo: context.repo.repo,
        basehead,
    });

    assert(compare.data.files && compare.data.files.length > 0, 'No file');

    core.info(`Changed files: ${compare.data.files.map((f) => f.filename).join(', ')}`);

    const fileList = compare.data.files.filter((f) => f.filename.startsWith(`${BASE_IMAGES_DIR}/`));

    if (isPR && fileList.length !== compare.data.files.length) {
        throw new Error(`Detected changes in files outside of \`images\` directory. This is not allowed for a pull request with OTA files.`);
    }

    return fileList.map((f) => f.filename);
}
