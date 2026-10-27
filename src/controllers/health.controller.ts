import type { Request, Response } from "express";

import { healthService } from "../services/health.service.js";
import { healthQuerySchema } from "../schemas/health.schema.js";

export class HealthController {
  getStatus(request: Request, response: Response) {
    const query = healthQuerySchema.parse(request.query);
    const result = healthService.getStatus(query.name);

    return response.status(200).json(result);
  }
}

export const healthController = new HealthController();
