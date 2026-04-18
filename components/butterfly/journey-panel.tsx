"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

// JourneyPanel — full-viewport scroll-linked wrapper used by /app/journey.
// Fades content in as it enters the viewport, holds while it's centered,
// and fades out as it leaves. Each panel is a separate h-screen block so
// the scroll position is always tied to a single panel.

export function JourneyPanel({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "left";
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // Fade in as the panel scrolls from bottom, out as it leaves the top.
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [24, 0, 0, -24]);

  return (
    <section
      ref={ref}
      className={`
        h-screen w-full flex flex-col justify-center px-6 sm:px-10
        ${align === "left" ? "items-start" : "items-center text-center"}
      `}
    >
      <motion.div
        style={{ opacity, y }}
        className={`
          max-w-2xl w-full
          ${align === "center" ? "mx-auto" : ""}
        `}
      >
        {children}
      </motion.div>
    </section>
  );
}
