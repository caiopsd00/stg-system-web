import test from "node:test";
import assert from "node:assert/strict";
import { createRecordOutbox } from "../src/brlift/record-outbox.ts";

function setup(submit) {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    key: (index) => [...data.keys()][index],
    get length() { return data.size; },
  };
  let scope = "production:person";
  let sequence = 0;
  const options = { storage: () => storage, scope: () => scope, id: () => String(++sequence), submit };
  return { queue: createRecordOutbox(options), reload: () => createRecordOutbox(options), scope: (next) => { scope = next; } };
}
const record = (fields = {}) => ({ id: "r1", kind: "reports", number: "55", version: 0, status: "draft", payload: { notes: "antigas" }, ...fields });
const versionConflict = () => Object.assign(Error("Conflito: existe uma edição mais recente no servidor. Seus dados locais foram preservados."), { status: 409 });

test("guarda offline e repete a mesma mutação após confirmar por outra requisição", async () => {
  const attempts = [];
  const { queue, reload } = setup(async (entry, id) => {
    attempts.push({ entry, id });
    if (attempts.length === 1) throw Error("não chegou a resposta");
    return { ...entry, version: entry.version + 1 };
  });
  const previous = record();
  assert.deepEqual(await queue.save(previous), {});
  assert.deepEqual(reload().pending(), [previous]);
  const next = record({ payload: { notes: "novas" } });
  const { item } = await reload().save(next);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(attempts[2].entry.version, 1);
  assert.equal(item.payload.notes, "novas");
  assert.deepEqual(queue.pending(), []);
});

test("conflito não troca a versão-base e mantém a cópia da conta certa", async () => {
  let requests = 0;
  const { queue, scope, reload } = setup(async () => {
    requests++;
    throw versionConflict();
  });
  const entry = record({ version: 5 });
  const result = await queue.save(entry);
  assert.match(result.reason, /versão mais recente/);
  assert.deepEqual(result.conflict.entry, entry);
  assert.deepEqual(reload().pending(), [], "A cópia bloqueada não encobre a versão do servidor na lista");
  await queue.flush();
  assert.equal(requests, 1);
  scope("production:other");
  assert.deepEqual(queue.conflicts(), []);
  await queue.flush();
  scope("development:person");
  assert.deepEqual(queue.conflicts(), []);
  scope("production:person");
  assert.deepEqual(queue.conflicts(), [result.conflict]);
  await assert.rejects(queue.save({ ...entry, version: 6 }), /não foi revisada/);
  assert.equal(requests, 1);
});

test("envia a cópia revisada somente com escolha explícita e não ignora um segundo conflito", async () => {
  const attempts = [];
  const { queue } = setup(async (entry, id) => {
    attempts.push({ id, version: entry.version });
    if (entry.version !== 7) throw versionConflict();
    return { ...entry, version: 8 };
  });
  const original = record({ version: 5 });
  const first = (await queue.save(original)).conflict;
  const next = (await queue.save({ ...original, version: 6 }, "draft", first.token)).conflict;
  assert.notEqual(next.token, first.token);
  assert.throws(() => queue.discardConflict(first), /A cópia mudou/);
  assert.equal((await queue.save({ ...original, version: 7 }, "draft", next.token)).item.version, 8);
  assert.deepEqual(attempts.map((attempt) => attempt.version), [5, 6, 7]);
  assert.deepEqual(queue.conflicts(), []);
});

test("manter a versão do servidor descarta a cópia escolhida sem enviar gravação", async () => {
  let requests = 0;
  const { queue } = setup(async () => { requests++; throw versionConflict(); });
  const { conflict } = await queue.save(record());
  queue.discardConflict(conflict);
  await queue.flush();
  assert.deepEqual(queue.conflicts(), []);
  assert.equal(requests, 1);
});

test("O.S. duplicada não é apresentada como conflito de edição", async () => {
  const { queue } = setup(async () => {
    throw Object.assign(Error("Número, documento ou código já cadastrado."), { status: 409 });
  });
  const entry = record();
  const result = await queue.save(entry);
  assert.match(result.reason, /já cadastrado/);
  assert.equal(result.conflict, undefined);
  assert.deepEqual(queue.pending(), [entry]);
});

test("mantém a intenção da mutação sem confundir salvar versão com finalizar", async () => {
  const attempts = [];
  const { queue, reload } = setup(async (entry, id, intent) => {
    attempts.push({ id, intent, version: entry.version });
    if (attempts.length === 1) throw Error("resposta perdida");
    return { ...entry, version: entry.version + 1 };
  });
  const entry = record({ status: "finalized" });
  await queue.save(entry);
  await reload().save(entry, "finalize");
  assert.deepEqual(attempts.map(({ intent }) => intent), ["save", "save", "finalize"]);
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[2].version, 1);
});

test("sair do formulário guarda primeiro e envia o rascunho mesmo sem número", async () => {
  const attempts = [];
  const { queue } = setup(async (entry, _id, intent) => {
    attempts.push({ entry, intent });
    return { ...entry, version: 1 };
  });
  const entry = record({ number: "" });
  const task = queue.stage(entry);
  assert.deepEqual(queue.pending(), [entry]);
  assert.equal((await task).item.version, 1);
  assert.deepEqual(attempts, [{ entry, intent: "draft" }]);
  assert.equal(queue.pending().length, 0);
});

test("um erro numa ficha não impede o envio das demais", async () => {
  let online = false;
  const { queue } = setup(async (entry) => {
    if (!online) throw Error("offline");
    if (entry.id === "r1") throw versionConflict();
    return { ...entry, version: 1 };
  });
  await queue.save(record());
  await queue.save(record({ id: "r2", kind: "inspections" }));
  online = true;
  await queue.flush();
  assert.deepEqual(queue.pending(), []);
  assert.deepEqual(queue.conflicts().map(({ entry }) => entry.id), ["r1"]);
});
