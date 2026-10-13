import { request } from './client';
export const payments = (query) => request('/payments', { query });
