export const money = (amount) => new Intl.NumberFormat('en-CM', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(Number(amount || 0));
export const dateTime = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '-';
export const titleCase = (value = '') => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const listData = (result) => Array.isArray(result) ? result : result?.items || [];
