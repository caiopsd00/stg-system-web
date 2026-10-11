import assert from "node:assert/strict";
import { test } from "node:test";
import { createId } from "../src/brlift/id.ts";

test("createId generates distinct version 4 UUIDs without randomUUID", () => {
  const ids = Array.from({ length: 100 }, createId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
});
