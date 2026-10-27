import {
  GoogleFormMediaStorageRepository,
  type MediaSheetUpdateInput,
  type FormSaveResult,
  type FormSubmission,
  type MediaUploadInput,
  type MediaUploadResult,
  type FormMediaStorageRepository,
} from "../repositories/index.js";

export class EventStorageService {
  constructor(private readonly repository: FormMediaStorageRepository) {}

  saveForm(submission: FormSubmission): Promise<FormSaveResult> {
    return this.repository.saveFormSubmission(submission);
  }

  saveMedia(input: MediaUploadInput): Promise<MediaUploadResult> {
    return this.repository.saveMediaFile(input);
  }

  updateMediaColumns(input: MediaSheetUpdateInput): Promise<void> {
    return this.repository.updateMediaColumns(input);
  }
}

let eventStorageServiceInstance: EventStorageService | null = null;

export function getEventStorageService(): EventStorageService {
  if (!eventStorageServiceInstance) {
    eventStorageServiceInstance = new EventStorageService(
      new GoogleFormMediaStorageRepository(),
    );
  }

  return eventStorageServiceInstance;
}
