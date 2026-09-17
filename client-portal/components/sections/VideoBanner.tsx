"use client";

import { useEffect, useRef } from "react";
import {
  cubicBezier,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

const VIDEO_SRC = "/images/Final.mp4";

const fadeEase = cubicBezier(0.4, 0, 0.3, 1);

export default function VideoBanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const progress = useSpring(scrollYProgress, {
    stiffness: 55,
    damping: 26,
    mass: 0.6,
  });

  const opacity = useTransform(progress, [0.02, 0.56], [0, 1], { ease: fadeEase });
  const scale = useTransform(progress, [0, 0.66], [1.14, 1], { ease: fadeEase });
  const y = useTransform(progress, [0, 1], ["-9%", "9%"]);
  const veilOpacity = useTransform(progress, [0.02, 0.62], [0.92, 0], { ease: fadeEase });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-[#030304]">
      <div className="relative h-[min(92svh,56.25vw)] min-h-[340px] w-full overflow-hidden">
        <motion.div
          className="absolute inset-x-0 -top-[12.5%] h-[125%] will-change-transform"
          style={reduceMotion ? undefined : { opacity, scale, y }}
        >
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            disablePictureInPicture
            aria-hidden
          />
        </motion.div>

        {reduceMotion ? null : (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[#030304]"
            style={{ opacity: veilOpacity }}
          />
        )}
      </div>
    </section>
  );
}
