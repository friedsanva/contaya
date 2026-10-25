import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contaya — Tu contabilidad al día, ya",
  description: "Oficina contable virtual para MYPEs y emprendedores del Perú.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Nunito+Sans:wght@400;600;700&display=swap" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
