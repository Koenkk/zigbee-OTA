import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        onConsoleLog() {
            return true;
        },
        coverage: {
            enabled: false,
            provider: "v8",
            include: [
                "src/ghw_check_ota_pr.ts",
                "src/ghw_get_changed_ota_files.ts",
                "src/ghw_process_ota_files.ts",
                "src/process_firmware_image.ts",
                "src/ghw_reprocess_all_images.ts",
            ],
            extension: [".ts"],
            // exclude: [],
            clean: true,
            cleanOnRerun: true,
            reportsDirectory: "coverage",
            reporter: ["text", "html"],
            reportOnFailure: false,
            thresholds: {
                100: true,
            },
        },
        clearMocks: true,
        fileParallelism: false,
    },
});
