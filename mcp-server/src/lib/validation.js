/**
 * Shared input validation helpers for the MCP server.
 */

export const TOKEN_MAX_LENGTH = 4096;

export const isValidToken = (token) => {
  if (typeof token !== 'string') return false;
  const t = token.trim().replace(/^Bearer\s+/i, '');
  return t.length >= 20 && t.length <= TOKEN_MAX_LENGTH && !/[\r\n\s]/.test(t);
};

export const toBearerToken = (token) => {
  if (typeof token !== 'string') return '';
  return token.trim().replace(/^Bearer\s+/i, '');
};

export const sanitizeLimit = (value, fallback = 50, max = 100) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

export const sanitizeOffset = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
};

export const isValidDateParam = (value) => {
  if (!value || typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + 'T12:00:00').getTime());
};
