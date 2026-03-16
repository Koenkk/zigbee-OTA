import type * as CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";
import {BASE_IMAGES_DIR, BASE_INDEX_MANIFEST_FILENAME, execute, PREV_IMAGES_DIR, PREV_INDEX_MANIFEST_FILENAME, readManifest} from "./common.js";
import type {RepoImageMeta} from "./types.js";

// about 3 lines
const MAX_RELEASE_NOTES_LENGTH = 380;

function findReleaseNotes(imagePath: string, manifest: RepoImageMeta[]): string | undefined {
    const metas = manifest.find((m) => m.url.endsWith(imagePath));

    return metas?.releaseNotes;
}

function listItemWithReleaseNotes(imagePath: string, releaseNotes?: string): string {
    let listItem = `* ${imagePath}`;

    if (releaseNotes) {
        let notes = releaseNotes.replace(/[#*\r\n]+/g, "").replaceAll("-", "|");

        if (notes.length > MAX_RELEASE_NOTES_LENGTH) {
            notes = `${notes.slice(0, MAX_RELEASE_NOTES_LENGTH)}...`;
        }

        listItem += `
  - ${notes}`;
    }

    return listItem;
}

export async function createAutodlRelease(github: Octokit, core: typeof CoreApi, context: Context): Promise<void> {
    const tagName = new Date().toISOString().replace(/[:.]/g, "");
    // --exclude-standard => Add the standard Git exclusions: .git/info/exclude, .gitignore in each directory, and the user’s global exclusion file.
    // --others => Show other (i.e. untracked) files in the output.
    // -z => \0 line termination on output and do not quote filenames.
    const upgradeImagesStr = await execute(`git ls-files --others --exclude-standard --modified -z ${BASE_IMAGES_DIR}`);
    const downgradeImagesStr = await execute(`git ls-files --others --exclude-standard --modified -z ${PREV_IMAGES_DIR}`);

    core.debug(`git ls-files for ${BASE_IMAGES_DIR}: ${upgradeImagesStr}`);
    core.debug(`git ls-files for ${PREV_IMAGES_DIR}: ${downgradeImagesStr}`);

    // -1 to remove empty string at end due to \0 termination
    const upgradeImages = upgradeImagesStr.split("\0").slice(0, -1);
    const downgradeImages = downgradeImagesStr.split("\0").slice(0, -1);

    core.info(`Upgrade Images List: ${upgradeImages}`);
    core.info(`Downgrade Images List: ${downgradeImages}`);

    const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);
    const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);

    let body: string | undefined;

    if (upgradeImages.length > 0 || downgradeImages.length > 0) {
        body = "";

        if (upgradeImages.length > 0) {
            const listWithReleaseNotes = upgradeImages.map((v) => listItemWithReleaseNotes(v, findReleaseNotes(v, baseManifest)));
            body += `## New upgrade images from automatic download:
${listWithReleaseNotes.join("\n")}

`;
        }

        if (downgradeImages.length > 0) {
            const listWithReleaseNotes = downgradeImages.map((v) => listItemWithReleaseNotes(v, findReleaseNotes(v, prevManifest)));
            body += `## New downgrade images from automatic download:
${listWithReleaseNotes.join("\n")}

`;
        }
    }

    await github.rest.repos.createRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: tagName,
        name: tagName,
        body,
        draft: false,
        prerelease: false,
        // get changes from PRs
        generate_release_notes: true,
        make_latest: "true",
    });
}
