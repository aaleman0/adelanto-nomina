import type { Metadata } from "next";
import { Comfortaa } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

const comfortaa = Comfortaa({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-comfortaa",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Backoffice Adelantos",
  description: "Panel operativo para adelantos de nómina.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`h-full antialiased ${comfortaa.variable}`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
