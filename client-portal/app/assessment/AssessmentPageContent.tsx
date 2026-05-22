"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import CustomSelect from "@/components/ui/CustomSelect";

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  role: string;
  industry: string;
  currentInfrastructure: string;
  priorityWorkload: string;
  goals: string[];
  message: string;
  consent: boolean;
};

type FormErrors = {
  phone?: string;
};

const initialFormState: FormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  role: "",
  industry: "",
  currentInfrastructure: "",
  priorityWorkload: "",
  goals: [],
  message: "",
  consent: false,
};

const roleOptions = [
  "CxO / Founder",
  "CTO / CIO",
  "CISO",
  "Infrastructure Head",
  "Cloud / Platform Lead",
  "AI / Data Leader",
  "IT Manager",
  "Other",
];

const industryOptions = [
  "EdTech",
  "AI-Native Startups",
  "BPO / KPO / Voice AI",
  "Manufacturing / Industrial",
  "Healthcare",
  "Financial Services",
  "Other",
];

const infrastructureOptions = [
  "AWS",
  "Azure",
  "GCP",
  "Oracle Cloud",
  "Generic VM Provider",
  "On-Premises / Data Centre",
  "Hybrid (multiple)",
  "Other / Not sure",
];

const goalOptions = [
  "Reduce infrastructure cost",
  "Migrate to local / private infrastructure",
  "Move to cloud or between clouds",
  "Deploy AI workloads",
  "Improve governance and compliance",
  "Set up managed operations",
  "Not sure — need assessment",
];

const inputClassName =
  "w-full rounded-[4px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-[14px] py-[11px] font-sans text-[14px] text-white outline-none transition-colors duration-150 placeholder:text-[#3D3D3D] focus:border-[rgba(185,28,28,0.5)]";

const labelClassName =
  "mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]";

