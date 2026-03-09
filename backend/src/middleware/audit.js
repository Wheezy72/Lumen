import AuditLog from '../models/AuditLog.js';

export function audit(action, metaBuilder) {
  return (req, res, next) => {
    res.on('finish', async () => {
      try {
        const userId = req.user?.id;
        const meta = typeof metaBuilder === 'function' ? metaBuilder(req, res) : undefined;
        await AuditLog.create({
          userId,
          action,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          meta,
        });
      } catch {
        // Audit log failures must not break requests.
      }
    });
    next();
  };
}
