import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  // Map Joi validation errors to 400
  const isJoiError = err?.isJoi === true;
  const isMongooseValidation = err?.name === 'ValidationError';
  const isValidationError = isJoiError || isMongooseValidation;
  const status = isValidationError ? 400 : (err.status || 500);

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    status,
    path: req.originalUrl,
    method: req.method,
  });

  // For Joi errors, use the first human-readable detail message.
  // For everything else, use the error message directly.
  let message;
  if (isJoiError && err.details?.length) {
    message = err.details[0].message
      // Strip surrounding quotes Joi adds around field names
      .replace(/["']/g, '')
      // Capitalise first letter
      .replace(/^./, (c) => c.toUpperCase());
  } else if (isMongooseValidation) {
    const firstKey = Object.keys(err.errors || {})[0];
    message = firstKey ? err.errors[firstKey].message : 'Validation failed.';
  } else {
    message = err.message || 'Something went wrong. Please try again.';
  }

  res.status(status).json({
    error: message,
    details: isJoiError ? err.details?.map((d) => d.message) : undefined,
  });
};