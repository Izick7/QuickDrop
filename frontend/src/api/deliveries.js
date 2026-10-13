import { request } from './client';
export const deliveries = (query) => request('/deliveries', { query });
export const delivery = (id) => request(`/deliveries/${id}`);
export const createDelivery = (body) => request('/deliveries', { method: 'POST', body });
export const updateDelivery = (id, body) => request(`/deliveries/${id}`, { method: 'PATCH', body });
export const cancelDelivery = (id, reason) => request(`/deliveries/${id}/cancel`, { method: 'POST', body: { reason } });
export const payDelivery = (id, method) => request(`/deliveries/${id}/payments`, { method: 'POST', body: { method } });
