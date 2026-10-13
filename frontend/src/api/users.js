import { request } from './client';
export const updateMe = (body) => request('/users/me', { method: 'PATCH', body });
export const changePassword = (body) => request('/users/me/password', { method: 'PATCH', body });
