import axios, { AxiosError } from 'axios';

/** Axios instance for the Express API. Cookies carry the session. */
export const api = axios.create({ baseURL: '/api', withCredentials: true });

export interface ApiErrorBody {
  error?: { code: string; message: string; details?: Record<string, string> };
}

/** Turns any thrown error into a message a person can read. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.code === 'ERR_NETWORK') return 'Cannot reach the server. Check your internet connection.';
    if (err.response?.status === 413) return 'File is too large';
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof AxiosError) return (err.response?.data as ApiErrorBody)?.error?.details ?? {};
  return {};
}

/** Builds multipart form data, skipping undefined/null values. */
export function toFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item as Blob | string));
    else if (v instanceof Blob) fd.append(k, v);
    else fd.append(k, String(v));
  }
  return fd;
}
