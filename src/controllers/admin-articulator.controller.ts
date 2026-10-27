import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { syncArticulatorsBodySchema } from "../schemas/articulator.schema.js";
import { articulatorService } from "../services/articulator.service.js";

export class AdminArticulatorController {
  async list(_request: Request, response: Response, next: NextFunction) {
    try {
      const articulators = await articulatorService.listActiveArticulators();

      return response.status(200).json({ articulators });
    } catch (error) {
      return next(error);
    }
  }

  async sync(request: Request, response: Response, next: NextFunction) {
    try {
      const normalizedBody = this.normalizeArticulatorsPayload(request.body);
      const body = syncArticulatorsBodySchema.parse(normalizedBody);

      const duplicatePhones = this.findDuplicatePhones(
        body.articulators.map((articulator) => articulator.phone),
      );

      if (duplicatePhones.length > 0) {
        return response.status(400).json({
          error: "duplicate phones in payload",
          duplicate_phones: duplicatePhones,
        });
      }

      const articulators = await articulatorService.syncArticulators(body.articulators);

      return response.status(200).json({ articulators });
    } catch (error) {
      if (error instanceof ZodError) {
        return response.status(400).json({
          error: "invalid request body",
          details: error.issues,
        });
      }

      return next(error);
    }
  }

  private findDuplicatePhones(phones: string[]): string[] {
    const frequencies = new Map<string, number>();

    for (const phone of phones) {
      frequencies.set(phone, (frequencies.get(phone) ?? 0) + 1);
    }

    return [...frequencies.entries()]
      .filter(([, count]) => count > 1)
      .map(([phone]) => phone);
  }

  private normalizeArticulatorsPayload(rawBody: unknown): unknown {
    if (
      typeof rawBody !== "object" ||
      rawBody === null ||
      !("articulators" in rawBody) ||
      !Array.isArray((rawBody as { articulators?: unknown }).articulators)
    ) {
      return rawBody;
    }

    const body = rawBody as {
      articulators: Array<{ name?: unknown; phone?: unknown }>;
    };

    return {
      ...body,
      articulators: body.articulators.map((articulator) => {
        if (typeof articulator.phone !== "string") {
          return articulator;
        }

        const phone = articulator.phone.trim();

        if (phone.startsWith("55")) {
          return {
            ...articulator,
            phone,
          };
        }

        return {
          ...articulator,
          phone: `55${phone}`,
        };
      }),
    };
  }
}

export const adminArticulatorController = new AdminArticulatorController();
