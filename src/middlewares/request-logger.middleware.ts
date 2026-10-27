import type { RequestHandler } from "express";

export const requestLoggerMiddleware: RequestHandler = (
  request,
  _response,
  next,
) => {
  console.info(`[HTTP] ${request.method} ${request.originalUrl}`);
  next();
};
