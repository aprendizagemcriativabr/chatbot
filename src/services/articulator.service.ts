import type { ArticulatorInput } from "../schemas/articulator.schema.js";
import { persistenceProvider } from "../persistence/index.js";

type ActiveArticulator = {
  id: number;
  name: string;
  phone: string;
  created_at: Date;
  updated_at: Date;
};

export class ArticulatorService {
  async existsActiveByPhone(phone: string): Promise<boolean> {
    return persistenceProvider.repositories.articulator.existsActiveByPhone(phone);
  }

  async listActiveArticulators(): Promise<ActiveArticulator[]> {
    return persistenceProvider.repositories.articulator.listActive();
  }

  async syncArticulators(payloadArticulators: ArticulatorInput[]): Promise<ActiveArticulator[]> {
    return persistenceProvider.unitOfWork.withTransaction(async (tx) => {
      const activeArticulators = await persistenceProvider.repositories.articulator.findActive(tx);
      const payloadByPhone = new Map(payloadArticulators.map((a) => [a.phone, a]));
      const activePhones = new Set(activeArticulators.map((a) => a.phone));
      const payloadPhones = [...payloadByPhone.keys()];
      const phonesToSoftDelete = [...activePhones].filter((phone) => !payloadByPhone.has(phone));
      const existingPayloadRows = await persistenceProvider.repositories.articulator.findByPhones(tx, payloadPhones);
      const existingPayloadRowsByPhone = new Map(existingPayloadRows.map((row) => [row.phone, row]));

      if (phonesToSoftDelete.length > 0) {
        await persistenceProvider.repositories.articulator.softDeleteByPhones(tx, phonesToSoftDelete);
      }

      for (const articulator of payloadArticulators) {
        const existingRow = existingPayloadRowsByPhone.get(articulator.phone);

        if (!existingRow) {
          await persistenceProvider.repositories.articulator.insert(tx, articulator);
          continue;
        }

        if (existingRow.deleted_at) {
          await persistenceProvider.repositories.articulator.reactivate(tx, existingRow.id, articulator.name);
          continue;
        }

        if (existingRow.name !== articulator.name) {
          await persistenceProvider.repositories.articulator.updateName(tx, existingRow.id, articulator.name);
        }
      }

      return persistenceProvider.repositories.articulator.findActive(tx);
    });
  }
}

export const articulatorService = new ArticulatorService();
