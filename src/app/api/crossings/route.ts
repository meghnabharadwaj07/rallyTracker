import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pathCrossesGate } from "@/lib/geo";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const routeId = searchParams.get("routeId");
  if (!routeId) {
    return NextResponse.json({ error: "routeId is required" }, { status: 400 });
  }

  const crossings = await prisma.crossing.findMany({
    where: { userId: session.user.id, routeId },
    include: { controlPoint: true },
    orderBy: { crossedAt: "asc" },
  });

  return NextResponse.json(crossings);
}

const createCrossingSchema = z.object({
  routeId: z.string().min(1),
  controlPointId: z.string().min(1),
  prevLat: z.number().min(-90).max(90),
  prevLng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createCrossingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { routeId, controlPointId, prevLat, prevLng, lat, lng } = parsed.data;

  const controlPoint = await prisma.controlPoint.findUnique({
    where: { id: controlPointId },
  });

  if (!controlPoint || controlPoint.routeId !== routeId) {
    return NextResponse.json({ error: "Control point not found" }, { status: 404 });
  }

  const crossed = pathCrossesGate(
    { lat: prevLat, lng: prevLng },
    { lat, lng },
    {
      lat: controlPoint.lat,
      lng: controlPoint.lng,
      bearingDegrees: controlPoint.bearingDegrees,
      rangeMeters: controlPoint.rangeMeters,
    },
  );

  if (!crossed) {
    return NextResponse.json(
      { error: "Path does not cross gate" },
      { status: 422 },
    );
  }

  const existing = await prisma.crossing.findUnique({
    where: {
      userId_routeId_controlPointId: {
        userId: session.user.id,
        routeId,
        controlPointId,
      },
    },
  });

  if (existing) {
    return NextResponse.json(existing);
  }

  // Start must be crossed before any other gate. Middle gates have no order.
  if (!controlPoint.isStart) {
    const startGate = await prisma.controlPoint.findFirst({
      where: { routeId, isStart: true },
      select: { id: true },
    });
    if (startGate) {
      const startCrossing = await prisma.crossing.findUnique({
        where: {
          userId_routeId_controlPointId: {
            userId: session.user.id,
            routeId,
            controlPointId: startGate.id,
          },
        },
      });
      if (!startCrossing) {
        return NextResponse.json(
          { error: "Must cross start gate first" },
          { status: 422 },
        );
      }
    }
  }

  const crossing = await prisma.crossing.create({
    data: {
      userId: session.user.id,
      routeId,
      controlPointId,
    },
    include: { controlPoint: true },
  });

  return NextResponse.json(crossing, { status: 201 });
}
