import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authentication verifies database password hashes instead of plaintext credentials", async () => {
  const source = await read("src/lib/auth.ts");

  assert.match(source, /prisma\.user\.findUnique/);
  assert.match(source, /bcrypt\.compare\(password, user\.passwordHash\)/);
  assert.doesNotMatch(source, /HARDCODED_USERS/);
  assert.doesNotMatch(source, /admin123|customer123/);
});

test("control-point mutations require the point to belong to the route", async () => {
  const source = await read("src/app/api/routes/[id]/control-points/[cpId]/route.ts");

  assert.match(source, /findFirst\(\{\s*where:\s*\{\s*id:\s*cpId,\s*routeId\s*\}/s);
  assert.match(source, /Control point not found/);
  assert.match(source, /controlPoint\.id/);
});

test("crossing creation handles a concurrent unique-key race", async () => {
  const source = await read("src/app/api/crossings/route.ts");

  assert.match(source, /prisma\.crossing\.create/);
  assert.match(source, /P2002/);
  assert.match(source, /prisma\.crossing\.findUnique/);
  assert.match(source, /status:\s*409/);
});

test("seed credentials must come from environment variables", async () => {
  const source = await read("prisma/seed.ts");

  assert.match(source, /process\.env\.ADMIN_INITIAL_PASSWORD/);
  assert.match(source, /process\.env\.CUSTOMER_INITIAL_PASSWORD/);
  assert.doesNotMatch(source, /hash\("admin123"/);
  assert.doesNotMatch(source, /hash\("customer123"/);
});
