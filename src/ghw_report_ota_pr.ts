import type CoreApi from '@actions/core';
import type {Context} from '@actions/github/lib/context';
import type {Octokit} from '@octokit/rest';

import assert from 'assert';
import {existsSync, readFileSync, writeFileSync} from 'fs';

import {execute, PR_ARTIFACT_DIR, PR_DIFF_FILENAME, PR_ERROR_FILENAME, PR_NUMBER_FILENAME} from './common.js';

export async function reportOtaPR(github: Octokit, core: typeof CoreApi, context: Context): Promise<void> {
    assert(context.payload.workflow_run, 'Not a workflow run');

    // XXX: context.payload.workflow_run is not typed...
    const workflow_run = context.payload.workflow_run as Awaited<ReturnType<typeof github.rest.actions.getWorkflowRun>>['data'];

    // workflow_run.conclusion: action_required, cancelled, failure, neutral, skipped, stale, success, timed_out, startup_failure, null
    if (workflow_run.conclusion !== 'success' && workflow_run.conclusion !== 'failure') {
        core.info(`Ignoring workflow run ${workflow_run.html_url} with conclusion ${workflow_run.conclusion}.`);

        return;
    }

    const artifacts = await github.rest.actions.listWorkflowRunArtifacts({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: workflow_run.id,
    });
    const matchArtifact = artifacts.data.artifacts.find((artifact) => artifact.name == PR_ARTIFACT_DIR);

    assert(matchArtifact, `No artifact found for ${workflow_run.url}`);

    const download = await github.rest.actions.downloadArtifact({
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifact_id: matchArtifact.id,
        archive_format: 'zip',
    });
    const artifactZipFileName = `${PR_ARTIFACT_DIR}.zip`;

    writeFileSync(artifactZipFileName, Buffer.from(download.data as ArrayBuffer));

    const unzipOutput = await execute(`unzip ${artifactZipFileName}`);

    core.info(unzipOutput);

    assert(existsSync(PR_NUMBER_FILENAME), `Invalid artifact for ${workflow_run.html_url}`);

    const prNumber = parseInt(readFileSync(PR_NUMBER_FILENAME, 'utf8'), 10);

    core.info(`Running for pr#${prNumber} for ${workflow_run.html_url}`);

    if (workflow_run.conclusion === 'failure') {
        assert(existsSync(PR_ERROR_FILENAME), `Workflow failed but could not find ${PR_ERROR_FILENAME} for ${workflow_run.html_url}`);

        const prError = readFileSync(PR_ERROR_FILENAME, 'utf8');

        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: prNumber,
            body: prError,
        });

        throw new Error(prError);
    } else if (workflow_run.conclusion === 'success') {
        assert(existsSync(PR_DIFF_FILENAME), `Workflow succeeded but could not find ${PR_DIFF_FILENAME} for ${workflow_run.html_url}`);

        const prDiff = readFileSync(PR_DIFF_FILENAME, 'utf8');

        core.info(prDiff);
        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: prNumber,
            body: `Merging this pull request will add these changes in a following commit:
\`\`\`diff
${prDiff}
\`\`\`
`,
        });
    }
}
