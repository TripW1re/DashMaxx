import { format, formatDistanceToNow, parseISO } from 'date-fns';

export const formatCurrency = (amount) => {
  if (amount == null) return '$0.00';
  return '$' + Number(amount).toFixed(2);
};

// Parse a date-only string (YYYY-MM-DD) as LOCAL time. Using `new Date(str)`
// treats it as UTC midnight and shifts the day in timezones west of UTC.
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr === 'string' && dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return parseISO(dateStr);
  }
  return new Date(dateStr);
};

export const formatDate = (dateStr) => {
  const d = parseLocalDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  return format(d, 'MMM d');
};

export const formatDateFull = (dateStr) => {
  const d = parseLocalDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  return format(d, 'MMM d, yyyy');
};

export const timeAgo = (timestamp) => {
  if (!timestamp) return '';
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

export const today = () => format(new Date(), 'yyyy-MM-dd');

export const daysSince = (timestamp) => {
  const now = Date.now();
  const diff = now - (typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime());
  return Math.floor(diff / 86400000);
};
