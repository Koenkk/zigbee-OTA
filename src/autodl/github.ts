import type {ExtraMetas} from '../types.js';

import {getJson, getLatestImage, readCacheJson, writeCacheJson} from '../common.js';
import {processFirmwareImage} from '../process_firmware_image.js';

type ReleaseAssetJson = {
    url: string;
    id: number;
    node_id: string;
    name: string;
    label: null;
    uploader: Record<string, unknown>;
    content_type: string;
    state: string;
    size: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    browser_download_url: string;
};
type ReleaseJson = {
    url: string;
    assets_url: string;
    upload_url: string;
    html_url: string;
    id: number;
    author: Record<string, unknown>;
    node_id: string;
    tag_name: string;
    target_commitish: string;
    name: string;
    draft: false;
    prerelease: false;
    created_at: string;
    published_at: string;
    assets: ReleaseAssetJson[];
    tarball_url: string;
    zipball_url: string;
    body: string;
    reactions: Record<string, unknown>;
};
type ReleasesJson = ReleaseJson[];
type AssetFindPredicate = (value: ReleaseAssetJson, index: number, obj: ReleaseAssetJson[]) => unknown;

function sortByPublishedAt(a: ReleaseJson, b: ReleaseJson): number {
    return a.published_at < b.published_at ? -1 : a.published_at > b.published_at ? 1 : 0;
}

function isDifferent(newData: ReleaseAssetJson, cachedData?: ReleaseAssetJson): boolean {
    return Boolean(process.env.IGNORE_CACHE) || !cachedData || cachedData.updated_at !== newData.updated_at;
}

export async function writeCache(manufacturer: string, releasesUrl: string): Promise<void> {
    const releases = await getJson<ReleasesJson>(manufacturer, releasesUrl);

    if (releases?.length) {
        writeCacheJson(manufacturer, releases);
    }
}

export async function download(manufacturer: string, releasesUrl: string, assetFinders: AssetFindPredicate[], extraMetas: ExtraMetas): Promise<void> {
    const logPrefix = `[${manufacturer}]`;
    const releases = await getJson<ReleasesJson>(manufacturer, releasesUrl);

    if (releases?.length) {
        const release = getLatestImage(releases, sortByPublishedAt);

        if (release) {
            const cachedData = readCacheJson<ReleasesJson>(manufacturer);
            const cached = cachedData?.length ? getLatestImage(cachedData, sortByPublishedAt) : undefined;

            for (const assetFinder of assetFinders) {
                const asset = release.assets.find(assetFinder);

                if (asset) {
                    const cachedAsset = cached?.assets.find(assetFinder);

                    if (!isDifferent(asset, cachedAsset)) {
                        console.log(`[${manufacturer}:${asset.name}] No change from last run.`);
                        continue;
                    }

                    await processFirmwareImage(manufacturer, asset.name, asset.browser_download_url, {
                        releaseNotes: release.html_url,
                        ...extraMetas,
                    });
                } else {
                    console.error(`${logPrefix} No image found.`);
                }
            }
        } else {
            console.error(`${logPrefix} No release found.`);
        }

        writeCacheJson(manufacturer, releases);
    }
}
