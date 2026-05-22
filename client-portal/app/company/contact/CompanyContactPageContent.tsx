"use client";

import Link from "next/link";
import { Check, Calendar, ClipboardList, FlaskConical } from "lucide-react";
import { useState, type FormEvent } from "react";
import Eyebrow from "@/components/ui/Eyebrow";
import { useDemoModal } from "@/components/ui/DemoModalContext";

type FormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
  subject: string;
  message: string;
};

type FormErrors = {
  phone?: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  subject: "Cloud product enquiry",
  message: "",
};

const INPUT_BASE =
  "w-full rounded-[6px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-[14px] py-[11px] font-sans text-[14px] text-white outline-none transition-colors duration-150 placeholder:text-[#3D3D3D] focus:border-[rgba(185,28,28,0.6)]";

export default function CompanyContactPageContent() {
  const { openModal } = useDemoModal();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const setField = (field: keyof FormState, value: string) => {
    // Phone field: only allow valid characters
    if (field === "phone") {
      // Strip invalid characters - only allow +, digits, spaces, and hyphens
      const sanitized = value.replace(/[^+0-9\s\-]/g, "");
      
      // Prevent multiple + signs or + not at the start
      const cleaned = sanitized.replace(/\+/g, (match, offset) => offset === 0 ? match : "");
      
      // Limit length to 15 characters (excluding spaces and hyphens)
      const digitsOnly = cleaned.replace(/[\s\-]/g, "");
      if (digitsOnly.length > 15) {
        return; // Don't update if exceeds max length
      }
      
      setForm((prev) => ({ ...prev, [field]: cleaned }));
      
      // Validate
      const trimmed = cleaned.trim();
      if (trimmed.length === 0) {
        setErrors({ phone: undefined });
      } else if (digitsOnly.length < 7) {
        setErrors({ phone: "Please enter a valid phone number." });
      } else {
        setErrors({ phone: undefined });
      }
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Validate phone if provided
    if (form.phone.trim() && !/^[+]?[0-9\s\-]{7,15}$/.test(form.phone.trim())) {
      setErrors({ phone: "Please enter a valid phone number." });
      return;
    }
    
    // eslint-disable-next-line no-console
    console.log("Contact form submitted:", form);
    setSubmitted(true);
    setForm(INITIAL_FORM);
    setErrors({});
  };

  return (
    <main className="min-w-0">
      <section className="bg-[#0A0A0A] pb-[60px] pt-[120px]">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
          <Eyebrow label="CONTACT" />
          <h1 className="mt-5 max-w-[900px] font-sans text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[48px] md:text-[56px]">
            Let&apos;s start a conversation.
          </h1>
          <p className="mt-6 max-w-[500px] font-sans text-[18px] font-normal leading-[1.65] text-[#6B6B6B]">
            Book a Racko Meet, ask about a specific product, or start a cloud readiness assessment. We respond within
            one business day.
          </p>
        </div>
      </section>

      <section className="bg-[#0E0E0E] py-20">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 xl:px-8">
          <div>
            <div className="flex flex-col gap-4">
              <article className="rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-7">
                <Calendar size={22} color="#B91C1C" />
                <h2 className="mt-4 font-sans text-[18px] font-bold text-white">Book a Racko Meet</h2>
                <p className="mt-2 font-sans text-[13px] leading-[1.7] text-[#6B6B6B]">
                  Talk to a Racko Cloud specialist about your workload — VPS, Dedicated Cloud, GPU, CloudLabs,
                  storage, backup, or managed operations.
                </p>
                <button
                  type="button"
                  onClick={openModal}
                  className="mt-4 font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  Book now →
                </button>
              </article>

              <article className="rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-7">
                <ClipboardList size={22} color="#B91C1C" />
                <h2 className="mt-4 font-sans text-[18px] font-bold text-white">Cloud Readiness Assessment</h2>
                <p className="mt-2 font-sans text-[13px] leading-[1.7] text-[#6B6B6B]">
                  Tell us about one priority workload. We&apos;ll assess your current setup and recommend the right
                  cloud path — VPS, Dedicated Cloud, GPU, CloudLabs, or managed operations.
                </p>
                <Link
                  href="/assessment"
                  className="mt-4 inline-block font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  Start assessment →
                </Link>
              </article>

              <article className="rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-7">
                <FlaskConical size={22} color="#B91C1C" />
                <h2 className="mt-4 font-sans text-[18px] font-bold text-white">Design a CloudLabs Environment</h2>
                <p className="mt-2 font-sans text-[13px] leading-[1.7] text-[#6B6B6B]">
                  Need to launch a lab, sandbox, demo environment, or event infrastructure? Tell us what you need and
                  we&apos;ll design the right CloudLabs setup.
                </p>
                <button
                  type="button"
                  onClick={openModal}
                  className="mt-4 font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  Design environment →
                </button>
              </article>
            </div>

            <div className="mt-6">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">OR REACH US DIRECTLY</p>
              <p className="mt-3 font-sans text-[14px] text-white">cloud@racko.in</p>
              <p className="mt-1 font-sans text-[13px] text-[#6B6B6B]">HSR Layout, Bengaluru — Karnataka, India</p>
            </div>
          </div>

          <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#111111] p-9">
            {!submitted ? (
              <>
                <h2 className="mb-6 font-sans text-[18px] font-bold text-white">Send us a message</h2>
                <form onSubmit={onSubmit} className="space-y-3.5">
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      NAME
                    </label>
                    <input
                      required
                      type="text"
                      className={INPUT_BASE}
                      placeholder="Full name"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      WORK EMAIL
                    </label>
                    <input
                      required
                      type="email"
                      className={INPUT_BASE}
                      placeholder="work@company.com"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      COMPANY
                    </label>
                    <input
                      type="text"
                      className={INPUT_BASE}
                      placeholder="Company name"
                      value={form.company}
                      onChange={(e) => setField("company", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      PHONE
                    </label>
                    <input
                      type="tel"
                      className={`${INPUT_BASE} ${errors.phone ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                      placeholder="+91 or international"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      inputMode="numeric"
                    />
                    {errors.phone ? (
                      <p className="mt-1 text-[11px] text-[#EF4444]">{errors.phone}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      SUBJECT
                    </label>
                    <select
                      className={`${INPUT_BASE} [&>option]:bg-black [&>option]:text-white`}
                      value={form.subject}
                      onChange={(e) => setField("subject", e.target.value)}
                    >
                      <option>Cloud product enquiry</option>
                      <option>CloudLabs design</option>
                      <option>Cloud readiness assessment</option>
                      <option>Partnership opportunity</option>
                      <option>Technical support</option>
                      <option>General enquiry</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                      MESSAGE
                    </label>
                    <textarea
                      rows={4}
                      className={INPUT_BASE}
                      placeholder="Tell us about your workload or question..."
                      value={form.message}
                      onChange={(e) => setField("message", e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-[6px] bg-[#B91C1C] px-8 py-3 font-sans text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#DC2626]"
                  >
                    Send Message →
                  </button>
                </form>
              </>
            ) : (
              <div className="py-10 text-center">
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)]">
                  <span className="absolute h-16 w-16 animate-ping rounded-full bg-[rgba(34,197,94,0.15)]" />
                  <Check size={28} color="#22C55E" />
                </div>
                <p className="font-sans text-[18px] font-bold text-white">
                  Message sent. We&apos;ll respond within one business day.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-5 font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  Send another message
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-t border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] px-4 py-10 sm:px-6 xl:px-16">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start justify-between gap-5 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#3D3D3D]">
              RACKO CLOUD · GISUL SOFTWARE SERVICES PVT. LTD.
            </p>
            <p className="mt-1 font-sans text-[13px] text-[#6B6B6B]">
              HSR Layout, Bengaluru, Karnataka — 560102, India
            </p>
          </div>
          <p className="font-mono text-[10px] text-[#6B6B6B]">cloud@racko.in</p>
        </div>
      </section>
    </main>
  );
}
