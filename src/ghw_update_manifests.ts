import type CoreApi from '@actions/core';
import type {Context} from '@actions/github/lib/context';
import type {Octokit} from '@octokit/rest';

import assert from 'assert';

import {BASE_INDEX_MANIFEST_FILENAME, PREV_INDEX_MANIFEST_FILENAME, readManifest, writeManifest} from './common.js';
import {getChangedOtaFiles} from './ghw_get_changed_ota_files.js';
import {processOtaFiles} from './ghw_process_ota_files.js';

export async function updateManifests(github: Octokit, core: typeof CoreApi, context: Context): Promise<void> {
    assert(context.eventName === 'push', 'Not a push');

    const filePaths = await getChangedOtaFiles(github, core, context, `${context.payload.before}...${context.payload.after}`, true);
    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);

    // will throw if anything goes wrong
    await processOtaFiles(github, core, context, filePaths, baseManifest, prevManifest);

    writeManifest(PREV_INDEX_MANIFEST_FILENAME, prevManifest);
    writeManifest(BASE_INDEX_MANIFEST_FILENAME, baseManifest);

    core.info(`Prev manifest has ${prevManifest.length} images.`);
    core.info(`Base manifest has ${baseManifest.length} images.`);
}
