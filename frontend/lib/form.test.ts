import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parseDecimal, safeRedirect } from "./form.ts"

// The login page passes ?redirect= through safeRedirect, then hands the result to
// redirect() on the server and router.replace() in the browser. Both resolve it the
// way a browser resolves a Location header, so every case below is checked against
// that resolution as well as against the expected string.
const APP = "http://app.test"
const staysOnSite = (target: string) => new URL(target, APP).origin === APP

describe("safeRedirect", () => {
  const rejected: Record<string, string> = {
    "tab after the first slash (?redirect=/%09/evil)": "/\t/evil.example",
    "newline after the first slash": "/\n/evil.example",
    "carriage return after the first slash": "/\r/evil.example",
    "protocol-relative URL": "//evil.example",
    "backslash read as a slash": "/\\evil.example",
    "backslash later in the path": "/dashboard\\..\\\\evil.example",
    "absolute https URL": "https://evil.example/dashboard",
    "javascript: URL": "javascript:alert(1)",
    "dot segment that normalises to //": "/..//evil.example",
    "single dot segment that normalises to //": "/.//evil.example",
    "relative path": "dashboard",
    "empty string": "",
  }

  for (const [name, target] of Object.entries(rejected)) {
    test(`rejects ${name}`, () => {
      assert.equal(safeRedirect(target), "/dashboard")
    })
  }

  test("falls back when the parameter is missing", () => {
    assert.equal(safeRedirect(undefined), "/dashboard")
    assert.equal(safeRedirect(undefined, "/login"), "/login")
  })

  test("keeps an encoded control character as an inert same-site path", () => {
    // The raw query value "%09" (not the decoded tab) is never decoded again by
    // the browser, so it stays a path on this site.
    const result = safeRedirect("/%09/evil.example")
    assert.equal(result, "/%09/evil.example")
    assert.ok(staysOnSite(result))
  })

  test("keeps same-site paths with their query and hash", () => {
    assert.equal(safeRedirect("/dashboard"), "/dashboard")
    assert.equal(
      safeRedirect("/dashboard/control?device=AQS-KOLAM-01"),
      "/dashboard/control?device=AQS-KOLAM-01",
    )
    assert.equal(
      safeRedirect("/dashboard/reports?device_id=A&date=2026-09-20&period=week#observasi"),
      "/dashboard/reports?device_id=A&date=2026-09-20&period=week#observasi",
    )
  })

  test("returns the normalised path, not the raw parameter", () => {
    assert.equal(safeRedirect("/dashboard/../dashboard/settings"), "/dashboard/settings")
  })

  test("never returns a target that leaves the site", () => {
    for (const target of [...Object.values(rejected), "/dashboard?next=//evil.example"]) {
      assert.ok(staysOnSite(safeRedirect(target)), target)
    }
  })
})

describe("parseDecimal", () => {
  test("an empty field means not measured", () => {
    assert.equal(parseDecimal(""), null)
    assert.equal(parseDecimal("   "), null)
    assert.equal(parseDecimal(null), null)
  })

  test("accepts a decimal comma and a decimal point", () => {
    assert.equal(parseDecimal("12,5"), 12.5)
    assert.equal(parseDecimal("12.5"), 12.5)
    assert.equal(parseDecimal(" 7 "), 7)
    assert.equal(parseDecimal("-2,5"), -2.5)
  })

  test("text that is not a number is NaN, never null", () => {
    for (const value of ["1e", "abc", "1.234,5", "12,", ",5", "1e3", "Infinity"]) {
      assert.ok(Number.isNaN(parseDecimal(value)), value)
    }
  })
})
