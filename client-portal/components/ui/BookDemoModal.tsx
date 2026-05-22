"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, X } from "lucide-react";
import { useDemoModal } from "@/components/ui/DemoModalContext";

interface FormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  companySize: string;
  date: string;
  timeSlot: string;
  industry: string;
  goal: string[];
  productInterest: string[];
}

const initialForm: FormData = {
  name: "",
  email: "",
  company: "",
  phone: "",
  companySize: "",
  date: "",
  timeSlot: "",
  industry: "",
  goal: [],
  productInterest: [],
};

const timeSlots = [
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
  "4:00 PM - 5:00 PM",
];

const companySizeOptions = [
  { value: "1-50", label: "1 - 50 employees" },
  { value: "51-200", label: "51 - 200 employees" },
  { value: "201-500", label: "201 - 500 employees" },
  { value: "501-1000", label: "501 - 1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
];

const industryOptions = [
  { value: "edtech", label: "EdTech" },
  { value: "ai-startup", label: "AI / ML Startup" },
  { value: "bpo-kpo", label: "BPO / KPO / Voice AI" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "healthcare", label: "Healthcare / MedTech" },
  { value: "financial", label: "Financial Services" },
  { value: "other", label: "Other" },
];

const productInterestOptions = [
  { id: "vps-cloud-vps", label: "VPS / Cloud VPS" },
  { id: "dedicated-cloud", label: "Dedicated Cloud" },
  { id: "gpu-cloud", label: "GPU Cloud" },
  { id: "private-cloud", label: "Private Cloud" },
  { id: "cloudlabs-sandboxes", label: "CloudLabs / Sandboxes" },
  { id: "s3-storage", label: "S3 Storage" },
  { id: "backup-storage", label: "Backup Storage" },
  { id: "web-hosting", label: "Web Hosting" },
  { id: "managed-operations", label: "Managed Operations" },
] as const;

const goalOptions = [
  { value: "reduce-cloud-cost", label: "Reduce cloud cost" },
  { value: "uptime-reliability", label: "Improve uptime and reliability" },
  { value: "backup-dr", label: "Add backup and DR" },
  { value: "ai-gpu", label: "Deploy AI / GPU workloads" },
  { value: "goal-launch-cloudlabs", label: "Launch CloudLabs or sandboxes" },
  { value: "scale-workloads", label: "Scale existing workloads" },
  { value: "migrate-provider", label: "Migrate from current provider" },
  { value: "benchmark-sku", label: "Benchmark cloud SKU options" },
  { value: "not-sure", label: "Not sure — need assessment" },
];

type Errors = Partial<Record<Exclude<keyof FormData, "productInterest">, string>>;

export default function BookDemoModal() {
  const { isOpen, closeModal } = useDemoModal();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const resetForm = () => {
    setStep(1);
    setFormData(initialForm);
    setErrors({});
    setIsSubmitting(false);
    setIsSuccess(false);
    setSubmitError(false);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
    const timer = setTimeout(() => resetForm(), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeModal]);

  const setField = (field: keyof Omit<FormData, "productInterest">, value: string) => {
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
      
      setFormData((prev) => ({ ...prev, [field]: cleaned }));
      
      // Validate
      const trimmed = cleaned.trim();
      if (trimmed.length === 0) {
        setErrors((prev) => ({ ...prev, phone: undefined }));
      } else if (digitsOnly.length < 7) {
        setErrors((prev) => ({ ...prev, phone: "Please enter a valid phone number." }));
      } else {
        setErrors((prev) => ({ ...prev, phone: undefined }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const toggleProductInterest = (id: string) => {
    setFormData((prev) => {
      const has = prev.productInterest.includes(id);
      return {
        ...prev,
        productInterest: has
          ? prev.productInterest.filter((x) => x !== id)
          : [...prev.productInterest, id],
      };
    });
  };

  const toggleGoal = (value: string) => {
    setFormData((prev) => {
      const has = prev.goal.includes(value);
      return {
        ...prev,
        goal: has
          ? prev.goal.filter((x) => x !== value)
          : [...prev.goal, value],
      };
    });
  };

  const validateCurrentStep = () => {
    const nextErrors: Errors = {};

    if (step === 1) {
      if (formData.name.trim().length < 2) nextErrors.name = "Please enter your full name.";
      if (!formData.email.trim()) nextErrors.email = "Work email is required.";
      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        nextErrors.email = "Please enter a valid email address.";
      }
      if (formData.phone.trim() && !/^[+]?[0-9\s\-]{7,15}$/.test(formData.phone.trim())) {
        nextErrors.phone = "Please enter a valid phone number.";
      }
    }

    if (step === 2) {
      if (!formData.company.trim()) nextErrors.company = "Company name is required.";
      if (!formData.companySize) nextErrors.companySize = "Please select your company size.";
      if (!formData.industry) nextErrors.industry = "Please select your industry.";
      if (formData.goal.length === 0) nextErrors.goal = "Please select at least one goal.";
    }

    if (step === 3) {
      if (!formData.date) nextErrors.date = "Please select a preferred date.";
      if (!formData.timeSlot) nextErrors.timeSlot = "Please pick one time slot.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateAndNext = () => {
    if (!validateCurrentStep()) return;
    if (step < 3) setStep((prev) => (prev + 1) as 1 | 2 | 3);
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    setSubmitError(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/book-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          goal: formData.goal.join(", "),
        }),
      });

      if (!response.ok) throw new Error("Failed");

      setSubmitError(false);
      setIsSuccess(true);
    } catch (error) {
      console.error("Submission error:", error);
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    "w-full rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] px-[14px] py-[11px] font-sans text-[14px] text-white outline-none transition-colors duration-150 placeholder:text-[#6B6B6B] focus:border-[rgba(185,28,28,0.6)]";

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1000] flex items-end justify-center overflow-y-auto overflow-x-hidden bg-[rgba(0,0,0,0.85)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[6px] sm:items-center sm:p-5"
          onClick={closeModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative flex max-h-[min(90dvh,920px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.1)] bg-[#111111] sm:rounded-[12px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[#161616] px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/racko-logo.png"
                  alt="Racko"
                  width={128}
                  height={34}
                  className="h-7 w-auto shrink-0 sm:h-8"
                  decoding="async"
                />
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[rgba(255,255,255,0.14)] text-[#A1A1A1] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            {!isSuccess ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 px-4 pb-0 pt-4 sm:px-6">
                  <div className="mb-2 flex flex-wrap justify-between gap-x-2 gap-y-1">
                    {["01 About you", "02 Your company", "03 Pick a slot"].map((label, idx) => (
                      <span
                        key={label}
                        className={`font-mono text-[9px] uppercase tracking-[0.08em] ${
                          step === idx + 1 ? "text-white" : "text-[#9CA3AF]"
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="mb-6 h-[2px] rounded-[1px] bg-[rgba(255,255,255,0.08)]">
                    <div
                      className="h-[2px] rounded-[1px] bg-[#B91C1C] transition-[width] duration-300 ease-out"
                      style={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }}
                    />
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-4 sm:px-6 sm:pb-6">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                    >
                      {step === 1 ? (
                        <>
                          <h3 className="mb-6 font-sans text-[18px] font-bold text-white">
                            Tell us about yourself
                          </h3>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field
                              label="Name"
                              error={errors.name}
                              input={
                                <input
                                  className={`${inputBase} ${errors.name ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                                  placeholder="Full name"
                                  value={formData.name}
                                  onChange={(e) => setField("name", e.target.value)}
                                />
                              }
                            />
                            <Field
                              label="Phone"
                              error={errors.phone}
                              input={
                                <input
                                  type="tel"
                                  className={`${inputBase} ${errors.phone ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                                  placeholder="+91 or international"
                                  value={formData.phone}
                                  onChange={(e) => setField("phone", e.target.value)}
                                  inputMode="numeric"
                                />
                              }
                            />
                          </div>
                          <Field
                            label="Email"
                            error={errors.email}
                            input={
                              <input
                                type="email"
                                className={`${inputBase} ${errors.email ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                                placeholder="Work email"
                                value={formData.email}
                                onChange={(e) => setField("email", e.target.value)}
                              />
                            }
                          />
                        </>
                      ) : null}

                      {step === 2 ? (
                        <>
                          <h3 className="mb-6 font-sans text-[18px] font-bold text-white">
                            Tell us about your company
                          </h3>
                          <Field
                            label="Company Name"
                            error={errors.company}
                            input={
                              <input
                                className={`${inputBase} ${errors.company ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                                placeholder="Company name"
                                value={formData.company}
                                onChange={(e) => setField("company", e.target.value)}
                              />
                            }
                          />
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <CustomSelect
                              label="Company Size"
                              value={formData.companySize}
                              onChange={(val) => setField("companySize", val)}
                              placeholder="Select company size"
                              error={errors.companySize}
                              options={companySizeOptions}
                            />
                            <CustomSelect
                              label="Industry"
                              value={formData.industry}
                              onChange={(val) => setField("industry", val)}
                              placeholder="Select industry"
                              error={errors.industry}
                              options={industryOptions}
                            />
                          </div>

                          <div className="mb-3.5">
                            <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#A1A1A1]">
                              WHAT DO YOU NEED
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {productInterestOptions.map((opt) => {
                                const selected = formData.productInterest.includes(opt.id);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => toggleProductInterest(opt.id)}
                                    className={`rounded-full border px-3 py-2 text-left font-mono text-[10px] font-medium transition-colors duration-150 ${
                                      selected
                                        ? "border-[#B91C1C] bg-[rgba(185,28,28,0.1)] text-white"
                                        : "border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-[#9CA3AF] hover:border-[rgba(255,255,255,0.22)] hover:text-[#D1D5DB]"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mb-3.5">
                            <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#A1A1A1]">
                              GOAL
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {goalOptions.map((opt) => {
                                const selected = formData.goal.includes(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleGoal(opt.value)}
                                    className={`rounded-full border px-3 py-2 text-left font-mono text-[10px] font-medium transition-colors duration-150 ${
                                      selected
                                        ? "border-[#B91C1C] bg-[rgba(185,28,28,0.1)] text-white"
                                        : "border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-[#9CA3AF] hover:border-[rgba(255,255,255,0.22)] hover:text-[#D1D5DB]"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                            {errors.goal ? (
                              <p className="mt-1 text-[11px] text-[#EF4444]">{errors.goal}</p>
                            ) : null}
                          </div>

                          <div className="mt-2 rounded-[6px] border border-[rgba(185,28,28,0.15)] bg-[rgba(185,28,28,0.06)] px-3.5 py-2.5 font-sans text-[12px] leading-[1.6] text-[#A1A1A1]">
                            Our infrastructure specialist will review your profile before the
                            call.
                          </div>
                        </>
                      ) : null}

                      {step === 3 ? (
                        <>
                          <h3 className="mb-6 font-sans text-[18px] font-bold text-white">
                            Choose a time that works
                          </h3>
                          <Field
                            label="Preferred Date"
                            error={errors.date}
                            input={
                              <input
                                type="date"
                                min={today}
                                className={`${inputBase} ${errors.date ? "border-[rgba(239,68,68,0.6)]" : ""}`}
                                value={formData.date}
                                onChange={(e) => setField("date", e.target.value)}
                              />
                            }
                          />

                          <div className="mb-3">
                            <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#A1A1A1]">
                              Preferred Time
                            </label>
                            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3">
                              {timeSlots.map((slot) => {
                                const selected = formData.timeSlot === slot;
                                return (
                                  <button
                                    key={slot}
                                    type="button"
                                    onClick={() =>
                                      setField("timeSlot", selected ? "" : slot)
                                    }
                                    className={`rounded-[6px] border px-2 py-2.5 text-center font-mono text-[11px] transition-all duration-150 ${
                                      selected
                                        ? "border-[#B91C1C] bg-[rgba(185,28,28,0.12)] text-white"
                                        : "border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] text-[#9CA3AF] hover:border-[rgba(255,255,255,0.24)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#E5E7EB]"
                                    }`}
                                  >
                                    {slot}
                                  </button>
                                );
                              })}
                            </div>
                            {errors.timeSlot ? (
                              <p className="mt-1 text-[11px] text-[#EF4444]">{errors.timeSlot}</p>
                            ) : null}
                            <p className="mt-2 font-mono text-[10px] text-[#6B6B6B]">
                              All times in IST (India Standard Time)
                            </p>
                          </div>
                        </>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>

                  <div className="mt-6 border-t border-[rgba(255,255,255,0.06)] pt-5">
                    {step === 3 && submitError ? (
                      <p className="mb-3 text-center font-mono text-[11px] text-[#EF4444]">
                        Something went wrong. Please try again or email us at cloud@racko.in
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between">
                      {step > 1 ? (
                        <button
                          type="button"
                          onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3)}
                          className="font-mono text-[12px] text-[#A1A1A1] transition-colors hover:text-white"
                        >
                          ← Back
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={closeModal}
                          className="font-mono text-[12px] text-[#A1A1A1] transition-colors hover:text-white"
                        >
                          Cancel
                        </button>
                      )}

                      {step < 3 ? (
                        <button
                          type="button"
                          onClick={validateAndNext}
                          className="inline-flex items-center rounded-[6px] bg-[#B91C1C] px-6 py-[11px] font-sans text-[14px] font-medium text-white transition-colors hover:bg-[#DC2626]"
                        >
                          Continue
                          <ChevronRight size={14} className="ml-1.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitError(false);
                            void handleSubmit();
                          }}
                          disabled={isSubmitting}
                          className="inline-flex items-center rounded-[6px] bg-[#B91C1C] px-6 py-[11px] font-sans text-[14px] font-medium text-white transition-colors hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="mr-2 h-4 w-4 rounded-full border-2 border-[rgba(255,255,255,0.3)] border-t-white animate-[spin_0.8s_linear_infinite]" />
                              Scheduling...
                            </>
                          ) : (
                            <>
                              Confirm Meet
                              <ChevronRight size={14} className="ml-1.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-10 text-center sm:px-6 sm:py-12"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(185,28,28,0.3)] bg-[rgba(185,28,28,0.12)]">
                    <Check size={28} color="#B91C1C" />
                  </div>
                </motion.div>
                <h3 className="mb-3 font-sans text-[22px] font-bold text-white">
                  Your Racko Meet is confirmed.
                </h3>
                <p className="mx-auto max-w-[340px] font-sans text-[14px] leading-[1.65] text-[#A1A1A1]">
                  Thanks {formData.name.split(" ")[0] || "there"}. A Racko Cloud specialist will confirm your slot
                  within one business day and reach out to discuss your workload requirements.
                </p>

                <div className="mx-auto mt-6 w-full max-w-[420px] divide-y divide-[rgba(255,255,255,0.08)] rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-5 py-1 text-left">
                  <SummaryRow label="COMPANY" value={formData.company} />
                  <SummaryRow label="DATE" value={formData.date} />
                  <SummaryRow label="TIME" value={`${formData.timeSlot} IST`} />
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-7 font-mono text-[12px] text-[#B91C1C] transition-colors hover:text-[#DC2626]"
                >
                  Close ×
                </button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Field({
  label,
  input,
  error,
}: {
  label: string;
  input: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#A1A1A1]">
        {label}
      </label>
      {input}
      {error ? <p className="mt-1 text-[11px] text-[#EF4444]">{error}</p> : null}
    </div>
  );
}

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
}

function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <div ref={ref} className="relative mb-3.5">
      <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-[#A1A1A1]">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-[6px] bg-[rgba(255,255,255,0.05)] px-[14px] py-[11px] text-left transition-colors duration-150 ${
          error
            ? "border border-[rgba(239,68,68,0.6)]"
            : isOpen
              ? "border border-[rgba(185,28,28,0.6)]"
              : "border border-[rgba(255,255,255,0.12)]"
        }`}
      >
        <span className={`font-sans text-[14px] ${value ? "text-white" : "text-[#8A8A8A]"}`}>
          {selectedLabel ?? placeholder}
        </span>
        <span
          className={`text-xs leading-none text-[#9CA3AF] transition-transform duration-200 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[120] max-h-[240px] overflow-y-auto overflow-x-hidden rounded-[6px] border border-[rgba(255,255,255,0.12)] bg-[#1A1A1A] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {options.map((option, index) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-[14px] py-2.5 text-left transition-colors duration-150 ${
                  isSelected
                    ? "bg-[rgba(185,28,28,0.1)]"
                    : "bg-transparent hover:bg-[rgba(255,255,255,0.04)]"
                } ${index < options.length - 1 ? "border-b border-[rgba(255,255,255,0.05)]" : ""}`}
              >
                <span className={`font-sans text-[13px] ${isSelected ? "text-white" : "text-[#A1A1A1]"}`}>
                  {option.label}
                </span>
                {isSelected ? (
                  <span className="text-xs font-bold text-[#B91C1C]">✓</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="mt-1 text-[11px] text-[#EF4444]">{error}</p> : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-5 gap-y-1 py-3.5 sm:grid-cols-[6.25rem_minmax(0,1fr)] sm:gap-x-6">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[#8A8A8A]">
        {label}
      </span>
      <span className="min-w-0 text-right font-sans text-[13px] leading-snug text-white sm:text-[14px]">
        {value || "—"}
      </span>
    </div>
  );
}
