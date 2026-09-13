import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RouteMapEditorLoader } from "@/components/RouteMapEditorLoader";
import { RouteNameEditor } from "@/components/RouteNameEditor";

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];

export default async function AdminRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const route = await prisma.route.findUnique({
    where: { id },
    include: { controlPoints: { orderBy: { order: "asc" } } },
  });

  if (!route) {
    notFound();
  }

  const center: [number, number] =
    route.controlPoints.length > 0
      ? [route.controlPoints[0].lat, route.controlPoints[0].lng]
      : DEFAULT_CENTER;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <RouteNameEditor routeId={route.id} initialName={route.name} />

      <RouteMapEditorLoader
        routeId={route.id}
        initialControlPoints={route.controlPoints}
        center={center}
      />
    </div>
  );
}
