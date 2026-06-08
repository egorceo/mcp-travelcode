import { describe, it, expect } from "vitest";
import { formatPreferences } from "../../src/formatters/preferences-formatter.js";
import type { TravelerPreferences } from "../../src/client/types.js";

const empty: TravelerPreferences = {
  flight: { seat: null, meal: null, carriers: [] },
  hotel: { roomType: null, smoking: null },
  special: { dietary: "", accessibility: [] },
};

describe("formatPreferences", () => {
  it("returns a clear message when nothing is set", () => {
    expect(formatPreferences(empty)).toBe("No travel preferences saved.");
  });

  it("formats and humanizes all fields", () => {
    const full: TravelerPreferences = {
      flight: { seat: "exit_row", meal: "gluten_free", carriers: ["LH", "TK"] },
      hotel: { roomType: "king", smoking: "non_smoking" },
      special: { dietary: "  no nuts ", accessibility: ["wheelchair", "service_animal"] },
    };
    expect(formatPreferences(full)).toBe(
      [
        "Flight seat: exit row",
        "Meal: gluten-free",
        "Preferred airlines: LH, TK",
        "Room type: king",
        "Smoking: non-smoking",
        "Dietary: no nuts",
        "Accessibility: wheelchair, service animal",
      ].join("\n"),
    );
  });

  it("emits only the fields that are set", () => {
    const partial: TravelerPreferences = {
      flight: { seat: "window", meal: null, carriers: [] },
      hotel: { roomType: null, smoking: null },
      special: { dietary: "low sodium", accessibility: [] },
    };
    expect(formatPreferences(partial)).toBe("Flight seat: window\nDietary: low sodium");
  });
});
