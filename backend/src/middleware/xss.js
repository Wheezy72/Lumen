import xss from 'xss';

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
};

function sanitizeValue(value) {
  if (typeof value === 'string') return xss(value, xssOptions);
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map(sanitizeValue);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = sanitizeValue(v);
  }
  return out;
}

export const xssSanitizerMiddleware = (req, res, next) => {
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);
  next();
};
