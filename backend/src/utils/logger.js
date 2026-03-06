import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
});

export const logRequest = (req, res, next) => {
  logger.info('HTTP request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  next();
};