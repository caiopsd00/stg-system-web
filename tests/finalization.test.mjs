import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizationIssues } from "../src/brlift/form-validation.ts";
import { newReport, newDay } from "../src/contracts/domain.ts";

const base = (kind, payload) => ({
  id: "e",
  kind,
  number: "AT-1",
  date: "2026-10-10",
  clientId: "c",
  technicianId: "t",
  equipmentId: "eq",
  status: "draft",
  version: 0,
  createdAt: "",
  updatedAt: "",
  payload,
});

test("atendimento abre todos os caminhos inválidos e limpa cada campo corrigido", () => {
  const entry = base("reports", newReport());
  entry.number = "";
  entry.clientId = null;
  let issues = finalizationIssues(entry);
  assert.ok(issues.some((issue) => issue.key === "number"));
  assert.ok(
    issues.some((issue) => issue.key === "clientId" && issue.path[0] === "A"),
  );
  assert.ok(issues.some((issue) => issue.path[0] === "B"));
  assert.ok(issues.some((issue) => issue.path[0] === "C"));
  assert.ok(issues.some((issue) => issue.path[0] === "F"));
  entry.number = "AT-1";
  entry.clientId = "c";
  issues = finalizationIssues(entry);
  assert.ok(
    !issues.some((issue) => issue.key === "number" || issue.key === "clientId"),
  );
  entry.payload.equipment = {
    type: "Guindaste",
    brand: "B",
    model: "M",
    serial: "S",
  };
  entry.payload.reasons = [
    {
      id: "r",
      description: "Falha",
      pending: "",
      services: [{ id: "s", description: "Reparo", notes: "", photos: [] }],
    },
  ];
  Object.assign(entry.payload, {
    concluded: "Sim",
    released: "Sim",
    photosSent: "Não",
    technicianSignature: { uri: "a" },
    clientSignature: { uri: "b" },
  });
  assert.deepEqual(finalizationIssues(entry), []);
});

test("peça, profissional e cronograma recebem caminhos internos de erro", () => {
  const entry = base("reports", newReport());
  entry.payload.additionalTechnicians = [
    { technicianId: "", role: "auxiliary" },
  ];
  entry.payload.parts = [
    {
      id: "p",
      code: "",
      description: "",
      supplier: "",
      quantity: 0,
      kind: "requested",
      codeHistory: [],
    },
  ];
  const day = newDay("d");
  day.participants = [
    {
      technicianId: "t",
      present: true,
      odometerStart: "",
      odometerEnd: "",
      periods: [],
      sameHoursAs: null,
      sameVehicleAs: null,
    },
  ];
  entry.payload.days = [day];
  const issues = finalizationIssues(entry);
  assert.deepEqual(issues.find((issue) => issue.key === "team.1")?.path, [
    "A",
    "team",
    "tech-1",
  ]);
  assert.deepEqual(
    issues.find((issue) => issue.key === "part.p.quantity")?.path,
    ["D", "p"],
  );
  assert.deepEqual(issues.find((issue) => issue.key === "day.d.t")?.path, [
    "E",
    "d",
    "person-t",
  ]);
});

test("inspeção mostra item pendente e assinaturas separadas; resolução remove erros", () => {
  const payload = {
    documentFields: { "011": "" },
    sections: [{ id: "s", items: [{ id: "i", code: "01", situation: "" }] }],
    documentImages: {},
  };
  const entry = base("inspections", payload);
  let issues = finalizationIssues(entry);
  assert.deepEqual(issues.find((issue) => issue.key === "item.i")?.path, [
    "B",
    "s",
    "i",
  ]);
  assert.ok(issues.some((issue) => issue.key === "technicianSignature"));
  assert.ok(issues.some((issue) => issue.key === "clientSignature"));
  payload.documentFields["011"] = "Aprovada";
  payload.sections[0].items[0].situation = "A";
  payload.technicianSignature = { uri: "a" };
  payload.clientSignature = { uri: "b" };
  issues = finalizationIssues(entry);
  assert.deepEqual(issues, []);
});
