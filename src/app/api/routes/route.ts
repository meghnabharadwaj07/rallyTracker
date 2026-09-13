import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routes = await prisma.route.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { controlPoints: true } } },
  });

  return NextResponse.json(routes);
}

const createRouteSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const route = await prisma.route.create({
    data: { name: parsed.data.name },
  });

  return NextResponse.json(route, { status: 201 });
}
