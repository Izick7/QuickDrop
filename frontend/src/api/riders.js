import { request } from './client';
export const riderProfile = () => request('/rider/profile');
export const setAvailability = (availability) => request('/rider/availability', { method: 'PATCH', body: { availability } });
export const riderDeliveries = (query) => request('/rider/deliveries', { query });
export const availableDeliveries = (query) => request('/rider/deliveries/available', { query });
export const riderDelivery = (id) => request(`/rider/deliveries/${id}`);
export const acceptDelivery = (id) => request(`/rider/deliveries/${id}/accept`, { method: 'POST' });
export const updateDeliveryStatus = (id, status, note) => request(`/rider/deliveries/${id}/status`, { method: 'PATCH', body: { status, ...(note ? { note } : {}) } });
