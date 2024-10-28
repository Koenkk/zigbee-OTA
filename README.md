# zigbee-OTA

A collection of Zigbee OTA files, see the manifest `index.json` for an overview of all available firmware files.
The manifest `index1.json` contains firmware files for downgrade (previous available version, before the one in `index.json`).

> [!IMPORTANT]
> While a downgrade OTA file may be available for a device through automatic archiving in this repository, it does not mean the device will actually allow the downgrade, some will refuse the OTA file.

## Adding new and updating existing OTA files

Create a pull request with the image(s) in their proper subdirectories (manufacturer name) under `images` directory.

The pull request automation will validate the image. If any error occur, a comment will be posted in the pull request. If the validation succeed, a comment will be posted to inform of the changes that merging the pull request will commit (in a following commit).

> [!IMPORTANT]
> Do NOT submit images in `images1` directory, the pull request automation will take care of placing the file in the proper folder automatically.

### Example using Github

Fork https://github.com/Koenkk/zigbee-OTA/ on Github.

In your fork, navigate to `images` directory, then to whatever manufacturer is associated with your OTA file(s).

Click on `Add file` dropdown, then `Upload files`.

Add the file(s), a good title, and an optional description (if extra metas required, see below), then pick `Create a new branch for this commit and start a pull request.`, then submit with `Propose changes`.

Then wait for the workflow to validate your file(s).

### Example using the console

Fork https://github.com/Koenkk/zigbee-OTA/ on Github.

```bash
# where `username` is your Github username (to use your fork)
$ git clone --depth 1 https://github.com/username/zigbee-OTA/
$ cd zigbee-OTA
$ git checkout -b my-new-image
# where `manufacturer` is the name of the manufacturer associated with the image (if it does not already exist)
$ mkdir ./images/manufacturer/
$ cp ~/Downloads/my-new-ota.ota ./images/manufacturer/
$ git add .
$ git commit -m "New image for xyz device from abc manufacturer"
$ git push -u origin HEAD
```

Then go on Github, create a pull request from the notification in the repository and wait for the workflow to run the validation process.

### Declaring extra metadata for automatic inclusion in the manifest

If the image(s) added to the pull request require extra metadata in the manifest (usually to avoid conflicts, or to set restrictions), you can declare them in the body of the pull request (the description field of the first post).

Example:

````md
This is the latest OTA file for device XYZ.

```json
{
    "modelId": "xyzDevice",
    "manufacturerName": ["xyzManufacturer"]
}
```
````

The pull request automation will look for any valid JSON in-between ` ```json ` and ` ``` ` and add these fields to the manifest.

> [!TIP]
> If the validation failed because of something related to the extra metadata, you can edit the pull request body and make the necessary corrections. The automation will re-run when saved.

> [!IMPORTANT]
> Do NOT use code blocks (` ``` `) for anything else in the body to avoid issues. If necessary, add a new comment below it (only the very first post is used for extra metadata detection).

#### Allowed fields

Valid JSON format is expected.
Any field not in this list will be ignored. Any field not matching the required type will result in failure.

###### To place restrictions

-   "force": boolean _(ignore `fileVersion` and always present as 'available')_
-   "hardwareVersionMax": number
-   "hardwareVersionMin": number
-   "manufacturerName": array of strings _(target only devices with one of these manufacturer names)_
-   "maxFileVersion": number _(target only devices with this version or below)_
-   "minFileVersion": number _(target only devices with this version or above)_
-   "modelId": string _(target only devices with this model ID)_

###### For record purpose

-   "originalUrl": string
-   "releaseNotes": string

If the pull request contains multiple files, the metadata is added for all files. If some files require different metadata, add the matching `fileName` to the JSON using an encompassing array instead. It will be used to assign metadata as directed.

Example:

````md
```json
[
    {
        "fileName": "myotafile-for-xyzdevice.ota",
        "modelId": "xyzDevice",
        "manufacturerName": ["xyzManufacturer"]
    },
    {
        "fileName": "myotafile-for-abcdevice.ota",
        "modelId": "abcDevice",
        "manufacturerName": ["abcManufacturer"]
    }
]
```
````

### Notes for maintainers & developers

-   `images` and `index.json` contain added (PR or auto download) "upgrade" images.
-   `images1` and `index1.json` contain automatically archived "downgrade" images (automatically moved from `images`/`index.json` after a merged PR introduced a newer version, or during auto download).

If a manual modification of the manifests is necessary, it should be done in a PR that does not trigger the `update_ota_pr` workflow (no changes in `images/**` directory). As a last resort, the label `ignore-ota-workflow` can be added to prevent the workflow from running.

The metadata structure for images is as below (see above for details on extra metas):

```typescript
interface RepoImageMeta {
    //-- automatic from parsed image
    imageType: number;
    fileVersion: number;
    manufacturerCode: number;
    fileSize: number;
    otaHeaderString: string;
    //-- automatic from image file
    url: string;
    sha512: string;
    fileName: string;
    //-- extra metas
    force?: boolean;
    hardwareVersionMin?: number;
    hardwareVersionMax?: number;
    modelId?: string;
    manufacturerName?: string[];
    minFileVersion?: number;
    maxFileVersion?: number;
    originalUrl?: string;
    releaseNotes?: string;
}
```

See https://github.com/Koenkk/zigbee-OTA/pull/581#issue-2619493249 for details on the processes used by this repository.
