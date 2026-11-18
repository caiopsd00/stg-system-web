// Reproduce the deployment worker's umask 077 without touching the real checkout.
// Uses only a disposable build context, image, container and loopback port.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const name = "brlift-web-smoke-" + crypto.randomUUID().slice(0, 8);
const context = await fs.mkdtemp(path.join(os.tmpdir(), name + "-"));
let imageBuilt = false;
let running = false;

async function restrictPermissions(directory) {
  await fs.chmod(directory, 0o700);
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) await restrictPermissions(target);
    else if (item.isFile()) await fs.chmod(target, 0o600);
    else throw Error("Unexpected non-regular build input: " + target);
  }
}

async function publicFiles(directory, prefix = "") {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isDirectory())
      files.push(
        ...(await publicFiles(path.join(directory, item.name), relative)),
      );
    else if (item.isFile()) files.push(relative);
  }
  return files;
}

try {
  // Explicit allowlist: never include .env, Git, credentials or local data.
  for (const input of [
    "Dockerfile",
    ".dockerignore",
    "nginx.conf",
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.base.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "src",
    "public",
  ])
    await fs.cp(path.join(root, input), path.join(context, input), {
      recursive: true,
    });
  await restrictPermissions(context);
  console.log(
    "Testing production build from files 0600 / directories 0700 (umask 077).",
  );
  execFileSync("docker", ["build", "-t", name, context], {
    stdio: "inherit",
    timeout: 600_000,
  });
  imageBuilt = true;
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      name,
      "--memory",
      "128m",
      "-p",
      "127.0.0.1::8080",
      name,
    ],
    { stdio: "pipe" },
  );
  running = true;
  const address = execFileSync("docker", ["port", name, "8080"], {
    encoding: "utf8",
  }).trim();
  const base = "http://127.0.0.1:" + address.split(":").at(-1);
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) break;
    } catch {
      /* Wait for the temporary Nginx. */
    }
    if (attempt === 29) throw Error("Temporary Nginx did not start.");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const html = await (await fetch(base)).text();
  const bundle = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(bundle, "Built HTML must reference its JavaScript bundle.");
  assert.equal((await fetch(base + bundle)).status, 200);
  for (const file of await publicFiles(path.join(context, "public"))) {
    const response = await fetch(base + "/" + file);
    assert.equal(response.status, 200, file + " must be readable by Nginx.");
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await fs.readFile(path.join(context, "public", file)),
      file,
    );
    execFileSync(
      "docker",
      [
        "exec",
        "--user",
        "nginx",
        name,
        "test",
        "-r",
        "/usr/share/nginx/html/" + file,
      ],
      { stdio: "pipe" },
    );
    console.log("OK:", file);
  }
  console.log(
    "PASS: HTML, JavaScript, logos, icons and manifest readable after umask 077 checkout.",
  );
} finally {
  try {
    if (running) execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
  } finally {
    try {
      if (imageBuilt)
        execFileSync("docker", ["image", "rm", name], { stdio: "pipe" });
    } finally {
      await fs.rm(context, { recursive: true, force: true });
    }
  }
}
