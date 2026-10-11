import { test } from "node:test";
import assert from "node:assert/strict";
import { dateISO, dateParts } from "../src/brlift/date-utils.ts";
test("data aceita ISO e formato brasileiro sem conversão de fuso", () => {
  assert.deepEqual(dateParts("2026-10-02"), ["02", "10", "2026"]);
  assert.equal(dateISO(dateParts("2/10/2026")), "2026-10-02");
  assert.equal(dateISO(["2", "1", "2026"]), "2026-01-02");
});
test("data rejeita valores incompletos e datas inexistentes", () => {
  for (const value of [["", "10", "2026"], ["31", "04", "2026"], ["29", "02", "2025"], ["02", "13", "2026"], ["02", "10", "26"]])
    assert.equal(dateISO(value), "");
  assert.equal(dateISO(["29", "02", "2024"]), "2024-02-29");
  assert.equal(dateISO(["29", "02", "1900"]), "");
  assert.equal(dateISO(["29", "02", "2000"]), "2000-02-29");
});
