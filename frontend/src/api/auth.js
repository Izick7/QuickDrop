import { request } from './client';
export const login = (body) => request('/auth/login', { method: 'POST', body, auth: false });
export const register = (body) => request('/auth/register', { method: 'POST', body, auth: false });
export const me = () => request('/auth/me');
