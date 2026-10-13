const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
let tokenReader = () => null;
let unauthorizedHandler = () => {};
export const setTokenReader = (reader) => { tokenReader = reader; };
export const setUnauthorizedHandler = (handler) => { unauthorizedHandler = handler; };

export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    const details = (errors || []).map(({ field, message: detail }) => `${field ? `${field}: ` : ''}${detail}`).join('; ');
    super(details ? `${message}: ${details}` : message);
    this.name = 'ApiError'; this.status = status; this.errors = errors || [];
  }
}

export async function request(path, { method = 'GET', body, query, auth = true } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => { if (value !== undefined && value !== '') url.searchParams.set(key, value); });
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth && tokenReader();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try { response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (error) { throw new ApiError('Could not reach QuickDrop. Check that the API server is running and try again.'); }
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    if (response.status === 401 && auth && token) unauthorizedHandler();
    throw new ApiError(payload?.message || `Request failed (${response.status})`, { status: response.status, errors: payload?.errors });
  }
  return payload?.data ?? null;
}
