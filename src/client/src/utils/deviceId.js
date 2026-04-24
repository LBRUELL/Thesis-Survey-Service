// Returns a stable per-browser device ID stored in localStorage.
// Sent as X-Device-Id header with every generation request.
export function getDeviceId() {
  const KEY = "forma_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
