/**
 * Production builds must be told where the API is. Dev keeps a localhost
 * default in the client; that default is not a production value.
 */
export function productionApiUrlProblem(mode: string, value: string | undefined): string | null {
  if (mode !== "production") return null
  if (typeof value === "string" && value.trim()) return null
  return "VITE_API_URL is required for a production frontend build. Set it to the public API base URL. Dev may keep the localhost default; vite build will not."
}

export const LOCALHOST_API_URL = "http://localhost:3000/api/v1"
