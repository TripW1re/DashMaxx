import { formatCurrency, formatDate, formatDateFull, timeAgo, today, daysSince } from '../src/utils/format';

describe('formatCurrency', () => {
  it('formats numbers with two decimals', () => {
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(1234.567)).toBe('$1234.57');
  });

  it('handles null/undefined safely', () => {
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
  });
});

describe('formatDate', () => {
  it('formats ISO dates', () => {
    expect(formatDate('2026-06-15')).toBe('Jun 15');
  });

  it('returns empty for missing dates', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});

describe('formatDateFull', () => {
  it('includes the year', () => {
    expect(formatDateFull('2026-06-15')).toBe('Jun 15, 2026');
  });
});

describe('timeAgo', () => {
  it('describes recent timestamps', () => {
    const out = timeAgo(Date.now() - 60 * 1000);
    expect(out).toMatch(/minute|second/);
  });

  it('returns empty for missing timestamps', () => {
    expect(timeAgo(null)).toBe('');
  });
});

describe('today', () => {
  it('returns an ISO date string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysSince', () => {
  it('counts whole days since a timestamp', () => {
    expect(daysSince(Date.now())).toBe(0);
    expect(daysSince(Date.now() - 2 * 86400000)).toBe(2);
  });

  it('handles ISO strings', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(daysSince(twoDaysAgo)).toBe(2);
  });
});
