"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";

// BigNumber — the count-up animated number for Screen 1 (Home).
// Spec: font-size clamp(120px, 20vw, 240px), weight 700, tight
// letter-spacing. Animates 0 → target over 1.8s, ease-out, once
// per session (keyed on the target so changing value re-animates).

export function BigNumber({
  target,
  duration = 1.8,
}: {
  target: number;
  duration?: number;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const controls = animate(0, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, duration]);

  return (
    <div
      className="text-[color:var(--bf-ink)] font-bold tabular-nums"
      style={{
        fontSize: "clamp(120px, 20vw, 240px)",
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}
    >
      {value.toLocaleString()}
    </div>
  );
}
