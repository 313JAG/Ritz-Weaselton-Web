import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { getCatalog } = require("../api/_lib/catalog")
const { DEFAULT_PRESETS, DEFAULT_RATE_PREFERENCES, RECOMMENDED_CODES } = require("../v2/lib/defaults")

const manualOnlyCodes = ["GOV", "AAA", "MMF"]

describe("default rate configuration", () => {
  it("excludes manual-only rates from every built-in preset and recommendation", () => {
    expect(DEFAULT_RATE_PREFERENCES.excludedFromDefaultPresetCodes).toEqual(manualOnlyCodes)

    for (const preset of DEFAULT_PRESETS) {
      expect(preset.codes).not.toEqual(expect.arrayContaining(manualOnlyCodes))
    }
    expect(RECOMMENDED_CODES).not.toEqual(expect.arrayContaining(manualOnlyCodes))
  })

  it("keeps manual-only rates in the catalog but out of generated presets", () => {
    const catalog = getCatalog()
    const catalogCodes = catalog.codes.map((entry) => entry.code)

    expect(catalogCodes).toEqual(expect.arrayContaining(manualOnlyCodes))
    for (const preset of catalog.presets) {
      expect(preset.codes).not.toEqual(expect.arrayContaining(manualOnlyCodes))
    }
  })
})
