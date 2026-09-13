"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { distanceToGateMeters, gateCrossingT } from "@/lib/geo";

const noopSubscribe = () => () => {};

function useHasMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

type ControlPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rangeMeters: number;
  bearingDegrees: number;
  order: number;
  isStart: boolean;
  isFinish: boolean;
};

type CrossingInfo = {
  controlPointId: string;
  crossedAt: string;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function notifyCrossing(name: string, crossedAt: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  new Notification("Control point crossed", {
    body: `${name} at ${new Date(crossedAt).toLocaleTimeString()}`,
  });
}

export function TrackingView({
  routeId,
  controlPoints,
  initialCrossings,
}: {
  routeId: string;
  controlPoints: ControlPoint[];
  initialCrossings: CrossingInfo[];
}) {
  const sortedPoints = useMemo(
    () =>
      [...controlPoints].sort((a, b) => {
        if (a.isStart !== b.isStart) return a.isStart ? -1 : 1;
        if (a.isFinish !== b.isFinish) return a.isFinish ? 1 : -1;
        return a.order - b.order;
      }),
    [controlPoints],
  );
  const startPoint = sortedPoints.find((p) => p.isStart) ?? sortedPoints[0];
  const finishPoint = sortedPoints.find((p) => p.isFinish);

  const [crossings, setCrossings] = useState<Map<string, string>>(
    new Map(initialCrossings.map((c) => [c.controlPointId, c.crossedAt])),
  );
  const [tracking, setTracking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [nearest, setNearest] = useState<{
    name: string;
    distance: number;
  } | null>(null);
  const mounted = useHasMounted();

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const postingRef = useRef(false);
  const crossingsRef = useRef(crossings);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const onPositionRef = useRef<(position: GeolocationPosition) => void>(
    () => {},
  );
  const pointsById = useMemo(
    () => new Map(sortedPoints.map((p) => [p.id, p])),
    [sortedPoints],
  );

  useEffect(() => {
    crossingsRef.current = crossings;
  }, [crossings]);

  useEffect(() => {
    if (!tracking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [tracking]);

  const recordCrossing = useCallback(
    async (
      controlPointId: string,
      prev: { lat: number; lng: number },
      curr: { lat: number; lng: number },
    ): Promise<string | null> => {
      try {
        const res = await fetch("/api/crossings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId,
            controlPointId,
            prevLat: prev.lat,
            prevLng: prev.lng,
            lat: curr.lat,
            lng: curr.lng,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        setCrossings((prevMap) =>
          new Map(prevMap).set(controlPointId, data.crossedAt),
        );
        const point = pointsById.get(controlPointId);
        notifyCrossing(point?.name ?? "Control point", data.crossedAt);
        return data.crossedAt as string;
      } catch {
        return null;
      }
    },
    [routeId, pointsById],
  );

  const onPosition = useCallback(
    (position: GeolocationPosition) => {
      const curr = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const prev = lastPositionRef.current;
      lastPositionRef.current = curr;

      const startCrossed = startPoint
        ? crossingsRef.current.has(startPoint.id)
        : true;

      // Before start: only start is eligible.
      // After start: any uncrossed middle gate, plus finish.
      const eligible = sortedPoints.filter((cp) => {
        if (crossingsRef.current.has(cp.id)) return false;
        if (!startCrossed) return cp.isStart || cp.id === startPoint?.id;
        return true;
      });

      let closest: { name: string; distance: number } | null = null;
      for (const cp of eligible) {
        const distance = distanceToGateMeters(curr, {
          lat: cp.lat,
          lng: cp.lng,
          bearingDegrees: cp.bearingDegrees,
          rangeMeters: cp.rangeMeters,
        });
        if (!closest || distance < closest.distance) {
          closest = { name: cp.name, distance };
        }
      }
      setNearest(closest);

      if (!prev || eligible.length === 0 || postingRef.current) return;

      const crossedAlongPath = eligible
        .map((cp) => ({
          cp,
          t: gateCrossingT(prev, curr, {
            lat: cp.lat,
            lng: cp.lng,
            bearingDegrees: cp.bearingDegrees,
            rangeMeters: cp.rangeMeters,
          }),
        }))
        .filter(
          (row): row is { cp: ControlPoint; t: number } => row.t !== null,
        )
        .sort((a, b) => a.t - b.t);

      if (crossedAlongPath.length === 0) return;

      const toRecord = crossedAlongPath.map((row) => row.cp);

      postingRef.current = true;
      for (const cp of toRecord) {
        crossingsRef.current = new Map(crossingsRef.current).set(
          cp.id,
          new Date().toISOString(),
        );
      }

      void (async () => {
        try {
          for (const cp of toRecord) {
            const crossedAt = await recordCrossing(cp.id, prev, curr);
            if (crossedAt) {
              crossingsRef.current = new Map(crossingsRef.current).set(
                cp.id,
                crossedAt,
              );
            } else {
              const rolled = new Map(crossingsRef.current);
              let clearing = false;
              for (const later of toRecord) {
                if (later.id === cp.id) clearing = true;
                if (clearing) rolled.delete(later.id);
              }
              crossingsRef.current = rolled;
              break;
            }
          }
        } finally {
          postingRef.current = false;
        }
      })();
    },
    [sortedPoints, startPoint, recordCrossing],
  );

  useEffect(() => {
    onPositionRef.current = onPosition;
  }, [onPosition]);

  const startTracking = async () => {
    setStatusMessage(null);
    lastPositionRef.current = null;

    if (!("geolocation" in navigator)) {
      setStatusMessage("Geolocation is not supported on this device.");
      return;
    }

    if (!window.isSecureContext) {
      setStatusMessage(
        "Location only works over HTTPS (or localhost). This page was loaded over an insecure connection, so the browser is blocking GPS access.",
      );
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // notifications are best-effort; ignore failures
      }
    }

    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // wake lock is best-effort; ignore failures
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => onPositionRef.current(pos),
        (err) => setStatusMessage(`Location error: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
      setTracking(true);
    } catch (err) {
      setStatusMessage(
        `Couldn't start location tracking: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    lastPositionRef.current = null;
    setTracking(false);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const startCrossedAt = startPoint ? crossings.get(startPoint.id) : undefined;
  const finishCrossedAt = finishPoint
    ? crossings.get(finishPoint.id)
    : undefined;
  const elapsedMs = startCrossedAt
    ? (finishCrossedAt
        ? new Date(finishCrossedAt).getTime()
        : now) - new Date(startCrossedAt).getTime()
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              {finishCrossedAt ? "Stage time" : "Elapsed since start"}
            </p>
            <p className="font-mono text-3xl font-semibold text-gray-900">
              {elapsedMs !== null ? formatDuration(elapsedMs) : "--:--:--"}
            </p>
          </div>
          <button
            onClick={tracking ? stopTracking : startTracking}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              tracking
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {tracking ? "Stop tracking" : "Start tracking"}
          </button>
        </div>

        {tracking && (
          <p className="mt-2 text-xs text-gray-500">
            Cross start first, then any checkpoints in any order, then finish.
          </p>
        )}
        {tracking && nearest && (
          <p className="mt-1 text-xs text-gray-500">
            Nearest open gate: {nearest.name} —{" "}
            {Math.round(nearest.distance)}m away
          </p>
        )}
        {statusMessage && (
          <p className="mt-2 text-xs text-red-600">{statusMessage}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Control point</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Diff from start</th>
            </tr>
          </thead>
          <tbody>
            {sortedPoints.map((cp) => {
              const crossedAt = crossings.get(cp.id);
              const isStartRow = cp.id === startPoint?.id;
              const diffMs =
                crossedAt && startCrossedAt
                  ? isStartRow
                    ? 0
                    : new Date(crossedAt).getTime() -
                      new Date(startCrossedAt).getTime()
                  : null;

              return (
                <tr key={cp.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {cp.name}
                    {cp.isStart && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                        start
                      </span>
                    )}
                    {cp.isFinish && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                        finish
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {crossedAt && mounted
                      ? new Date(crossedAt).toLocaleTimeString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {diffMs !== null ? `+${formatDuration(diffMs)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
