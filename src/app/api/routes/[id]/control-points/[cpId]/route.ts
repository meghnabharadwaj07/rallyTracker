import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateControlPointSchema = z.object({
  name: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  rangeMeters: z.number().positive().optional(),
  bearingDegrees: z.number().finite().transform((n) => { const r = n % 360; return r < 0 ? r + 360 : r; }).optional(),
  order: z.number().int().min(0).optional(),
  isStart: z.boolean().optional(),
  isFinish: z.boolean().optional(),
});

async function getOwnedControlPoint(routeId: string, cpId: string) {
  return prisma.controlPoint.findFirst({ where: { id: cpId, routeId } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; cpId: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: routeId, cpId } = await params;
  const controlPoint = await getOwnedControlPoint(routeId, cpId);
  if (!controlPoint) return NextResponse.json({ error: "Control point not found" }, { status: 404 });

  const parsed = updateControlPointSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.isStart) {
    await prisma.controlPoint.updateMany({ where: { routeId, isStart: true, id: { not: cpId } }, data: { isStart: false } });
  }
  if (parsed.data.isFinish) {
    await prisma.controlPoint.updateMany({ where: { routeId, isFinish: true, id: { not: cpId } }, data: { isFinish: false } });
  }

  const data = { ...parsed.data };
  if (data.isStart) data.isFinish = false;
  if (data.isFinish) data.isStart = false;

  const updated = await prisma.controlPoint.update({ where: { id: controlPoint.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; cpId: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: routeId, cpId } = await params;
  const controlPoint = await getOwnedControlPoint(routeId, cpId);
  if (!controlPoint) return NextResponse.json({ error: "Control point not found" }, { status: 404 });

  await prisma.controlPoint.delete({ where: { id: controlPoint.id } });
  return NextResponse.json({ ok: true });
}
