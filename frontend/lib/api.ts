import { config } from './config';
import { supabase } from './supabase';
import type { Paper } from './types';

function connectionError() {
  return new Error(
    "Could not reach AutoCheck's checking service. Please ask the app administrator to check that the backend is configured and running.",
  );
}

export async function token() {
  const { data, error } = await supabase().auth.getSession();
  if (error || !data.session) throw new Error('Please sign in to continue.');
  return data.session.access_token;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const authorization = `Bearer ${await token()}`;
  const response = await fetch(config.apiUrl + path, {
    ...options,
    headers: { ...options.headers, Authorization: authorization },
    cache: 'no-store',
  }).catch(() => {
    throw connectionError();
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      typeof error?.detail === 'string'
        ? error.detail
        : 'The request failed. Please try again.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function upload(file: File, progress: (percent: number) => void) {
  const access = await token();
  return new Promise<{ paper: Paper; duplicate: boolean }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', config.apiUrl + '/papers');
      xhr.setRequestHeader('Authorization', `Bearer ${access}`);
      xhr.timeout = 180000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          progress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(
              new Error(
                'The upload response was incomplete. Refresh your papers before trying again.',
              ),
            );
          }
        } else {
          let message = 'Upload failed. Please try again.';
          try {
            message = JSON.parse(xhr.responseText).detail || message;
          } catch {
            // Preserve the actionable fallback if the server returned non-JSON.
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(connectionError());
      xhr.ontimeout = () =>
        reject(
          new Error('The server took too long to wake up. Please try again.'),
        );
      const body = new FormData();
      body.append('file', file);
      xhr.send(body);
    },
  );
}
