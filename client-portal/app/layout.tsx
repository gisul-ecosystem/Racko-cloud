import type { Metadata } from "next";

import { DemoModalProvider } from "@/components/ui/DemoModalContext";
import ConditionalShell from "@/components/layout/ConditionalShell";
import { GeistMono, GeistSans, fontVariables } from "@/lib/fonts";
import AuthProviderGate from "@/components/layout/AuthProviderGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Racko",
  description: "Racko builds dark enterprise infrastructure experiences for modern teams.",
  icons: {
    icon: "/images/faviconRacko.png",
    shortcut: "/images/faviconRacko.png",
    apple: "/images/faviconRacko.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontVariables} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-bg-900 text-text-body font-sans antialiased">
        <DemoModalProvider>
          <AuthProviderGate>
            <ConditionalShell>
              {children}
            </ConditionalShell>
          </AuthProviderGate>
        </DemoModalProvider>
      </body>
    </html>
  );
}
