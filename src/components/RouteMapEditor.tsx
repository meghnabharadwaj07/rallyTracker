"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  bearingDegrees as headingDegrees,
  distanceMeters,
  gateEndpoints,
  normalizeBearing,
} from "@/lib/geo";

const defaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 0 0 2px #2563eb;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/** Full gate width across a typical road + shoulders. */
const DEFAULT_BREADTH_METERS = 40;
const TARGET_ACCURACY_METERS = 40;
const LOCATION_TIMEOUT_MS = 20000;

export type ControlPoint = {
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

type FreshFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onClick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}

function gateBearingForNewPoint(
  points: ControlPoint[],
  lat: number,
  lng: number,
): number {
  if (points.length === 0) return 0;
  const prev = [...points].sort((a, b) => a.order - b.order).at(-1)!;
  // Gate line runs across the road → perpendicular to travel heading.
  return normalizeBearing(headingDegrees(prev.lat, prev.lng, lat, lng) + 90);
}

/**
 * Prefer a fresh watchPosition fix over getCurrentPosition, which often
 * returns a cached laptop/Wi‑Fi location even with maximumAge: 0.
 */
function getFreshPosition(
  onProgress?: (fix: FreshFix) => void,
): Promise<FreshFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }

    let best: FreshFix | null = null;
    let settled = false;

    const finish = (fix: FreshFix) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      resolve(fix);
    };

    const timer = window.setTimeout(() => {
      if (best) {
        finish(best);
      } else {
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        reject(
          new Error(
            "Timed out waiting for GPS. Try outdoors or check location permissions.",
          ),
        );
      }
    }, LOCATION_TIMEOUT_MS);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const fix: FreshFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? Number.POSITIVE_INFINITY,
        };
        onProgress?.(fix);

        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
        }

        // Accept once accuracy is good enough (phone GPS), or keep refining.
        if (fix.accuracy <= TARGET_ACCURACY_METERS) {
          finish(fix);
        }
      },
      (err) => {
        if (settled) return;
        // If we already have any fix, use it instead of failing hard.
        if (best) {
          finish(best);
          return;
        }
        settled = true;
        navigator.geolocation.clearWatch(watchId);
        window.clearTimeout(timer);
        reject(new Error(err.message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export function RouteMapEditor({
  routeId,
  initialControlPoints,
  center,
}: {
  routeId: string;
  initialControlPoints: ControlPoint[];
  center: [number, number];
}) {
  const [points, setPoints] = useState<ControlPoint[]>(initialControlPoints);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [addingCurrent, setAddingCurrent] = useState(false);
  const [addCurrentError, setAddCurrentError] = useState<string | null>(null);
  const [addCurrentNotice, setAddCurrentNotice] = useState<string | null>(
    null,
  );
  const [userFix, setUserFix] = useState<FreshFix | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const locateMe = async () => {
    setLocateError(null);
    setLocating(true);
    try {
      const fix = await getFreshPosition((partial) => {
        setUserFix(partial);
        mapRef.current?.setView([partial.lat, partial.lng], 17);
      });
      setUserFix(fix);
      mapRef.current?.setView([fix.lat, fix.lng], 17);
    } catch (err) {
      setLocateError(
        err instanceof Error ? err.message : "Couldn't get your location.",
      );
    } finally {
      setLocating(false);
    }
  };

  const addPoint = async (lat: number, lng: number) => {
    setSaving(true);
    try {
      const bearingDegrees = gateBearingForNewPoint(points, lat, lng);
      const isStart = points.length === 0;
      const isFinish = !isStart && !points.some((p) => p.isFinish);
      const res = await fetch(`/api/routes/${routeId}/control-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: isStart ? "Start" : isFinish ? "Finish" : `Point ${points.length}`,
          lat,
          lng,
          rangeMeters: DEFAULT_BREADTH_METERS,
          bearingDegrees,
          order: points.length,
          isStart,
          isFinish,
        }),
      });
      if (res.ok) {
        const created: ControlPoint = await res.json();
        setPoints((prev) => [
          ...prev.map((p) =>
            created.isFinish ? { ...p, isFinish: false } : p,
          ),
          created,
        ]);

        // Once travel direction is known, align the previous gate across the road too.
        const prevPoint = [...points].sort((a, b) => a.order - b.order).at(-1);
        if (prevPoint && !isStart) {
          await updatePoint(prevPoint.id, { bearingDegrees });
        }

        return created;
      }
      setAddCurrentError("Couldn't save the control point. Try again.");
    } finally {
      setSaving(false);
    }
    return null;
  };

  const addPointAtCurrentLocation = async () => {
    if (addingCurrent) return;
    setAddCurrentError(null);
    setAddCurrentNotice(null);

    const priorPoints = points;
    setAddingCurrent(true);
    try {
      const fix = await getFreshPosition((partial) => {
        setUserFix(partial);
        mapRef.current?.setView([partial.lat, partial.lng], 17);
      });
      setUserFix(fix);
      mapRef.current?.setView([fix.lat, fix.lng], 17);

      if (fix.accuracy > 80) {
        setAddCurrentNotice(
          `GPS accuracy is ±${Math.round(fix.accuracy)}m — the point may be off. You can drag-edit Lat/Lng below after adding.`,
        );
      }

      const created = await addPoint(fix.lat, fix.lng);
      if (created) {
        const nearest = priorPoints
          .map((existing) => ({
            existing,
            distance: distanceMeters(
              created.lat,
              created.lng,
              existing.lat,
              existing.lng,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0];

        if (nearest && nearest.distance < 5) {
          setAddCurrentNotice(
            `Landed ${nearest.distance.toFixed(1)}m from "${nearest.existing.name}" (±${Math.round(fix.accuracy)}m accuracy). Edit Lat/Lng if this is a duplicate.`,
          );
        }
      }
    } catch (err) {
      setAddCurrentError(
        err instanceof Error ? err.message : "Couldn't get your location.",
      );
    } finally {
      setAddingCurrent(false);
    }
  };

  const selectPoint = (p: ControlPoint) => {
    setSelectedId(p.id);
    mapRef.current?.setView(
      [p.lat, p.lng],
      Math.max(mapRef.current.getZoom(), 16),
    );
  };

  const stopCardClick = (e: React.SyntheticEvent) => e.stopPropagation();

  const updatePoint = async (id: string, data: Partial<ControlPoint>) => {
    setPoints((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const next = { ...p, ...data };
          if (data.isStart) next.isFinish = false;
          if (data.isFinish) next.isStart = false;
          return next;
        }
        if (data.isStart) return { ...p, isStart: false };
        if (data.isFinish) return { ...p, isFinish: false };
        return p;
      }),
    );
    await fetch(`/api/routes/${routeId}/control-points/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const deletePoint = async (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/routes/${routeId}/control-points/${id}`, {
      method: "DELETE",
    });
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-gray-200 md:w-2/3">
        <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1.5">
          <button
            onClick={locateMe}
            disabled={locating || addingCurrent}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {locating ? "Getting GPS..." : "📍 Current location"}
          </button>
          <button
            onClick={addPointAtCurrentLocation}
            disabled={addingCurrent || locating}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {addingCurrent ? "Getting GPS..." : "➕ Add point at my location"}
          </button>
          {userFix && (
            <p className="max-w-[220px] rounded-md bg-white/95 px-2 py-1 text-xs text-gray-600 shadow-sm">
              You: ±{Math.round(userFix.accuracy)}m
            </p>
          )}
          {locateError && (
            <p className="max-w-[220px] rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 shadow-sm">
              {locateError}
            </p>
          )}
          {addCurrentError && (
            <p className="max-w-[220px] rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 shadow-sm">
              {addCurrentError}
            </p>
          )}
          {addCurrentNotice && (
            <p className="max-w-[280px] rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 shadow-sm">
              {addCurrentNotice}
            </p>
          )}
        </div>

        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <MapRefSetter mapRef={mapRef} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onClick={addPoint} />
          {userFix && (
            <Fragment>
              <Marker position={[userFix.lat, userFix.lng]} icon={userIcon} />
              <Circle
                center={[userFix.lat, userFix.lng]}
                radius={userFix.accuracy}
                pathOptions={{
                  color: "#2563eb",
                  weight: 1,
                  fillOpacity: 0.08,
                }}
              />
            </Fragment>
          )}
          {points.map((p) => {
            const [a, b] = gateEndpoints({
              lat: p.lat,
              lng: p.lng,
              bearingDegrees: p.bearingDegrees,
              rangeMeters: p.rangeMeters,
            });
            const color = p.isStart
              ? "#16a34a"
              : p.isFinish
                ? "#dc2626"
                : "#2563eb";
            return (
              <Fragment key={p.id}>
                <Marker position={[p.lat, p.lng]} icon={defaultIcon} />
                <Polyline
                  positions={[
                    [a.lat, a.lng],
                    [b.lat, b.lng],
                  ]}
                  pathOptions={{
                    color: selectedId === p.id ? "#f59e0b" : color,
                    weight: selectedId === p.id ? 5 : 4,
                    opacity: 0.9,
                  }}
                />
              </Fragment>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex w-full flex-col gap-3 md:w-1/3">
        <p className="text-sm text-gray-500">
          Click the map to add a road gate. Breadth is the full width across the
          road; rotate bearing so the line sits across traffic. Mark one Start
          and one Finish — checkpoints in between can be crossed in any order.{" "}
          {saving && "Saving..."}
        </p>
        {points.length === 0 && (
          <p className="text-sm text-gray-400">No control points yet.</p>
        )}
        {points
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p) => (
            <div
              key={p.id}
              onClick={() => selectPoint(p)}
              className={`cursor-pointer space-y-2 rounded-lg border p-3 transition-colors ${
                selectedId === p.id
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={p.name}
                  onClick={stopCardClick}
                  onChange={(e) => updatePoint(p.id, { name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={(e) => {
                    stopCardClick(e);
                    deletePoint(p.id);
                  }}
                  className="shrink-0 text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  Breadth (m)
                  <input
                    type="number"
                    min={5}
                    step={1}
                    value={Math.round(p.rangeMeters)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n) || n <= 0) return;
                      updatePoint(p.id, { rangeMeters: n });
                    }}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1"
                    title="Full width of the gate across the road"
                  />
                </label>

                <div className="flex items-center gap-1" onClick={stopCardClick}>
                  <span>Bearing (°)</span>
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-1.5 py-0.5 hover:bg-gray-50"
                    title="Rotate gate −15°"
                    onClick={() =>
                      updatePoint(p.id, {
                        bearingDegrees: normalizeBearing(p.bearingDegrees - 15),
                      })
                    }
                  >
                    −15°
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={359}
                    step={1}
                    value={Math.round(normalizeBearing(p.bearingDegrees))}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      updatePoint(p.id, {
                        bearingDegrees: normalizeBearing(n),
                      });
                    }}
                    className="w-16 rounded-md border border-gray-300 px-2 py-1"
                    title="Angle of the gate line across the road (from north)"
                  />
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-1.5 py-0.5 hover:bg-gray-50"
                    title="Rotate gate +15°"
                    onClick={() =>
                      updatePoint(p.id, {
                        bearingDegrees: normalizeBearing(p.bearingDegrees + 15),
                      })
                    }
                  >
                    +15°
                  </button>
                </div>

                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  Order
                  <input
                    type="number"
                    min={0}
                    value={p.order}
                    onChange={(e) =>
                      updatePoint(p.id, { order: Number(e.target.value) })
                    }
                    className="w-16 rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>

                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  <input
                    type="radio"
                    name="isStart"
                    checked={p.isStart}
                    onChange={() => updatePoint(p.id, { isStart: true })}
                  />
                  Start
                </label>

                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  <input
                    type="radio"
                    name="isFinish"
                    checked={p.isFinish}
                    onChange={() => updatePoint(p.id, { isFinish: true })}
                  />
                  Finish
                </label>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  Lat
                  <input
                    type="number"
                    step="any"
                    value={p.lat}
                    onChange={(e) =>
                      updatePoint(p.id, { lat: Number(e.target.value) })
                    }
                    className="w-28 rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>

                <label className="flex items-center gap-1" onClick={stopCardClick}>
                  Lng
                  <input
                    type="number"
                    step="any"
                    value={p.lng}
                    onChange={(e) =>
                      updatePoint(p.id, { lng: Number(e.target.value) })
                    }
                    className="w-28 rounded-md border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
