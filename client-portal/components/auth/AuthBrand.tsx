import Image from 'next/image';
import Link from 'next/link';
 
export function AuthBrand() {
  return (
    <div className="text-center mb-8">
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1e] rounded-md"
      >
        <span className="relative h-11 w-12 shrink-0 overflow-hidden rounded-md">
          <Image
            src="/images/racko-logo1.png"
            alt=""
            width={148}
            height={40}
            priority
            aria-hidden
            className="absolute left-0 top-0 h-11 w-auto max-w-none"
          />
        </span>
        <span className="text-2xl font-bold text-white tracking-tight">Racko</span>
      </Link>
    </div>
  );
}
