import {BASE_INDEX_MANIFEST_FILENAME, PREV_INDEX_MANIFEST_FILENAME, readManifest} from "./common";
import type {RepoImageMeta} from "./types";

const USAGE = `Usage: tsx src/find_matches.ts <BASE|PREV> <imageType> <manufacturerCode> [modelId] [manufacturerName]
       Examples:
         - tsx src/find_matches.ts BASE 287 4107
         - tsx src/find_matches.ts BASE 287 4107 "abcd" "efgh"
`;

function getImageMetas(
    imageList: RepoImageMeta[],
    imageType: number,
    manufacturerCode: number,
    modelId: string | undefined,
    manufacturerName: string | undefined,
): RepoImageMeta[] | undefined {
    return imageList
        .filter(
            (i) =>
                i.imageType === imageType &&
                i.manufacturerCode === manufacturerCode &&
                (!i.modelId || !modelId || i.modelId === modelId) &&
                (!i.manufacturerName || !manufacturerName || i.manufacturerName.includes(manufacturerName)),
        )
        .sort((a, b) => a.fileVersion - b.fileVersion);
}

function main(): void {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        throw new Error(USAGE);
    }

    const manifestName = args[0] === "PREV" ? PREV_INDEX_MANIFEST_FILENAME : BASE_INDEX_MANIFEST_FILENAME;
    const imageType = Number(args[1]);
    const manufacturerCode = Number(args[2]);
    const modelId = args[3];
    const manufacturerName = args[4] || undefined;
    const manifest = readManifest(manifestName);
    const matches = getImageMetas(manifest, imageType, manufacturerCode, modelId, manufacturerName);

    console.log(matches);
}

main();
