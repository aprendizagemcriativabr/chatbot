import axios from "axios";

export interface WhatsAppMediaDownloadResult {
  mediaId: string;
  mimeType: string;
  fileName: string;
  buffer: Buffer;
}

type WhatsAppMediaMetadata = {
  id: string;
  mime_type?: string;
  url: string;
};

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "video/mp4": "mp4",
  };

  return map[mimeType] || "bin";
}

export class WhatsAppMediaService {
  private readonly accessToken: string;

  constructor() {
    const token = process.env.ACCESS_TOKEN;

    if (!token) {
      throw new Error("Missing env ACCESS_TOKEN");
    }

    this.accessToken = token;
  }

  async downloadMedia(mediaId: string): Promise<WhatsAppMediaDownloadResult> {
    const metadata = await this.fetchMetadata(mediaId);
    const mimeType = metadata.mime_type || "application/octet-stream";
    const extension = extensionFromMime(mimeType);

    const binaryResponse = await axios.get<ArrayBuffer>(metadata.url, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      timeout: 20000,
    });

    return {
      mediaId,
      mimeType,
      fileName: `${mediaId}.${extension}`,
      buffer: Buffer.from(binaryResponse.data),
    };
  }

  private async fetchMetadata(mediaId: string): Promise<WhatsAppMediaMetadata> {
    const response = await axios.get<WhatsAppMediaMetadata>(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 20000,
      },
    );

    return response.data;
  }
}

let whatsAppMediaServiceInstance: WhatsAppMediaService | null = null;

export function getWhatsAppMediaService(): WhatsAppMediaService {
  if (!whatsAppMediaServiceInstance) {
    whatsAppMediaServiceInstance = new WhatsAppMediaService();
  }

  return whatsAppMediaServiceInstance;
}
