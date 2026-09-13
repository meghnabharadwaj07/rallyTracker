"use client";

import dynamic from "next/dynamic";
import type { ControlPoint } from "./RouteMapEditor";

const RouteMapEditor = dynamic(
  () => import("./RouteMapEditor").then((mod) => mod.RouteMapEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] w-full items-center justify-center rounded-lg border border-gray-200 text-sm text-gray-400">
        Loading map...
      </div>
    ),
  },
);

export function RouteMapEditorLoader(props: {
  routeId: string;
  initialControlPoints: ControlPoint[];
  center: [number, number];
}) {
  return <RouteMapEditor {...props} />;
}
