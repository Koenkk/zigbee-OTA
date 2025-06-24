import {existsSync, mkdirSync} from "node:fs";
import type CoreApi from "@actions/core";
import type {Context} from "@actions/github/lib/context";
import type {Octokit} from "@octokit/rest";

import {ALL_AUTODL_MANUFACTURERS, CACHE_DIR} from "./common.js";

export async function overwriteCache(github: Octokit, core: typeof CoreApi, context: Context, manufacturersCSV?: string): Promise<void> {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, {recursive: true});
    }

    const manufacturers = manufacturersCSV ? manufacturersCSV.trim().split(",") : ALL_AUTODL_MANUFACTURERS;

    for (const manufacturer of manufacturers) {
        // ignore empty strings
        if (!manufacturer) {
            continue;
        }

        if (!ALL_AUTODL_MANUFACTURERS.includes(manufacturer)) {
            core.error(`Ignoring invalid manufacturer '${manufacturer}'. Expected any of: ${ALL_AUTODL_MANUFACTURERS}.`);
            continue;
        }

        const {writeCache} = await import(`./${manufacturer}.js`);

        core.startGroup(manufacturer);
        core.info(`[${manufacturer}] Writing cache...`);

        try {
            await writeCache();
        } catch (error) {
            core.error((error as Error).message);
            core.debug((error as Error).stack!);
        }

        core.endGroup();
    }
}
