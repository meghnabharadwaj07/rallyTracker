-- rangeMeters was half-width; convert to full gate breadth across the road.
UPDATE "ControlPoint" SET "rangeMeters" = "rangeMeters" * 2;
