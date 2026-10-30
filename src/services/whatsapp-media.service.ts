import axios from "axios";
import axiosRetry from "axios-retry";
import https from "https";

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
    "audio/ogg": "ogg",      // Áudios e mensagens de voz do WhatsApp
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf" // Documentos frequentes
  };

  return map[mimeType] || "bin";
}

export class WhatsAppMediaService {
  private readonly accessToken: string;
  private readonly apiClient;

  constructor() {
    const token = process.env.ACCESS_TOKEN;

    if (!token) {
      throw new Error("Missing env ACCESS_TOKEN");
    }

    this.accessToken = token;

    // Centraliza as configurações de rede, timeout e autenticação
    this.apiClient = axios.create({
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      httpsAgent: new https.Agent({
        keepAlive: true
      })
    });

    // Aplica a política de retentativa para absorver os ETIMEDOUT silenciosamente
    axiosRetry(this.apiClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED';
      }
    });
  }

  async downloadMedia(mediaId: string): Promise<WhatsAppMediaDownloadResult> {
    const metadata = await this.fetchMetadata(mediaId);
    const mimeType = metadata.mime_type || "application/octet-stream";
    const extension = extensionFromMime(mimeType);

    // Utiliza a instância configurada em vez do axios estático
    const binaryResponse = await this.apiClient.get<ArrayBuffer>(metadata.url, {
      responseType: "arraybuffer",
    });

    return {
      mediaId,
      mimeType,
      fileName: `${mediaId}.${extension}`,
      buffer: Buffer.from(binaryResponse.data),
    };
  }

  private async fetchMetadata(mediaId: string): Promise<WhatsAppMediaMetadata> {
    const response = await this.apiClient.get<WhatsAppMediaMetadata>(
      `https://graph.facebook.com/v22.0/${mediaId}`
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
