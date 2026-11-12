import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForLabel, formatInput } from "../src/brlift/input-format.ts";

test("CPF e CNPJ aplicam a máscara progressivamente e aceitam colagem", () => {
  assert.equal(formatInput("1234", "cpf"), "123.4");
  assert.equal(formatInput("123.456.789-00", "cpf"), "123.456.789-00");
  assert.equal(formatInput("12345678000195", "cnpj"), "12.345.678/0001-95");
  assert.equal(formatInput("12abc34501de35", "cnpj"), "12.ABC.345/01DE-35");
  assert.equal(formatInput("", "cpf"), "");
  assert.equal(formatForLabel("CPF do técnico"), "cpf");
  assert.equal(formatForLabel("CNPJ do cliente"), "cnpj");
});

test("telefone usa DDD e número local, ou considera DDI quando informado", () => {
  assert.equal(formatInput("11987654321", "phone"), "(11) 98765-4321");
  assert.equal(formatInput("1133334444", "phone"), "(11) 3333-4444");
  assert.equal(formatInput("5511987654321", "phone"), "+55 (11) 98765-4321");
  assert.equal(formatInput("+55", "phone"), "+55");
  assert.equal(formatInput("+12125550123", "phone"), "+1 2125550123");
  assert.equal(formatForLabel("Telefone comercial"), "phone");
  assert.equal(formatForLabel("E-mail"), undefined);
});
