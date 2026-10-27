import type { ErrorRequestHandler } from "express";

export const errorLoggerMiddleware: ErrorRequestHandler = (
  error,
  request,
  _response,
  next,
) => {
  console.error(`[HTTP] ${request.method} ${request.originalUrl}`, error);
  next(error);
};
