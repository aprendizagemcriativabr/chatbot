import { Router } from "express";

import { adminArticulatorController } from "../controllers/admin-articulator.controller.js";
import { validateAdminTokenMiddleware } from "../middlewares/validate-admin-token.middleware.js";

export const adminArticulatorRouter = Router();

adminArticulatorRouter.get(
  "/",
  validateAdminTokenMiddleware,
  (request, response, next) =>
    adminArticulatorController.list(request, response, next),
);

adminArticulatorRouter.post(
  "/",
  validateAdminTokenMiddleware,
  (request, response, next) =>
    adminArticulatorController.sync(request, response, next),
);
