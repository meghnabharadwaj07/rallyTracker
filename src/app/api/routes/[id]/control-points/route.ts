import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createControlPointSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rangeMeters: z.number().positive(),
  bearingDegrees: z
    .number()
    .finite()
    .transform((n) => {
      const r = n % 360;
      return r < 0 ? r + 360 : r;
    })
    .optional(),
  order: z.number().int().min(0),
  isStart: z.boolean().optional(),
  isFinish: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: routeId } = await params;
  const body = await request.json();
  const parsed = createControlPointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  if (parsed.data.isStart) {
    await prisma.controlPoint.updateMany({
      where: { routeId, isStart: true },
      data: { isStart: false },
    });
  }

  if (parsed.data.isFinish) {
    await prisma.controlPoint.updateMany({
      where: { routeId, isFinish: true },
      data: { isFinish: false },
    });
  }

  const data = { ...parsed.data, routeId };
  if (data.isStart) data.isFinish = false;
  if (data.isFinish) data.isStart = false;

  const controlPoint = await prisma.controlPoint.create({
    data,
  });

  return NextResponse.json(controlPoint, { status: 201 });
}
