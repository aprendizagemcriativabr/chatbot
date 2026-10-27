export interface FormFields {
  [key: string]: string | number | boolean | null;
}

export interface FormSubmission {
  phone: string;
  articulatorName?: string;
  submittedAt?: string;
  source?: string;
  sheetName?: string;
  fields: FormFields;
}

export interface MediaUploadInput {
  phone: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  submittedAt?: string;
  source?: string;
  nucleo?: string;
  iniciativa?: string;
}

export interface MediaUploadResult {
  fileId: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface FormSaveResult {
  updatedRange?: string;
  updatedRows?: number;
  updatedColumns?: number;
  updatedCells?: number;
  rowIndex?: number;
}

export interface MediaSheetUpdateInput {
  rowIndex: number;
  mediaLinks: string;
  mediaIds: string;
  sheetName?: string;
}

export interface FormMediaStorageRepository {
  saveFormSubmission(data: FormSubmission): Promise<FormSaveResult>;
  saveMediaFile(data: MediaUploadInput): Promise<MediaUploadResult>;
  updateMediaColumns(input: MediaSheetUpdateInput): Promise<void>;
}
