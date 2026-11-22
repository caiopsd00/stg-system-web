import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, periodSummary } from "../src/contracts/domain.ts";

test("durações usam horas e minutos, preservando segundos e totais longos", () => {
  for (const [minutes, expected] of [
    [0, "0h00min"],
    [5, "0h05min"],
    [60, "1h00min"],
    [90, "1h30min"],
    [360, "6h00min"],
    [780, "13h00min"],
    [1500, "25h00min"],
    [59.5, "0h59min 30s"],
  ])
    assert.equal(formatDuration(minutes), expected);
  for (const invalid of [-1, NaN, Infinity])
    assert.equal(formatDuration(invalid), "—");
  assert.equal(
    periodSummary({
      id: "work",
      kind: "work",
      start: "08:00",
      end: "11:00",
      pauseMinutes: "90",
      odometerStart: "100",
      odometerEnd: "110",
    }),
    "1h30min líquidos · 10 km",
  );
});
