import { csrfToken, state } from './state-store.js';

// HTTP client for the local API.
// ApiError and ApiUnavailableError must exist exactly once: six instanceof
// checks decide whether a failure falls back to demo mode or re-prompts login,
// and a duplicated class would make every one of them false.
// csrfToken is read per request, never captured at module scope, so the token
// set at login reaches the next mutating request.
export class ApiError extends Error {
  constructor(message, status = 0, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class ApiUnavailableError extends Error {
  constructor(message = 'API lokal tidak tersedia.') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

export async function apiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const init = { method, headers, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (!['GET', 'HEAD'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response;
  try {
    response = await fetch(path, init);
  } catch (_) {
    throw new ApiUnavailableError();
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError(`Respons layanan tidak dapat dibaca (HTTP ${response.status}). Coba lagi.`, response.status, 'invalid_response');
    throw new ApiUnavailableError('Server aktif, tetapi endpoint API belum tersedia.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new ApiError(`Respons layanan tidak dapat dibaca (HTTP ${response.status}). Coba lagi.`, response.status, 'invalid_response');
  }

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(error.message || 'Permintaan API gagal.', response.status, error.code);
  }
  return payload;
}
