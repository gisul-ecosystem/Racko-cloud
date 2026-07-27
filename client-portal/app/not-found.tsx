import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-6">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-crimson-500">
          404
        </p>
        <h1 className="mt-4 font-sans text-[48px] font-extrabold leading-tight text-white">
          Page not found.
        </h1>
        <p className="mx-auto mt-4 max-w-[620px] font-sans text-[16px] text-[#6B6B6B]">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex font-mono text-[13px] text-crimson-500 transition-colors duration-150 hover:text-crimson-400"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
