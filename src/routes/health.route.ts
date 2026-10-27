import { Router } from "express";

import { healthController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", (request, response) =>
  healthController.getStatus(request, response),
);
