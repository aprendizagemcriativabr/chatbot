import { Router } from "express";

import { adminQuestionController } from "../controllers/admin-question.controller.js";
import { validateAdminTokenMiddleware } from "../middlewares/validate-admin-token.middleware.js";

export const adminQuestionRouter = Router();

adminQuestionRouter.get("/", validateAdminTokenMiddleware, (request, response, next) =>
  adminQuestionController.list(request, response, next),
);

adminQuestionRouter.post("/", validateAdminTokenMiddleware, (request, response, next) =>
  adminQuestionController.sync(request, response, next),
);
