const hasWeakPlaceholder = (value) => {
  const v = String(value || '').toLowerCase();
  return v.includes('replace_with') || v.includes('changeme') || v.includes('example');
};

const isStrongSecret = (value, minLength = 32) => {
  const v = String(value || '');
  return v.length >= minLength && !hasWeakPlaceholder(v);
};

export const validateSecurityConfiguration = () => {
  const issues = [];
  const env = String(process.env.NODE_ENV || 'development').toLowerCase();

  if (!isStrongSecret(process.env.JWT_SECRET, 32)) {
    issues.push('JWT_SECRET must be set to a strong secret with at least 32 characters.');
  }

  if (process.env.PUBLIC_API_KEY && !isStrongSecret(process.env.PUBLIC_API_KEY, 32)) {
    issues.push('PUBLIC_API_KEY must be at least 32 characters when configured.');
  }

  if (env === 'production') {
    if (String(process.env.COOKIE_SECURE || '').toLowerCase() !== 'true') {
      issues.push('COOKIE_SECURE must be true in production.');
    }

    if (String(process.env.CORS_ORIGINS || '').includes('*')) {
      issues.push('CORS_ORIGINS cannot include "*" in production.');
    }

    if (!isStrongSecret(process.env.AUDIT_LOG_SECRET, 32)) {
      issues.push('AUDIT_LOG_SECRET must be set to a strong secret with at least 32 characters in production.');
    }
  }

  if (issues.length) {
    const err = new Error(`Security configuration invalid: ${issues.join(' ')}`);
    err.status = 500;
    throw err;
  }
};
