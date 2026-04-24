// In production, set VITE_API_URL to your backend Railway URL,
// e.g. https://your-backend.railway.app
// In development, leave it unset — Vite's proxy handles /api/* automatically.
export const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";

export const apiUrl = (path) => `${API_BASE}${path}`;
