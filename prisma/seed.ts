import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  const customerPassword = await bcrypt.hash("customer123", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      id: "admin-1",
      username: "admin",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { username: "customer" },
    update: {},
    create: {
      id: "customer-1",
      username: "customer",
      passwordHash: customerPassword,
      role: "CUSTOMER",
    },
  });

  console.log("Seeded users: admin/admin123, customer/customer123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
