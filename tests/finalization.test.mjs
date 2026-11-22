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

test("fim anterior ao início aponta o campo final e limpa o erro ao corrigir, nos dois formulários", () => {
  for (const kind of ["reports", "inspections"]) {
    const period = {
      id: "work",
      kind: "work",
      start: "03:30",
      end: "01:00",
      pauseMinutes: "",
      odometerStart: "N/A",
      odometerEnd: "N/A",
    };
    const day = { ...newDay("d"), periods: [period] };
    const payload =
      kind === "reports"
        ? { ...newReport(), days: [day] }
        : { documentFields: {}, sections: [], documentImages: {}, days: [day] };
    const entry = base(kind, payload);
    const errors = () =>
      finalizationIssues(entry).filter((e) => e.key === "period.d.work.end");
    assert.match(errors()[0].message, /23:59/);
    period.end = "23:59";
    assert.deepEqual(errors(), []);
    assert.ok(!finalizationIssues(entry).some((e) => e.key === "day.d.totals"));
  }
});

test("continuidade de KM/horários aponta cada campo e limpa o erro após corrigir, nos dois formulários", () => {
  for (const kind of ["reports", "inspections"]) {
    const day = {
      ...newDay("d"),
      periods: [
        {
          id: "ida",
          kind: "outbound",
          start: "07:00",
          end: "08:00",
          pauseMinutes: "",
          odometerStart: "0",
          odometerEnd: "100",
        },
        {
          id: "trabalho",
          kind: "work",
          start: "07:59",
          end: "09:00",
          pauseMinutes: "",
          odometerStart: "5",
          odometerEnd: "110",
        },
      ],
    };
    const entry = base(
      kind,
      kind === "reports"
        ? { ...newReport(), formRevision: 2, days: [day] }
        : { documentFields: {}, sections: [], documentImages: {}, days: [day] },
    );
    const errors = () =>
      finalizationIssues(entry).filter((e) =>
        e.key.startsWith("period.d.trabalho."),
      );
    assert.ok(errors().some((e) => e.key.endsWith(".start")));
    assert.ok(errors().some((e) => e.key.endsWith(".odometerStart")));
    assert.ok(errors().every((e) => e.path.at(-1) === "trabalho"));
    day.periods[1].start = "08:00";
    day.periods[1].odometerStart = "100";
    assert.deepEqual(errors(), []);
  }
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

test("serviço pendente abre diretamente o motivo; corrigir limpa seus erros", () => {
  const entry = base("reports", newReport());
  entry.payload.formRevision = 2;
  entry.payload.reasons = [
    {
      id: "reason",
      description: "Falha",
      pending: "Revisar no próximo dia",
      services: [
        {
          id: "service",
          description: "",
          notes: "Observação mista",
          photos: [],
          completed: "",
        },
      ],
    },
  ];
  const errors = finalizationIssues(entry).filter((issue) =>
    issue.key.startsWith("service."),
  );
  assert.equal(errors.length, 2);
  for (const error of errors) assert.deepEqual(error.path, ["C", "reason"]);
  Object.assign(entry.payload.reasons[0].services[0], {
    description: "Serviço ajustado",
    completed: "Sim",
  });
  assert.ok(
    !finalizationIssues(entry).some((issue) =>
      issue.key.startsWith("service."),
    ),
  );
});

test("motivo e serviço têm erros independentes no mesmo bloco, inclusive em registros antigos", () => {
  for (const formRevision of [undefined, 2]) {
    const entry = base("reports", { ...newReport(), formRevision });
    const reason = {
      id: "r",
      description: "",
      pending: "",
      services: [
        {
          id: "s",
          description: "Reparo antigo",
          notes: "",
          photos: [],
          completed: "Sim",
        },
      ],
    };
    entry.payload.reasons = [reason];
    const errors = () =>
      finalizationIssues(entry).filter(
        (issue) => issue.key === "reason.r" || issue.key === "service.s",
      );
    assert.deepEqual(
      errors().map((issue) => issue.key),
      ["reason.r"],
    );
    assert.deepEqual(errors()[0].path, ["C", "r"]);
    reason.description = "Falha antiga com acentuação";
    assert.deepEqual(errors(), []);
    reason.services[0].description = "";
    assert.deepEqual(
      errors().map((issue) => issue.key),
      ["service.s"],
    );
    assert.equal(reason.description, "Falha antiga com acentuação");
    reason.services[0].description = "Reparo ajustado";
    assert.deepEqual(errors(), []);
  }
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
