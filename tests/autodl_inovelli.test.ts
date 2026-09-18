import {describe, expect, it} from "vitest";
import {getChangedGitHubFirmwareFiles, getGitHubFirmwareFiles, getGitHubFirmwareUrl} from "../src/autodl/inovelli.js";

describe("Inovelli autodl", () => {
    it("finds Zigbee OTA files in the GitHub tree", () => {
        const files = getGitHubFirmwareFiles({
            truncated: false,
            tree: [
                {
                    path: "Blue-Series/Zigbee/VZM31/Production/3.04/VZM31-SN_3.04.ota",
                    sha: "production",
                    type: "blob",
                },
                {
                    path: "Blue-Series/Zigbee/VZM31/Beta/3.07/VZM31-SN_3.07.OTA",
                    sha: "beta",
                    type: "blob",
                },
                {
                    path: "Blue-Series/Zigbee/VZM31/README.md",
                    sha: "readme",
                    type: "blob",
                },
                {
                    path: "Red-Series/Z-Wave/VZW31/VZW31-SN_2.04.ota",
                    sha: "z-wave",
                    type: "blob",
                },
                {
                    path: "Blue-Series/Zigbee/VZM31/Beta",
                    sha: "tree",
                    type: "tree",
                },
            ],
        });

        expect(files).toStrictEqual([
            {
                path: "Blue-Series/Zigbee/VZM31/Beta/3.07/VZM31-SN_3.07.OTA",
                sha: "beta",
            },
            {
                path: "Blue-Series/Zigbee/VZM31/Production/3.04/VZM31-SN_3.04.ota",
                sha: "production",
            },
        ]);
    });

    it("rejects a truncated GitHub tree", () => {
        expect(() => getGitHubFirmwareFiles({truncated: true, tree: []})).toThrow("GitHub firmware tree is truncated");
    });

    it("finds new and changed GitHub firmware files", () => {
        const files = [
            {path: "changed.ota", sha: "new"},
            {path: "new.ota", sha: "new"},
            {path: "unchanged.ota", sha: "same"},
        ];
        const cachedFiles = [
            {path: "changed.ota", sha: "old"},
            {path: "removed.ota", sha: "old"},
            {path: "unchanged.ota", sha: "same"},
        ];

        expect(getChangedGitHubFirmwareFiles(files, cachedFiles, false)).toStrictEqual([
            {path: "changed.ota", sha: "new"},
            {path: "new.ota", sha: "new"},
        ]);
        expect(getChangedGitHubFirmwareFiles(files, cachedFiles, true)).toStrictEqual(files);
    });

    it("builds an encoded raw GitHub URL", () => {
        expect(getGitHubFirmwareUrl("Blue-Series/Zigbee/Fan Plus/Firmware 1.0.ota")).toBe(
            "https://raw.githubusercontent.com/InovelliUSA/Firmware/main/Blue-Series/Zigbee/Fan%20Plus/Firmware%201.0.ota",
        );
    });
});
