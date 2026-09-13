import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewRouteForm } from "@/components/NewRouteForm";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const routes = await prisma.route.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { controlPoints: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Routes</h1>

      <NewRouteForm />

      <ul className="space-y-2">
        {routes.map((route) => (
          <li key={route.id}>
            <Link
              href={`/admin/routes/${route.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-blue-400"
            >
              <span className="font-medium text-gray-900">{route.name}</span>
              <span className="text-sm text-gray-500">
                {route._count.controlPoints} control point
                {route._count.controlPoints === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {routes.length === 0 && (
          <p className="text-sm text-gray-500">No routes yet. Create one above.</p>
        )}
      </ul>
    </div>
  );
}
