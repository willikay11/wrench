// apps/web/src/lib/schemas/auth.test.ts
import { describe, it, expect } from "vitest"
import { signupSchema } from "./auth"

// ── Helper ─────────────────────────────────────────────────────────────────
// Valid base data we can spread and override per test
const valid = {
  displayName: "Will Kamau",
  email: "will@wrench.app",
  password: "Wrench123",
  confirmPassword: "Wrench123",
  region: "Nairobi, Kenya",
}

// Helper that parses and returns the first error message for a given field
function getError(data: object, field: string): string | undefined {
  const result = signupSchema.safeParse(data)
  if (result.success) return undefined
  return result.error.issues.find((i) => i.path[0] === field)?.message
}

// ── Valid data ─────────────────────────────────────────────────────────────
describe("signupSchema — valid data", () => {
  it("passes with all valid fields", () => {
    const result = signupSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("passes with a 2-character display name", () => {
    const result = signupSchema.safeParse({ ...valid, displayName: "Jo" })
    expect(result.success).toBe(true)
  })

  it("passes with a 50-character display name", () => {
    const result = signupSchema.safeParse({
      ...valid,
      displayName: "A".repeat(50),
    })
    expect(result.success).toBe(true)
  })
})

// ── displayName ────────────────────────────────────────────────────────────
describe("signupSchema — displayName", () => {
  it("fails when display name is empty", () => {
    const error = getError({ ...valid, displayName: "" }, "displayName")
    expect(error).toBeDefined()
  })

  it("fails when display name is 1 character", () => {
    const error = getError({ ...valid, displayName: "W" }, "displayName")
    expect(error).toBe("Name must be at least 2 characters")
  })

  it("fails when display name exceeds 50 characters", () => {
    const error = getError(
      { ...valid, displayName: "A".repeat(51) },
      "displayName"
    )
    expect(error).toBe("Name must be under 50 characters")
  })
})

// ── email ──────────────────────────────────────────────────────────────────
describe("signupSchema — email", () => {
  it("fails when email is empty", () => {
    const error = getError({ ...valid, email: "" }, "email")
    expect(error).toBeDefined()
  })

  it("fails when email has no @ symbol", () => {
    const error = getError({ ...valid, email: "notanemail" }, "email")
    expect(error).toBe("Please enter a valid email address")
  })

  it("fails when email has no domain", () => {
    const error = getError({ ...valid, email: "will@" }, "email")
    expect(error).toBe("Please enter a valid email address")
  })

  it("fails when email has no TLD", () => {
    const error = getError({ ...valid, email: "will@wrench" }, "email")
    expect(error).toBe("Please enter a valid email address")
  })

  it("passes with a valid email", () => {
    const error = getError({ ...valid, email: "will@wrench.app" }, "email")
    expect(error).toBeUndefined()
  })
})

// ── password ───────────────────────────────────────────────────────────────
describe("signupSchema — password", () => {
  it("fails when password is empty", () => {
    const error = getError(
      { ...valid, password: "", confirmPassword: "" },
      "password"
    )
    expect(error).toBeDefined()
  })

  it("fails when password is under 8 characters", () => {
    const error = getError(
      { ...valid, password: "Ab1", confirmPassword: "Ab1" },
      "password"
    )
    expect(error).toBe("Password must be at least 8 characters")
  })

  it("fails when password has no uppercase letter", () => {
    const error = getError(
      { ...valid, password: "wrench123", confirmPassword: "wrench123" },
      "password"
    )
    expect(error).toBe("Must contain at least one uppercase letter")
  })

  it("fails when password has no number", () => {
    const error = getError(
      { ...valid, password: "WrenchApp", confirmPassword: "WrenchApp" },
      "password"
    )
    expect(error).toBe("Must contain at least one number")
  })

  it("passes with 8 chars, one uppercase, one number", () => {
    const error = getError(
      { ...valid, password: "Wrench12", confirmPassword: "Wrench12" },
      "password"
    )
    expect(error).toBeUndefined()
  })
})

// ── confirmPassword ────────────────────────────────────────────────────────
describe("signupSchema — confirmPassword", () => {
  it("fails when passwords do not match", () => {
    const error = getError(
      { ...valid, confirmPassword: "Different1" },
      "confirmPassword"
    )
    expect(error).toBe("Passwords do not match")
  })

  it("passes when passwords match exactly", () => {
    const error = getError(
      { ...valid, confirmPassword: valid.password },
      "confirmPassword"
    )
    expect(error).toBeUndefined()
  })

  it("fails when confirmPassword is empty but password is valid", () => {
    const error = getError(
      { ...valid, confirmPassword: "" },
      "confirmPassword"
    )
    expect(error).toBe("Passwords do not match")
  })
})

// ── region ─────────────────────────────────────────────────────────────────
describe("signupSchema — region", () => {
  it("fails when region is empty", () => {
    const error = getError({ ...valid, region: "" }, "region")
    expect(error).toBeDefined()
  })

  it("fails when region is 1 character", () => {
    const error = getError({ ...valid, region: "K" }, "region")
    expect(error).toBe("Please enter your region")
  })

  it("passes with 2 or more characters", () => {
    const error = getError({ ...valid, region: "KE" }, "region")
    expect(error).toBeUndefined()
  })
})

// ── all fields empty ───────────────────────────────────────────────────────
describe("signupSchema — empty form submission", () => {
  it("fails on all required fields when form is empty", () => {
    const result = signupSchema.safeParse({
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      region: "",
    })
    expect(result.success).toBe(false)

    const fields = result.error?.issues.map((i) => i.path[0])
    expect(fields).toContain("displayName")
    expect(fields).toContain("email")
    expect(fields).toContain("password")
    expect(fields).toContain("region")
  })
})