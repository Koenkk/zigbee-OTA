//-- Copied from ZHC
export interface Version {
    imageType: number;
    manufacturerCode: number;
    fileVersion: number;
}

export interface ImageHeader {
    otaUpgradeFileIdentifier: Buffer;
    otaHeaderVersion: number;
    otaHeaderLength: number;
    otaHeaderFieldControl: number;
    manufacturerCode: number;
    imageType: number;
    fileVersion: number;
    zigbeeStackVersion: number;
    otaHeaderString: string;
    totalImageSize: number;
    securityCredentialVersion?: number;
    upgradeFileDestination?: Buffer;
    minimumHardwareVersion?: number;
    maximumHardwareVersion?: number;
}

export interface ImageElement {
    tagID: number;
    length: number;
    data: Buffer;
}

export interface Image {
    header: ImageHeader;
    elements: ImageElement[];
    raw: Buffer;
}

export interface ImageInfo {
    imageType: number;
    fileVersion: number;
    manufacturerCode: number;
}

// XXX: adjusted from ZHC
export interface ImageMeta {
    fileVersion: number;
    fileSize: number;
    url: string;
    force?: boolean;
    sha512: string;
    otaHeaderString: string;
    hardwareVersionMin?: number;
    hardwareVersionMax?: number;
}
//-- Copied from ZHC

export interface RepoImageMeta extends ImageInfo, ImageMeta {
    fileName: string;
    modelId?: string;
    manufacturerName?: string[];
    minFileVersion?: number;
    maxFileVersion?: number;
    originalUrl?: string;
    releaseNotes?: string;
    customParseLogic?: string;
}

export type ExtraMetas = Omit<
    RepoImageMeta,
    "fileName" | "fileVersion" | "fileSize" | "url" | "imageType" | "manufacturerCode" | "sha512" | "otaHeaderString"
>;
export type ExtraMetasWithFileName = Omit<
    RepoImageMeta,
    "fileName" | "fileVersion" | "fileSize" | "url" | "imageType" | "manufacturerCode" | "sha512" | "otaHeaderString"
> & {fileName?: string};
export type GHExtraMetas = ExtraMetas | ExtraMetasWithFileName[];
