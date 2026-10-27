import type {
  FormSaveResult,
  FormSubmission,
  MediaSheetUpdateInput,
  MediaUploadInput,
  MediaUploadResult,
  FormMediaStorageRepository,
} from "../contracts/event-storage.repository.js";
import {
  loadGoogleApiConfig,
  type GoogleApiConfig,
} from "./google-api.config.js";
import { GoogleDriveMediaRepository } from "./google-drive-media.repository.js";
import { GoogleSheetsFormRepository } from "./google-sheets-event.repository.js";

export class GoogleFormMediaStorageRepository implements FormMediaStorageRepository {
  private readonly sheetsRepository: GoogleSheetsFormRepository;
  private readonly mediaRepository: GoogleDriveMediaRepository;

  constructor(config?: GoogleApiConfig) {
    const resolvedConfig = config ?? loadGoogleApiConfig();
    this.sheetsRepository = new GoogleSheetsFormRepository(resolvedConfig);
    this.mediaRepository = new GoogleDriveMediaRepository(resolvedConfig);
  }

  saveFormSubmission(data: FormSubmission): Promise<FormSaveResult> {
    return this.sheetsRepository.saveFormSubmission(data);
  }

  saveMediaFile(data: MediaUploadInput): Promise<MediaUploadResult> {
    return this.mediaRepository.saveMediaFile(data);
  }

  updateMediaColumns(input: MediaSheetUpdateInput): Promise<void> {
    return this.sheetsRepository.updateMediaColumnsByRow(input);
  }
}
