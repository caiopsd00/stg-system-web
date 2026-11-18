import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

test("marca inclui favicon vetorial, atalhos com margem segura e metadados públicos sem dados de usuários", async () => {
  const html = await fs.readFile("index.html", "utf8");
  assert.match(
    html,
    /rel="icon" type="image\/svg\+xml" href="\/brand\/favicon.svg"/,
  );
  assert.match(html, /rel="apple-touch-icon"/);
  const manifest = JSON.parse(
    await fs.readFile("public/site.webmanifest", "utf8"),
  );
  assert.equal(manifest.short_name, "BR LIFT");
  for (const icon of manifest.icons) {
    const bytes = await fs.readFile("public" + icon.src);
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  for (const variant of ["ink", "lime", "white"]) {
    const svg = await fs.readFile(`public/brand/brlift-${variant}.svg`, "utf8");
    assert.match(svg, /viewBox="12 34 199 157"/);
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<text|<script|http[^"\s]*\.(?:png|jpg)/);
  }
});
