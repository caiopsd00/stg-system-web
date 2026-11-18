import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCatalogOptions } from "../src/brlift/catalog-search.ts";
test("catálogos filtram localmente, ignoram caixa/acentos e combinam termos e documentos", () => {
  const items = [
    {
      value: "1",
      label: "JOÃO — 123.456.789-00",
      search: "12345678900 técnico",
    },
    { value: "2", label: "MODELO LTM - SER-99", search: "Liebherr guindaste" },
  ];
  assert.equal(filterCatalogOptions(items, "joao tecnico")[0].value, "1");
  assert.equal(filterCatalogOptions(items, "12345678900")[0].value, "1");
  assert.equal(filterCatalogOptions(items, "liebherr ser-99")[0].value, "2");
  assert.deepEqual(filterCatalogOptions(items, "ausente"), []);
  assert.equal(filterCatalogOptions(items, "").length, 2);
});
