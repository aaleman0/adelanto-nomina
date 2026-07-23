import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Se emite en modo *Report-Only*: el navegador reporta violaciones en consola
 * pero no bloquea nada. Es el despliegue estándar de una CSP nueva — permite
 * detectar falsos positivos sin romper la aplicación.
 *
 * Para activarla, cambia la clave a `Content-Security-Policy` más abajo, tras
 * verificar que la consola no reporta violaciones al navegar por la app.
 *
 * `'unsafe-inline'` en script-src es necesario porque Next inyecta scripts
 * inline para la hidratación. Eliminarlo requiere una CSP basada en nonce
 * generado en `proxy.ts`, que es el siguiente escalón de endurecimiento.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Impide que el navegador adivine el tipo MIME (vector de XSS con subidas).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Bloquea el embebido en iframes: protege contra clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // No filtrar la ruta completa a terceros al navegar hacia fuera.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva APIs del navegador que esta app no usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Fuerza HTTPS durante 2 años, incluidos subdominios.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  // Salida autocontenida para Docker: produce `.next/standalone/server.js` con
  // un node_modules podado, en vez de necesitar todo el árbol de dependencias.
  // La imagen final solo copia standalone + .next/static + public.
  output: "standalone",

  // NOTA: no hace falta `sharp` en la imagen. El único uso de `next/image`
  // (el avatar de Google en `user-controls.tsx`) va con `unoptimized`, así que
  // Next no pasa la imagen por su optimizador. Si algún día se quita ese
  // `unoptimized`, habrá que añadir `images.remotePatterns` **y** asegurar que
  // `sharp` viaje en el standalone (con pnpm no basta un glob a
  // `node_modules/sharp`: las transitivas no se hoistean a la raíz).

  // No revelar la versión de Next en las respuestas.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
