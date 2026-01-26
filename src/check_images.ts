import {existsSync} from "node:fs";
import {join} from "node:path";
import {BASE_INDEX_MANIFEST_FILENAME, BASE_REPO_URL, PREV_INDEX_MANIFEST_FILENAME, REPO_BRANCH, readManifest} from "./common";

const baseManifest = readManifest(BASE_INDEX_MANIFEST_FILENAME);

for (const meta of baseManifest) {
    const filePath = decodeURIComponent(meta.url.replace(BASE_REPO_URL + REPO_BRANCH, ""));

    if (!existsSync(join(".", filePath))) {
        console.error(`BASE MISSING: ${filePath}`);
    }
}

const prevManifest = readManifest(PREV_INDEX_MANIFEST_FILENAME);

for (const meta of prevManifest) {
    const filePath = decodeURIComponent(meta.url.replace(BASE_REPO_URL + REPO_BRANCH, ""));

    if (!existsSync(join(".", filePath))) {
        console.error(`PREV MISSING: ${filePath}`);
    }
}
