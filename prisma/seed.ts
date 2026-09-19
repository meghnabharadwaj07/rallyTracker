import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const customerPassword = process.env.CUSTOMER_INITIAL_PASSWORD;
  if (!adminPassword || !customerPassword) throw new Error("Set ADMIN_INITIAL_PASSWORD and CUSTOMER_INITIAL_PASSWORD before running the seed.");

  await prisma.user.upsert({ where: { username: "admin" }, update: { passwordHash: await bcrypt.hash(adminPassword, 10) }, create: { id: "admin-1", username: "admin", passwordHash: await bcrypt.hash(adminPassword, 10), role: "ADMIN" } });
  await prisma.user.upsert({ where: { username: "customer" }, update: { passwordHash: await bcrypt.hash(customerPassword, 10) }, create: { id: "customer-1", username: "customer", passwordHash: await bcrypt.hash(customerPassword, 10), role: "CUSTOMER" } });
  console.log("Seeded admin and customer users.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
