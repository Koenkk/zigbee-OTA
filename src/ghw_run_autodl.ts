import {existsSync, mkdirSync, rmSync} from "node:fs";
import type * as CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import {ALL_AUTODL_MANUFACTURERS, BASE_INDEX_MANIFEST_FILENAME, CACHE_DIR, PREV_INDEX_MANIFEST_FILENAME, TMP_DIR, writeManifest} from "./common.js";

export async function runAutodl(_github: Octokit, core: typeof CoreApi, _context: Context, manufacturersCSV?: string): Promise<void> {
    const manufacturers = manufacturersCSV ? manufacturersCSV.trim().split(",") : ALL_AUTODL_MANUFACTURERS;

    core.info("Setup...");

    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, {recursive: true});
    }

    if (!existsSync(TMP_DIR)) {
        mkdirSync(TMP_DIR, {recursive: true});
    }

    if (!existsSync(BASE_INDEX_MANIFEST_FILENAME)) {
        writeManifest(BASE_INDEX_MANIFEST_FILENAME, []);
    }

    if (!existsSync(PREV_INDEX_MANIFEST_FILENAME)) {
        writeManifest(PREV_INDEX_MANIFEST_FILENAME, []);
    }

    for (const manufacturer of manufacturers) {
        // ignore empty strings
        if (!manufacturer) {
            continue;
        }

        if (!ALL_AUTODL_MANUFACTURERS.includes(manufacturer)) {
            core.error(`Ignoring invalid manufacturer '${manufacturer}'. Expected any of: ${ALL_AUTODL_MANUFACTURERS}.`);
            continue;
        }

        const {download} = await import(`./autodl/${manufacturer}.js`);

        core.startGroup(manufacturer);

        try {
            await download();
        } catch (error) {
            core.error((error as Error).message);
            core.info((error as Error).stack!);
        }

        core.endGroup();
    }

    core.info("Teardown...");

    rmSync(TMP_DIR, {recursive: true, force: true});
}
