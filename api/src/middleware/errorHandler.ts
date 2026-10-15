import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';

/**
 * Global Error Handler
 *
 * Invariants:
 * 1. Every error is logged exactly once with structured context.
 * 2. Sensitive data (body, headers, tokens) is never echoed to the client.
 * 3. HTTP status codes are deterministic for each error class:
 *    - Malformed JSON body (SyntaxError with `body`) -> 400
 *    - ApiError -> err.statusCode
 *    - Anything else -> 500
 * 4. The response shape is always `{ success: false, error }`.
 * 5. Headers already sent (partial failure midstream) are delegated to
 *    Express default handler to avoid crashing or double-sending.
 */

const SAFE_ERROR_MESSAGES = new Set(['Internal server error']);

function isSafeErrorMessage(message: unknown): message is string {
  return typeof message === 'string' && SAFE_ERROR_MESSAGES.has(message);
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void | Response => {
  const error = err instanceof Error ? err : new Error('Internal server error');

  if (res.headersSent) {
    logger.error('Error occurred after response headers were sent:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
    return next(error);
  }

  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  if (error instanceof ApiError) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message =
      isSafeErrorMessage(error.message) || error.message === ''
        ? error.message
        : 'Internal server error';

    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};

export default errorHandler;
