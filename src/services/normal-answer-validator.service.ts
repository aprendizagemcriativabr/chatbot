import type { StoredQuestion } from "./chatbot.base.service.js";

export type ValidationResult = { valid: boolean; value: unknown; error?: string };

export class NormalAnswerValidatorService {
  constructor(
    private readonly isOptionalSkipMessage: (messageBody: string) => boolean,
    private readonly getSelectionOptions: (question: StoredQuestion) => Array<{ value: string; title: string }>,
    private readonly parseSingleSelectIndex: (answer: string, optionsCount: number) => number | null,
    private readonly parseMultiSelectIndices: (answer: string, optionsCount: number) => number[] | null,
  ) {}

  validate(answer: string, messageType: string, question: StoredQuestion): ValidationResult {
    const textAnswer = answer.trim();

    if (!question.required && messageType === "text" && this.isOptionalSkipMessage(textAnswer)) {
      return { valid: true, value: null };
    }

    switch (question.type) {
      case "text":
        if (question.required && textAnswer === "") {
          return { valid: false, value: null, error: "Resposta obrigatória. Por favor, envie um texto." };
        }

        return { valid: true, value: textAnswer };

      case "single_choice": {
        const options = this.getSelectionOptions(question);
        const index = this.parseSingleSelectIndex(textAnswer, options.length);
        if (index === null) {
          return { valid: false, value: null, error: `Selecao invalida. Envie um numero de 1 a ${options.length}.` };
        }
        return { valid: true, value: options[index].value };
      }

      case "multiple_choice": {
        const options = this.getSelectionOptions(question);
        const indices = this.parseMultiSelectIndices(textAnswer, options.length);
        if (!indices || indices.length === 0) {
          return {
            valid: false,
            value: null,
            error: `Selecao invalida. Use numeros de 1 a ${options.length}, separados por virgula (ex: 1,3,5).`,
          };
        }
        return { valid: true, value: indices.map((i) => options[i].value) };
      }

      default:
        return { valid: true, value: textAnswer };
    }
  }
}
