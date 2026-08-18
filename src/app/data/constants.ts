export const STORAGE_KEY = 'inspec360_v3_data';
export const TOKEN_KEY = 'inspec360_token';
export const DEVICE_ID_KEY = 'inspec360_device_id';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
