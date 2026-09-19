import assert from "node:assert/strict";
import { test } from "node:test";
import { gateCrossingT, pathCrossesGate } from "../src/lib/geo";

type Gate = Parameters<typeof pathCrossesGate>[2];

const northSouthGate: Gate = {
  lat: 0,
  lng: 0,
  bearingDegrees: 0,
  rangeMeters: 20,
};

test("detects a path crossing the gate", () => {
  const crossing = gateCrossingT(
    { lat: -0.0001, lng: 0 },
    { lat: 0.0001, lng: 0 },
    northSouthGate,
  );

  assert.notEqual(crossing, null);
  assert.equal(pathCrossesGate(
    { lat: -0.0001, lng: 0 },
    { lat: 0.0001, lng: 0 },
    northSouthGate,
  ), true);
});

test("does not report a path that misses the gate", () => {
  assert.equal(pathCrossesGate(
    { lat: -0.0001, lng: 0.001 },
    { lat: 0.0001, lng: 0.001 },
    northSouthGate,
  ), false);
});

test("does not report a collinear path as a crossing", () => {
  assert.equal(pathCrossesGate(
    { lat: 0, lng: -0.001 },
    { lat: 0, lng: 0.001 },
    northSouthGate,
  ), false);
});

test("returns the crossing position along the GPS segment", () => {
  const t = gateCrossingT(
    { lat: -0.0002, lng: 0 },
    { lat: 0.0002, lng: 0 },
    northSouthGate,
  );

  assert.ok(t !== null);
  assert.ok(Math.abs(t - 0.5) < 0.01);
});
