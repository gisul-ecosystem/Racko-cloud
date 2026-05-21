"use client";

import { useState } from "react";

const trustedLogos = [
  { src: "/images/logos/sigmoid.png", alt: "Sigmoid" },
  { src: "/images/logos/dassault.png", alt: "Dassault Systèmes" },
  { src: "/images/logos/sutherland.png", alt: "Sutherland" },
  { src: "/images/logos/stravie.png", alt: "Straive" },
  { src: "/images/logos/unext.png", alt: "UNext" },
  { src: "/images/logos/schneider.png", alt: "Schneider Electric" },
  { src: "/images/logos/edforce.png", alt: "Edforce" },
  { src: "/images/logos/stalwart.png", alt: "Stalwart" },
  { src: "/images/logos/startiformai.png", alt: "StartiformAI" },
  { src: "/images/logos/springpeople.png", alt: "SpringPeople" },
  { src: "/images/logos/teamlease.png", alt: "TeamLease Digital" },
  { src: "/images/logos/ausmallfin.png", alt: "Fermion" },
  { src: "/images/logos/webyne.png", alt: "Webyne" },
] as const;

const ecosystemLogos = [
  { src: "/images/ecosystem/aws.png", alt: "AWS" },
  { src: "/images/ecosystem/azure.svg", alt: "Azure" },
  { src: "/images/ecosystem/google.png", alt: "Google Cloud" },
  { src: "/images/ecosystem/oracle.png", alt: "Oracle" },
  { src: "/images/ecosystem/anthropic.png", alt: "Anthropic" },
  { src: "/images/ecosystem/OpenAI.png", alt: "OpenAI" },
  { src: "/images/ecosystem/copliot.png", alt: "GitHub Copilot" },
  { src: "/images/ecosystem/cursor.png", alt: "Cursor" },
  { src: "/images/ecosystem/zoho.png", alt: "Zoho" },
  { src: "/images/ecosystem/microsoft.png", alt: "Microsoft" },
  { src: "/images/ecosystem/Skillable.svg", alt: "Skillable" },
  { src: "/images/ecosystem/comptia.png", alt: "CompTIA" },
] as const;

export default function TrustStrip() {
  const [pausedTrust, setPausedTrust] = useState(false);
  const [pausedPartners, setPausedPartners] = useState(false);

  return (
    <section className="border-b border-t border-[rgba(255,255,255,0.08)] bg-[#161616]">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex items-center border-b border-[rgba(255,255,255,0.06)] py-4">
          <div className="sticky left-0 z-10 hidden shrink-0 whitespace-nowrap bg-[#161616] px-12 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B] md:block">
            TRUSTED BY ENTERPRISES AT
          </div>

          <div
            className="flex flex-1 overflow-hidden px-4 md:px-0"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
            }}
            onMouseEnter={() => setPausedTrust(true)}
            onMouseLeave={() => setPausedTrust(false)}
          >
            <div
              className="marqueeTrack marqueeTrackTrust flex w-max items-center gap-24"
              style={{ animationPlayState: pausedTrust ? "paused" : "running" }}
            >
              {[...trustedLogos, ...trustedLogos].map((logo, idx) => (
                <div key={`${logo.alt}-${idx}`} className="flex items-center gap-24">
                  <LogoItem src={logo.src} alt={logo.alt} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center py-3">
          <div className="sticky left-0 z-10 hidden shrink-0 whitespace-nowrap bg-[#161616] px-12 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B] md:block">
            Ecosystem partners
          </div>

          <div
            className="flex flex-1 overflow-hidden px-4 md:px-0"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
            }}
            onMouseEnter={() => setPausedPartners(true)}
            onMouseLeave={() => setPausedPartners(false)}
          >
            <div
              className="marqueeTrack marqueeTrackPartners flex w-max items-center gap-8"
              style={{ animationPlayState: pausedPartners ? "paused" : "running" }}
            >
              {[...ecosystemLogos, ...ecosystemLogos].map((logo, idx) => (
                <div key={`${logo.alt}-${idx}`} className="flex items-center gap-8">
                  <LogoItem src={logo.src} alt={logo.alt} forceWhite={logo.alt === "OpenAI"} />
                  <span className="h-4 w-px shrink-0 bg-[rgba(255,255,255,0.08)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .marqueeTrack {
          will-change: transform;
          animation-name: marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .marqueeTrackTrust {
          animation-duration: 35s;
        }

        .marqueeTrackPartners {
          animation-duration: 60s;
        }

        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @media (max-width: 767px) {
          .marqueeTrackTrust {
            animation-duration: 25s;
          }

          .marqueeTrackPartners {
            animation-duration: 40s;
          }
        }
      `}</style>
    </section>
  );
}

function LogoItem({ src, alt, forceWhite = false }: { src: string; alt: string; forceWhite?: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <span className="inline-block h-[84px] w-[150px]" aria-hidden />;
  }

  return (
    <span className="inline-flex w-[170px] items-center justify-center px-1 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setHasError(true)}
        onLoad={(e) => {
          const image = e.currentTarget as HTMLImageElement;
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth <= 1 || image.naturalHeight <= 1) {
            setHasError(true);
          }
        }}
        style={{
          height: "84px",
          width: "150px",
          objectFit: "contain",
          opacity: 0.95,
          filter: forceWhite ? "brightness(0) invert(1)" : "grayscale(1) brightness(1.9) contrast(1.1)",
          transition: "opacity 150ms",
          display: "block",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "0.95";
        }}
      />
    </span>
  );
}
