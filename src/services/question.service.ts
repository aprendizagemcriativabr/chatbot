import axios from "axios";

import { AppError } from "../errors/app-error.js";
import type { QuestionInput, QuestionType } from "../schemas/question.schema.js";
import { GoogleSheetsFormRepository, loadGoogleApiConfig } from "../repositories/index.js";
import { persistenceProvider } from "../persistence/index.js";

export type QuestionView = {
  id: number;
  text: string;
  type: QuestionType;
  helperText: string | null;
  required: boolean;
  order: number;
  options: string[];
  created_at: Date;
  updated_at: Date;
};

export type SyncQuestionsResult = {
  questions: QuestionView[];
};

export class QuestionService {
  async listQuestions(): Promise<QuestionView[]> {
    const rows = await persistenceProvider.repositories.question.listAll();
    return this.parseRows(rows);
  }

  async replaceQuestions(payloadQuestions: QuestionInput[]): Promise<SyncQuestionsResult> {
    if (payloadQuestions.length === 0) throw new AppError("at_least_one_question_required", "at least one question is required", 400);
    this.ensureUniqueOptionValues(payloadQuestions);

    try {
      const googleConfig = loadGoogleApiConfig();
      const sheetsRepository = new GoogleSheetsFormRepository(googleConfig);
      const sheetCreationResult = await sheetsRepository.createSheetWithHeaders(this.buildQuestionHeaders(payloadQuestions));

      const finalQuestions = await persistenceProvider.unitOfWork.withTransaction(async (tx) => {
        await persistenceProvider.repositories.question.deleteAll(tx);
        for (const question of payloadQuestions) {
          await persistenceProvider.repositories.question.insert(tx, question);
        }

        await persistenceProvider.repositories.appConfig.setConfigValue(
          "google_sheets_active_tab",
          sheetCreationResult.sheetName,
          tx,
        );

        return this.parseRows(await persistenceProvider.repositories.question.findAll(tx));
      });

      return {
        questions: finalQuestions,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new AppError("google_sheets_sheet_creation_failed", "google sheets sheet creation failed", 502, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
        });
      }
      throw error;
    }
  }

  private buildQuestionHeaders(questions: QuestionInput[]): string[] {
    return [
      "Telefone",
      "Articulador",
      ...questions.map((q) => q.text),
      "Data/Hora",
      "Midia Links",
      "Midia IDs",
    ];
  }

  private parseRows(rows: Awaited<ReturnType<typeof persistenceProvider.repositories.question.listAll>>): QuestionView[] {
    return rows.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      helperText: q.helper_text,
      required: q.required,
      order: q.order,
      options: q.options.map((option) => option.title),
      created_at: q.created_at,
      updated_at: q.updated_at,
    }));
  }

  private ensureUniqueOptionValues(questions: QuestionInput[]): void {
    for (const question of questions) {
      if (question.type === "text") {
        continue;
      }

      const values = new Set<string>();
      for (let index = 0; index < (question.options ?? []).length; index += 1) {
        const value = this.normalizeOptionValue(question.options?.[index] ?? "", index);
        if (values.has(value)) {
          throw new AppError(
            "duplicate_question_option_values",
            "choice question options generate duplicate values",
            400,
            { question_order: question.order },
          );
        }
        values.add(value);
      }
    }
  }

  private normalizeOptionValue(raw: string, fallbackIndex: number): string {
    const normalized = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    return normalized || `opcao_${fallbackIndex + 1}`;
  }
}

export const questionService = new QuestionService();
