import { Router } from "express";

import { adminArticulatorRouter } from "./admin-articulator.route.js";
import { adminQuestionRouter } from "./admin-question.route.js";
import { googleAuthRouter } from "./google-auth.route.js";
import { healthRouter } from "./health.route.js";

export const router = Router();

router.use("/health", healthRouter);
router.use("/admin/articulators", adminArticulatorRouter);
router.use("/admin/questions", adminQuestionRouter);
router.use("/", googleAuthRouter);
