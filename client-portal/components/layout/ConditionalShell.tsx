'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';
import BookDemoModal from '../ui/BookDemoModal';

const NO_SHELL_ROUTES = ['/dashboard', '/console', '/login', '/register', '/verify-email'];

export default function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideShell = NO_SHELL_ROUTES.some((route) => pathname.startsWith(route));

  if (hideShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
      <BookDemoModal />
    </>
  );
}
