"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

export default function AnimatedCounter({
  target,
  suffix = "",
  prefix = "",
  duration = 1800,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [currentCount, setCurrentCount] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let observer: IntersectionObserver | null = null;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;

      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        setCurrentCount(Math.round(target * eased));

        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        }
      };

      frame = requestAnimationFrame(tick);
    };

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          observer?.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [duration, target]);

  return (
    <span ref={ref}>
      {prefix}
      {currentCount}
      {suffix}
    </span>
  );
}
