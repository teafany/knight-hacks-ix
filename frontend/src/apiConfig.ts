
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "https://64.177.51.140/api"
).replace(/\/+$/, "");

export function apiURL(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}
