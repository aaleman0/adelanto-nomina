import type { Metadata } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/ui/motion-provider";

/**
 * Figtree: geométrica humanista de x-altura alta. Se eligió por legibilidad a
 * un brazo de distancia y bajo luz fuerte —el caso del operador en piso—, con
 * formas abiertas que no se confunden (1/l/I, 0/O) al leer RFC y montos.
 * JetBrains Mono: solo para datos que se comparan carácter a carácter (RFC,
 * CLABE, folios) y columnas numéricas.
 */
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-figtree",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adelanto de nómina",
  description: "Sistema de operación para adelantos de nómina.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`h-full antialiased ${figtree.variable} ${jetbrains.variable}`}>
      <body className="min-h-full">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
