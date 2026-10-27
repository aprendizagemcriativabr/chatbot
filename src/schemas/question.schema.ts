import { z } from "zod";

import { QUESTION_OPTIONS_MAX } from "../constants/question.constants.js";

export const questionTypeSchema = z.enum(["text", "single_choice", "multiple_choice"]);

const optionSchema = z.string().trim().min(1, { message: "option title is required" });

export const questionSchema = z
  .object({
    text: z.string().trim().min(1, { message: "question text is required" }),
    type: questionTypeSchema,
    helperText: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    order: z.number().int().min(1),
    options: z.array(optionSchema).max(QUESTION_OPTIONS_MAX).optional(),
  })
  .superRefine((question, context) => {
    const optionsCount = question.options?.length ?? 0;

    if (question.type === "text" && optionsCount > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text questions must not include options",
        path: ["options"],
      });
    }

    if (question.type !== "text" && optionsCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "choice questions must include at least one option",
        path: ["options"],
      });
    }
  });

export const syncQuestionsBodySchema = z.object({
  questions: z.array(questionSchema),
});

export type QuestionInput = z.infer<typeof questionSchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type SyncQuestionsBody = z.infer<typeof syncQuestionsBodySchema>;
