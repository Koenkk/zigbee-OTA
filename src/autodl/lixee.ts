import * as github from './github.js';

const NAME = 'LiXee';
const FIRMWARE_URL = 'https://api.github.com/repos/fairecasoimeme/Zlinky_TIC/releases';
/** @see https://github.com/fairecasoimeme/Zlinky_TIC?tab=readme-ov-file#route-or-limited-route-from-v7 */
const FIRMWARE_EXT = '.ota';
const FIRMWARE_LIMITED = `limited${FIRMWARE_EXT}`;

export async function writeCache(): Promise<void> {
    await github.writeCache(NAME, FIRMWARE_URL);
}

export async function download(): Promise<void> {
    await github.download(
        NAME,
        FIRMWARE_URL,
        [(a): boolean => a.name.endsWith(FIRMWARE_EXT), (a): boolean => a.name.endsWith(FIRMWARE_LIMITED)],
        {manufacturerName: [NAME]},
    );
}
