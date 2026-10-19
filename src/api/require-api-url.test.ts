import { describe, expect, it } from "vitest"
import { productionApiUrlProblem } from "./require-api-url"

describe("production API URL", () => {
  it("fails a production build when VITE_API_URL is unset", () => {
    expect(productionApiUrlProblem("production", undefined)).toMatch(/VITE_API_URL is required/)
    expect(productionApiUrlProblem("production", "   ")).toMatch(/VITE_API_URL is required/)
  })

  it("allows dev without the variable and production with one", () => {
    expect(productionApiUrlProblem("development", undefined)).toBeNull()
    expect(productionApiUrlProblem("test", undefined)).toBeNull()
    expect(productionApiUrlProblem("production", "https://api.example.com/api/v1")).toBeNull()
  })
})
