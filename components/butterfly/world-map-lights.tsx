"use client";

import { motion } from "framer-motion";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

// WorldMapLights — minimal world map with soft dots that appear in sequence.
// Used in Journey panel 4 ("The scale"). Pure client-side render, no tiles,
// no external services — the `geography` is a static low-resolution world
// topology bundled with react-simple-maps via a public CDN URL.

// Public world topology served from react-simple-maps' CDN.
// Small file (~200 KB). Cacheable.
const WORLD_GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// A dozen demo city coordinates. The markers fade in one after another,
// not pinpointed enough to identify anyone — consistent with the spec's
// "city-level only, never pinpointed" constraint.
const DOTS: { coords: [number, number]; label: string }[] = [
  { coords: [-74.006, 40.7128], label: "New York" },
  { coords: [-118.2437, 34.0522], label: "Los Angeles" },
  { coords: [-73.5673, 45.5017], label: "Montreal" },
  { coords: [-0.1276, 51.5074], label: "London" },
  { coords: [2.3522, 48.8566], label: "Paris" },
  { coords: [13.405, 52.52], label: "Berlin" },
  { coords: [28.9784, 41.0082], label: "Istanbul" },
  { coords: [55.2708, 25.2048], label: "Dubai" },
  { coords: [77.209, 28.6139], label: "Delhi" },
  { coords: [103.8198, 1.3521], label: "Singapore" },
  { coords: [139.6917, 35.6895], label: "Tokyo" },
  { coords: [151.2093, -33.8688], label: "Sydney" },
];

export function WorldMapLights() {
  return (
    <div className="w-full">
      <ComposableMap
        projectionConfig={{ scale: 150 }}
        width={900}
        height={430}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={WORLD_GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#F5F5F7"
                stroke="#E9E9EF"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none", fill: "#F5F5F7" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>
        {DOTS.map((dot, i) => (
          <Marker key={dot.label} coordinates={dot.coords}>
            <motion.circle
              r={4}
              fill="#0A4AD6"
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 0.8 }}
              transition={{
                delay: 0.3 + i * 0.15,
                duration: 0.5,
                ease: "easeOut",
              }}
              viewport={{ once: true, margin: "-100px" }}
            />
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
}
