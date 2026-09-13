import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrackHomePage() {
  const routes = await prisma.route.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { controlPoints: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Select a route</h1>

      <ul className="space-y-2">
        {routes.map((route) => (
          <li key={route.id}>
            <Link
              href={`/track/${route.id}`}
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
          <p className="text-sm text-gray-500">
            No routes available yet. Check back once an admin sets one up.
          </p>
        )}
      </ul>
    </div>
  );
}
