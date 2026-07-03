"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export interface CountUpProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Animated number that counts up to `value`; instant under reduced motion. */
export function CountUp({
  value,
  decimals = 0,
  duration = 1,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("en-US");

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
