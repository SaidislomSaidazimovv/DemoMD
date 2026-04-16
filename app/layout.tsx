import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tasdiq — Construction Verification",
  description: "Tamper-evident construction milestone verification for banks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
