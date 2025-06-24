import assert from "node:assert";
import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

const IGNORE_OTA_WORKFLOW_LABEL = "ignore-ota-workflow";

export async function createPRToDefault(
    github: Octokit,
    core: typeof CoreApi,
    context: Context,
    fromBranchName: string,
    title: string,
): Promise<void> {
    assert(context.payload.repository);
    assert(fromBranchName);
    assert(title);

    const base = context.payload.repository.default_branch;

    try {
        const createdPRResult = await github.rest.pulls.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            head: fromBranchName,
            base,
            title,
        });

        await github.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: createdPRResult.data.number,
            labels: [IGNORE_OTA_WORKFLOW_LABEL],
        });

        core.notice(`Created pull request #${createdPRResult.data.number} from branch ${fromBranchName}.`);
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes(`No commits between ${base} and ${fromBranchName}`)) {
                await github.rest.git.deleteRef({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    ref: `heads/${fromBranchName}`,
                });

                core.notice("Nothing needed re-processing.");

                // don't fail if no commits
                return;
            }
        }

        throw error;
    }
}
