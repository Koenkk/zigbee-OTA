import * as github from './github.js';

const NAME = 'xyzroe';
const FIRMWARE_URL = 'https://api.github.com/repos/xyzroe/ZigUSB_C6/releases';
const FIRMWARE_EXT = '.ota';

export async function writeCache(): Promise<void> {
    await github.writeCache(NAME, FIRMWARE_URL);
}

export async function download(): Promise<void> {
    await github.download(
        NAME,
        FIRMWARE_URL,
        [(a): boolean => a.name.endsWith(FIRMWARE_EXT)],
        {modelId: 'ZigUSB_C6'},
    );
}
