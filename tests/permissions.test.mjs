import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogActions } from "../src/brlift/catalog-permissions.ts";
import { recordVisibleToUser } from "../src/brlift/record-access.ts";
import { newReport } from "../src/contracts/domain.ts";

test("ADM mantém ações; técnico edita somente o cadastro permitido e nunca exclui", () => {
  for (const kind of [
    "clients",
    "vehicles",
    "equipment",
    "parts",
    "rentalCompanies",
  ]) {
    const latest = {
      id: "latest",
      permissions: { edit: true, archive: false },
    };
    const old = { id: "old", permissions: { edit: false, archive: false } };
    for (const role of ["admin", "technician_admin"])
      assert.deepEqual(catalogActions(kind, role, old), {
        create: true,
        edit: true,
        archive: true,
      });
    assert.deepEqual(catalogActions(kind, "technician", latest), {
      create: true,
      edit: true,
      archive: false,
    });
    assert.deepEqual(catalogActions(kind, "technician", old), {
      create: true,
      edit: false,
      archive: false,
    });
    assert.equal(
      catalogActions(kind, "technician", { id: "legacy" }).edit,
      false,
    );
    assert.equal(catalogActions(kind, "technician").edit, false);
  }
});

test("seletores de técnicos não têm ações de cadastro, independentemente do perfil", () => {
  for (const role of ["admin", "technician_admin", "technician", undefined])
    assert.deepEqual(
      catalogActions("technicians", role, {
        permissions: { edit: true, archive: true },
      }),
      { create: false, edit: false, archive: false },
    );
});

test("registro delegado sai do editor; equipe e aprovador mantêm acesso", () => {
  const user = { id: "u", role: "technician" };
  const technicians = [{ id: "t", data: { userId: "u" } }];
  const entry = {
    kind: "reports",
    technicianId: "other",
    payload: newReport(),
  };
  assert.equal(recordVisibleToUser(entry, user, technicians), false);
  entry.payload.additionalTechnicians = [
    { technicianId: "t", role: "auxiliary" },
  ];
  assert.equal(recordVisibleToUser(entry, user, technicians), true);
  const inspection = {
    kind: "inspections",
    technicianId: "other",
    payload: { approvedByTechnicianId: "t" },
  };
  assert.equal(recordVisibleToUser(inspection, user, technicians), true);
  inspection.payload.approvedByTechnicianId = null;
  assert.equal(recordVisibleToUser(inspection, user, technicians), false);
  for (const role of ["admin", "technician_admin"])
    assert.equal(recordVisibleToUser(entry, { id: "admin", role }, []), true);
});

test("somente o autor vê a cópia de trabalho sem equipe", () => {
  const author = { id: "owner", role: "technician" };
  const technicians = [{ id: "own-tech", data: { userId: author.id } }, { id: "other-tech", data: { userId: "other" } }];
  const entry = { kind: "reports", status: "draft", draftAuthorId: author.id, serverTechnicianIds: [], payload: newReport() };
  assert.equal(recordVisibleToUser(entry, author, technicians), true);
  assert.equal(recordVisibleToUser(entry, { ...author, id: "other" }, technicians), false);
  assert.equal(recordVisibleToUser({ ...entry, serverTechnicianIds: ["other-tech"] }, author, technicians), false);
  assert.equal(recordVisibleToUser({ ...entry, status: "finalized" }, author, technicians), false);
});
