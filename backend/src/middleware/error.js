import { logger } from '../utils/logger.js';

const isProd = process.env.NODE_ENV === 'production';

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
      : (isProd ? 'I ran into a server error while handling that request.' : (err.message || 'Server error.')),
    details: isValidationError ? err.details?.map(d => d.message) : undefined,
  });
};