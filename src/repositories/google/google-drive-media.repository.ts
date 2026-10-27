import type {
  MediaUploadInput,
  MediaUploadResult,
} from "../contracts/event-storage.repository.js";
import type { GoogleApiConfig } from "./google-api.config.js";
import { GoogleApiClient } from "./google-api.client.js";

type GoogleDriveUploadResponse = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
};

type GoogleDriveFileListResponse = {
  files?: Array<{ id: string; name: string }>;
};

function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

function sanitizeFolderName(value: string): string {
  const sanitized = value.replace(/[\\/:*?"<>|]/g, "_").trim();
  return sanitized.length > 0 ? sanitized.slice(0, 120) : "sem-pasta";
}

type ProjectFolders = {
  nucleo: string;
  iniciativa: string;
};

export class GoogleDriveMediaRepository {
  private readonly client: GoogleApiClient;
  private readonly nestedFolderCache = new Map<string, string>();
  private readonly DRIVE_FILES_URL =
    "https://www.googleapis.com/drive/v3/files";
  private readonly DRIVE_UPLOAD_URL =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink";

  constructor(private readonly config: GoogleApiConfig) {
    this.client = new GoogleApiClient(config);
  }

  private parseFoldersFromSource(
    source: string | undefined,
  ): Partial<ProjectFolders> {
    if (!source) {
      return {};
    }

    const taggedMatch = source.match(
      /nucleo\s*[:=]\s*(.+?)\s*[;,|]\s*iniciativa\s*[:=]\s*(.+)$/i,
    );

    if (taggedMatch) {
      return {
        nucleo: taggedMatch[1].trim(),
        iniciativa: taggedMatch[2].trim(),
      };
    }

    const slashParts = source.split("/").map((part) => part.trim());
    if (slashParts.length >= 2 && slashParts[0] && slashParts[1]) {
      return {
        nucleo: slashParts[0],
        iniciativa: slashParts.slice(1).join("/"),
      };
    }

    const doubleColonParts = source.split("::").map((part) => part.trim());
    if (
      doubleColonParts.length >= 2 &&
      doubleColonParts[0] &&
      doubleColonParts[1]
    ) {
      return {
        nucleo: doubleColonParts[0],
        iniciativa: doubleColonParts.slice(1).join("::"),
      };
    }

    return {};
  }

  private resolveProjectFolders(data: MediaUploadInput): ProjectFolders {
    const fromSource = this.parseFoldersFromSource(data.source);

    const nucleoRaw = data.nucleo || fromSource.nucleo || "sem-nucleo";
    const iniciativaRaw =
      data.iniciativa ||
      fromSource.iniciativa ||
      data.source ||
      "sem-iniciativa";

    const nucleo = sanitizeFolderName(nucleoRaw);
    const iniciativaBase = sanitizeFolderName(iniciativaRaw);
    const iniciativa = this.config.driveProjectFolderPrefix
      ? sanitizeFolderName(
          `${this.config.driveProjectFolderPrefix}-${iniciativaBase}`,
        )
      : iniciativaBase;

    return { nucleo, iniciativa };
  }

  private async findFolderByName(
    folderName: string,
    parentId?: string,
  ): Promise<string | null> {
    const queryParts = [
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      `name='${escapeDriveQuery(folderName)}'`,
    ];

    if (parentId) {
      queryParts.push(`'${escapeDriveQuery(parentId)}' in parents`);
    }

    const url =
      `${this.DRIVE_FILES_URL}?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&q=` +
      encodeURIComponent(queryParts.join(" and "));

    const response = await this.client.request<GoogleDriveFileListResponse>({
      method: "GET",
      url,
    });

    const first = Array.isArray(response.files) ? response.files[0] : undefined;
    return first?.id || null;
  }

  private async createFolder(
    folderName: string,
    parentId?: string,
  ): Promise<string> {
    const payload: {
      name: string;
      mimeType: string;
      parents?: string[];
    } = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };

    if (parentId) {
      payload.parents = [parentId];
    }

    const created = await this.client.request<{ id: string }>({
      method: "POST",
      url: `${this.DRIVE_FILES_URL}?supportsAllDrives=true&fields=id`,
      data: payload,
      headers: {
        "Content-Type": "application/json",
      },
    });

    return created.id;
  }

  private async resolveUploadParent(
    data: MediaUploadInput,
  ): Promise<string | undefined> {
    if (!this.config.driveAutoProjectFolder) {
      return this.config.driveFolderId;
    }

    const folders = this.resolveProjectFolders(data);
    const rootKey = this.config.driveFolderId || "root";
    const cacheKey = `${rootKey}:${folders.nucleo}:${folders.iniciativa}`;
    const cached = this.nestedFolderCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const rootParent = this.config.driveFolderId;

    const nucleoFolderId =
      (await this.ensureFolderExists(folders.nucleo, rootParent)) ||
      (await this.createFolder(folders.nucleo, rootParent));

    const iniciativaFolderId =
      (await this.ensureFolderExists(folders.iniciativa, nucleoFolderId)) ||
      (await this.createFolder(folders.iniciativa, nucleoFolderId));

    this.nestedFolderCache.set(cacheKey, iniciativaFolderId);
    return iniciativaFolderId;
  }

  private async ensureFolderExists(
    folderName: string,
    parentId?: string,
  ): Promise<string | null> {
    try {
      return await this.findFolderByName(folderName, parentId);
    } catch (err) {
      return null;
    }
  }

  async saveMediaFile(data: MediaUploadInput): Promise<MediaUploadResult> {
    const boundary = `rbac-${Date.now()}`;
    const uploadParent = await this.resolveUploadParent(data);

    const metadata: {
      name: string;
      mimeType: string;
      parents?: string[];
      description?: string;
    } = {
      name: data.fileName,
      mimeType: data.mimeType,
      description: `phone=${data.phone};source=${data.source || "whatsapp"};submittedAt=${data.submittedAt || new Date().toISOString()}`,
    };

    if (uploadParent) {
      metadata.parents = [uploadParent];
    }

    const metadataPart = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      "utf8",
    );

    const mediaHeader = Buffer.from(
      `--${boundary}\r\nContent-Type: ${data.mimeType}\r\n\r\n`,
      "utf8",
    );

    const mediaFooter = Buffer.from(`\r\n--${boundary}--`, "utf8");

    const body = Buffer.concat([
      metadataPart,
      mediaHeader,
      data.buffer,
      mediaFooter,
    ]);

    const response = await this.client.request<GoogleDriveUploadResponse>({
      method: "POST",
      url: this.DRIVE_UPLOAD_URL,
      data: body,
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      maxBodyLength: Infinity,
    });

    return {
      fileId: response.id,
      name: response.name,
      mimeType: response.mimeType,
      size: response.size,
      webViewLink: response.webViewLink,
      webContentLink: response.webContentLink,
    };
  }
}
