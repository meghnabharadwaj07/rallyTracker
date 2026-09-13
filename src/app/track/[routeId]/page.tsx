import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TrackingView } from "@/components/TrackingView";

export default async function TrackRoutePage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  const session = await auth();

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { controlPoints: { orderBy: { order: "asc" } } },
  });

  if (!route) {
    notFound();
  }

  const crossings = await prisma.crossing.findMany({
    where: { userId: session!.user.id, routeId },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">{route.name}</h1>

      <TrackingView
        routeId={route.id}
        controlPoints={route.controlPoints}
        initialCrossings={crossings.map((c) => ({
          controlPointId: c.controlPointId,
          crossedAt: c.crossedAt.toISOString(),
        }))}
      />
    </div>
  );
}