export default function AssessmentPageContent() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    // Phone field validation
    if (field === "phone" && typeof value === "string") {
      // Strip invalid characters - only allow +, digits, spaces, and hyphens
      const sanitized = value.replace(/[^+0-9\s\-]/g, "");
      
      // Prevent multiple + signs or + not at the start
      const cleaned = sanitized.replace(/\+/g, (match, offset) => offset === 0 ? match : "");
      
      // Limit length to 15 characters (excluding spaces and hyphens)
      const digitsOnly = cleaned.replace(/[\s\-]/g, "");
      if (digitsOnly.length > 15) {
        return; // Don't update if exceeds max length
      }
      
      setForm((prev) => ({ ...prev, [field]: cleaned as FormState[K] }));
      
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.consent || isSubmitting) return;

    // Validate phone if provided
    if (form.phone.trim()) {
      const digitsOnly = form.phone.replace(/[\s\-]/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        setErrors({ phone: "Please enter a valid phone number." });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const productInterest = [
        form.role && `Role: ${form.role}`,
        form.currentInfrastructure && `Infra: ${form.currentInfrastructure}`,
        form.priorityWorkload && `Workload: ${form.priorityWorkload}`,
      ].filter(Boolean);

      const response = await fetch("/api/book-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          phone: form.phone,
          companySize: "Via Assessment Form",
          industry: form.industry,
          productInterest,
          goal: form.goals.join(", "),
          date: "Via Assessment Form",
          timeSlot: "To be confirmed",
          message: form.message,
        }),
      });

      if (!response.ok) throw new Error("Failed");

      setIsSubmitted(true);
    } catch (error) {
      console.error("Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A]">
      <div className="mx-auto grid w-full max-w-[1200px] min-w-0 items-start gap-10 px-4 py-16 sm:gap-12 sm:px-6 sm:py-20 md:gap-16 md:py-24 lg:grid-cols-2 lg:gap-[100px] lg:px-8 lg:py-[120px]">
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-crimson-500">
            BOOK A RACKO MEET
          </p>
          <h1 className="mt-5 font-sans text-[38px] font-extrabold leading-[1.1] text-white md:text-[48px]">
            Tell us about one
            <br />
            priority workload.
          </h1>
          <p className="mt-6 font-sans text-[16px] font-normal leading-[1.7] text-[#6B6B6B]">
            Racko will review your current infrastructure, define the right
            target model — local, private, cloud, hybrid, or AI-ready — and
            build a phased path to migration, deployment, and managed
            operations.
          </p>

          <div className="mt-12">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#3D3D3D]">
              WHAT HAPPENS NEXT
            </p>
            <div className="mt-5 flex flex-col gap-5">
              {[
                {
                  title: "We review your workload",
                  desc: "Within one business day, a Racko infrastructure specialist reviews your submission.",
                },
                {
                  title: "We recommend the right model",
                  desc: "We map your workload to the right infrastructure environment — with reasoning, not sales pitch.",
                },
                {
                  title: "We build a phased plan",
                  desc: "Architecture review, migration path, and managed operations model — scoped and costed.",
                },
              ].map((step, idx) => (
                <div key={step.title} className="flex gap-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] bg-[#1A1A1A] font-mono text-[11px] text-crimson-500">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-sans text-[14px] font-semibold text-white">
                      {step.title}
                    </p>
                    <p className="mt-0.5 font-sans text-[13px] text-[#6B6B6B]">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border-t border-[rgba(255,255,255,0.06)] pt-8">
            <p className="font-mono text-[10px] text-[#3D3D3D]">
              No commitment required. No sales deck.
              <br />
              Just infrastructure thinking.
            </p>
          </div>
        </section>

        <section className="rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-[#1A1A1A] p-8 md:p-10">
          {isSubmitted ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
                aria-hidden
                className="text-crimson-500"
              >
                <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M14 24.5L21 31L34 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h2 className="mt-5 font-sans text-[24px] font-bold text-white">
                Meet request received.
              </h2>
              <p className="mt-3 max-w-[440px] font-sans text-[15px] leading-[1.7] text-[#6B6B6B]">
                Thanks. Racko will review your workload and recommend the right
                infrastructure path — local, private, cloud, hybrid, or
                AI-ready. Expect a response within one business day.
              </p>
              <Link
                href="/"
                className="mt-8 font-mono text-[12px] text-crimson-500 transition-colors duration-150 hover:text-crimson-400"
              >
                ← Back to Racko
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 className="mb-8 font-sans text-[18px] font-bold text-white">
                Book a Racko Meet
              </h2>

              <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="name">
                    NAME
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Full name"
                    className={inputClassName}
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="company">
                    COMPANY
                  </label>
                  <input
                    id="company"
                    type="text"
                    placeholder="Company name"
                    className={inputClassName}
                    value={form.company}
                    onChange={(e) => updateField("company", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="email">
                    WORK EMAIL
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="work@company.com"
                    className={inputClassName}
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="phone">
                    PHONE
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+91 or international"
                    className={`${inputClassName} ${errors.phone ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    inputMode="numeric"
                    required
                  />
                  {errors.phone ? (
                    <p className="mt-1 text-[11px] text-[#EF4444]">{errors.phone}</p>
                  ) : null}
                </div>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomSelect
                  label="ROLE"
                  id="role"
                  value={form.role}
                  onChange={(value) => updateField("role", value)}
                  options={roleOptions}
                  placeholder="Select role"
                  required
                />
                <CustomSelect
                  label="INDUSTRY"
                  id="industry"
                  value={form.industry}
                  onChange={(value) => updateField("industry", value)}
                  options={industryOptions}
                  placeholder="Select industry"
                  required
                />
              </div>

              <div className="mb-5">
                <CustomSelect
                  label="CURRENT INFRASTRUCTURE"
                  id="currentInfrastructure"
                  value={form.currentInfrastructure}
                  onChange={(value) => updateField("currentInfrastructure", value)}
                  options={infrastructureOptions}
                  placeholder="Select infrastructure"
                  required
                />
              </div>

              <div className="mb-5">
                <label className={labelClassName} htmlFor="priorityWorkload">
                  PRIORITY WORKLOAD
                </label>
                <input
                  id="priorityWorkload"
                  type="text"
                  placeholder="e.g. production database, AI training, LMS platform"
                  className={inputClassName}
                  value={form.priorityWorkload}
                  onChange={(e) => updateField("priorityWorkload", e.target.value)}
                  required
                />
              </div>

              <div className="mb-5">
                <label className={labelClassName} htmlFor="goals">
                  GOALS (SELECT ALL THAT APPLY)
                </label>
                <div className="flex flex-wrap gap-2">
                  {goalOptions.map((option) => {
                    const isSelected = form.goals.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          const currentGoals = [...form.goals];
                          if (currentGoals.includes(option)) {
                            const newGoals = currentGoals.filter((g) => g !== option);
                            setForm((prev) => ({ ...prev, goals: newGoals }));
                          } else {
                            const newGoals = [...currentGoals, option];
                            setForm((prev) => ({ ...prev, goals: newGoals }));
                          }
                        }}
                        className={`rounded-[4px] border px-3 py-2 font-sans text-[13px] transition-all duration-150 ${
                          isSelected
                            ? "border-crimson-500 bg-[rgba(185,28,28,0.15)] text-white"
                            : "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-[#6B6B6B] hover:border-[rgba(255,255,255,0.2)] hover:text-white"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {form.goals.length === 0 && (
                  <p className="mt-2 font-sans text-[12px] text-[#3D3D3D]">
                    Please select at least one goal
                  </p>
                )}
              </div>

              <div className="mb-5">
                <label className={labelClassName} htmlFor="message">
                  MESSAGE
                </label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Any additional context about your infrastructure challenge, timeline, or constraints."
                  className={`${inputClassName} resize-y`}
                  value={form.message}
                  onChange={(e) => updateField("message", e.target.value)}
                />
              </div>

              <label className="mb-5 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => updateField("consent", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-crimson-500"
                  required
                />
                <span className="font-sans text-[12px] leading-[1.5] text-[#6B6B6B]">
                  I agree to Racko contacting me about this Racko Meet request.
                  No spam — just infrastructure.
                </span>
              </label>

              <button
                type="submit"
                disabled={!form.consent || form.goals.length === 0 || isSubmitting}
                className={`mt-2 w-full rounded-[4px] border-0 px-4 py-3.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-white transition-colors duration-150 ${
                  !form.consent || form.goals.length === 0 || isSubmitting
                    ? "cursor-not-allowed bg-[rgba(185,28,28,0.3)]"
                    : "bg-crimson-500 hover:bg-crimson-400"
                }`}
              >
                {isSubmitting ? "SUBMITTING..." : "SUBMIT MEET REQUEST"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
