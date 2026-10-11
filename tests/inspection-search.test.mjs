import { test } from "node:test";
import assert from "node:assert/strict";
import { filterInspectionSections } from "../src/brlift/inspection-search.ts";

const sections = [
  {
    id: "first",
    name: "Documentação",
    items: [
      { id: "a", code: "015", name: "Registro diário", situation: "A" },
      { id: "b", code: "016", name: "Manual técnico", situation: "" },
    ],
  },
  {
    id: "second",
    name: "Mecânica",
    items: [{ id: "c", code: "020", name: "Eixos", situation: "" }],
  },
];

test("busca filtra por código e nome enquanto o usuário digita", () => {
  assert.deepEqual(
    filterInspectionSections(sections, "  MANUAL  ", false).map(
      ({ section, items }) => [section.id, items.map((item) => item.id)],
    ),
    [["first", ["b"]]],
  );
  assert.deepEqual(
    filterInspectionSections(sections, "020", false)[0].items.map(
      (item) => item.id,
    ),
    ["c"],
  );
  assert.deepEqual(
    filterInspectionSections(sections, "inexistente", false),
    [],
  );
});

test("somente pendentes combina com a busca sem depender da validação", () => {
  assert.deepEqual(filterInspectionSections(sections, "registro", true), []);
  assert.deepEqual(
    filterInspectionSections(sections, "", true).map(({ items }) =>
      items.map((item) => item.id),
    ),
    [["b"], ["c"]],
  );
});
