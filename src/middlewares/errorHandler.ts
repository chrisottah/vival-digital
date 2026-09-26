import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { NibssError } from '../services/nibss.service';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Zod validation errors → 422
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      issues: err.flatten().fieldErrors,
    });
  }

  // Our own AppError → use its status
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // Errors bubbled up from NIBSS → forward status + message
  if (err instanceof NibssError) {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 502;
    return res.status(status).json({
      error: err.message,
      source: 'nibss',
      details: err.responseBody,
    });
  }

  // Unknown — log full, return generic
  logger.error('Unhandled error', err);
  return res.status(500).json({
    error: 'Internal server error',
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}