import { format, formatDistanceToNow } from 'date-fns';

export const formatCurrency = (amount) => {
  if (amount == null) return '$0.00';
  return '$' + Number(amount).toFixed(2);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return format(new Date(dateStr), 'MMM d');
};

export const formatDateFull = (dateStr) => {
  if (!dateStr) return '';
  return format(new Date(dateStr), 'MMM d, yyyy');
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
