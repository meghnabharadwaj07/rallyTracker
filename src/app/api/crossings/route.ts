import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pathCrossesGate } from "@/lib/geo";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const routeId = new URL(request.url).searchParams.get("routeId");
  if (!routeId) return NextResponse.json({ error: "routeId is required" }, { status: 400 });
  const crossings = await prisma.crossing.findMany({ where: { userId: session.user.id, routeId }, include: { controlPoint: true }, orderBy: { crossedAt: "asc" } });
  return NextResponse.json(crossings);
}

const createCrossingSchema = z.object({
  routeId: z.string().min(1), controlPointId: z.string().min(1),
  prevLat: z.number().min(-90).max(90), prevLng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  crossedAt: z.string().datetime().optional(),
});
const MAX_BACKDATE_MS = 6 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5000;

function resolveCrossedAt(supplied: string | undefined): Date | undefined {
  if (!supplied) return undefined;
  const at = new Date(supplied);
  if (Number.isNaN(at.getTime())) return undefined;
  const now = Date.now();
  if (at.getTime() > now + MAX_CLOCK_SKEW_MS || at.getTime() < now - MAX_BACKDATE_MS) return undefined;
  return at;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createCrossingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { routeId, controlPointId, prevLat, prevLng, lat, lng } = parsed.data;
  const crossedAt = resolveCrossedAt(parsed.data.crossedAt);
  const controlPoint = await prisma.controlPoint.findUnique({ where: { id: controlPointId } });
  if (!controlPoint || controlPoint.routeId !== routeId) return NextResponse.json({ error: "Control point not found" }, { status: 404 });

  const crossed = pathCrossesGate({ lat: prevLat, lng: prevLng }, { lat, lng }, { lat: controlPoint.lat, lng: controlPoint.lng, bearingDegrees: controlPoint.bearingDegrees, rangeMeters: controlPoint.rangeMeters });
  if (!crossed) return NextResponse.json({ error: "Path does not cross gate" }, { status: 422 });

  const existing = await prisma.crossing.findUnique({ where: { userId_routeId_controlPointId: { userId: session.user.id, routeId, controlPointId } }, include: { controlPoint: true } });
  if (existing) return NextResponse.json(existing);

  const bookendGates = await prisma.controlPoint.findMany({ where: { routeId, OR: [{ isStart: true }, { isFinish: true }] }, select: { id: true, isStart: true, isFinish: true } });
  const startGate = bookendGates.find((g) => g.isStart);
  const finishGate = bookendGates.find((g) => g.isFinish);
  const bookendCrossings = bookendGates.length ? await prisma.crossing.findMany({ where: { userId: session.user.id, routeId, controlPointId: { in: bookendGates.map((g) => g.id) } }, select: { controlPointId: true } }) : [];
  const alreadyCrossed = new Set(bookendCrossings.map((c) => c.controlPointId));
  if (startGate && !controlPoint.isStart && !alreadyCrossed.has(startGate.id)) return NextResponse.json({ error: "Must cross start gate first" }, { status: 422 });
  if (finishGate && alreadyCrossed.has(finishGate.id)) return NextResponse.json({ error: "Stage already finished — gates are closed" }, { status: 422 });

  try {
    const crossing = await prisma.crossing.create({ data: { userId: session.user.id, routeId, controlPointId, ...(crossedAt ? { crossedAt } : {}) }, include: { controlPoint: true } });
    return NextResponse.json(crossing, { status: 201 });
  } catch (error) {
    const isUniqueViolation = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (!isUniqueViolation) throw error;
    const crossing = await prisma.crossing.findUnique({ where: { userId_routeId_controlPointId: { userId: session.user.id, routeId, controlPointId } }, include: { controlPoint: true } });
    if (!crossing) return NextResponse.json({ error: "Crossing could not be recorded" }, { status: 409 });
    return NextResponse.json(crossing);
  }
}
