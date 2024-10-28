import type CoreApi from '@actions/core';
import type {Context} from '@actions/github/lib/context';
import type {Octokit} from '@octokit/rest';

import {readdirSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';

export const CACERTS_DIR = 'cacerts';
export const CACERTS_CONCAT_FILEPATH = 'cacerts.pem';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function concatCaCerts(github: Octokit, core: typeof CoreApi, context: Context): Promise<void> {
    let pemContents: string = '';

    for (const pem of readdirSync(CACERTS_DIR)) {
        if (!pem.endsWith('.pem')) {
            continue;
        }

        core.startGroup(pem);

        pemContents += readFileSync(path.join(CACERTS_DIR, pem), 'utf8');
        pemContents += '\n';

        core.endGroup();
    }

    writeFileSync(CACERTS_CONCAT_FILEPATH, pemContents, 'utf8');
}
