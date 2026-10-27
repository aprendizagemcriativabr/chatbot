import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../errors/app-error.js";
import { syncQuestionsBodySchema } from "../schemas/question.schema.js";
import { questionService } from "../services/question.service.js";

export class AdminQuestionController {
  async list(_request: Request, response: Response, next: NextFunction) {
    try {
      const questions = await questionService.listQuestions();
      return response.status(200).json({ questions });
    } catch (error) {
      return next(error);
    }
  }

  async sync(request: Request, response: Response, next: NextFunction) {
    try {
      const body = syncQuestionsBodySchema.parse(request.body);

      const duplicateOrders = this.findDuplicateOrders(body.questions.map((item) => item.order));

      if (duplicateOrders.length > 0) {
        return response.status(400).json({
          error: "duplicate orders in payload",
          duplicate_orders: duplicateOrders,
        });
      }

      const result = await questionService.replaceQuestions(body.questions);
      return response.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return response.status(400).json({
          error: "invalid request body",
          details: error.issues,
        });
      }

      if (error instanceof AppError) {
        return response.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }

      return next(error);
    }
  }

  private findDuplicateOrders(orders: number[]): number[] {
    const frequencies = new Map<number, number>();

    for (const order of orders) {
      frequencies.set(order, (frequencies.get(order) ?? 0) + 1);
    }

    return [...frequencies.entries()]
      .filter(([, count]) => count > 1)
      .map(([order]) => order)
      .sort((left, right) => left - right);
  }
}

export const adminQuestionController = new AdminQuestionController();
