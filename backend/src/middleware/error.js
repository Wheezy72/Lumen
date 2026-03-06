import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  // Map Joi validation errors to 400
  const isValidationError = err?.isJoi || err?.name === 'ValidationError';
  const status = isValidationError ? 400 : (err.status || 500);

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    status,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(status).json({
    error: isValidationError
      ? 'I could not make sense of that request.'
      : (err.message || 'I ran into a server error while handling that request.'),
    details: isValidationError ? err.details?.map(d => d.message) : undefined,
  });
};