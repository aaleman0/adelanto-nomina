/**
 * Proxy de autenticación para el backoffice (Next.js 16+).
 *
 * Responsabilidades:
 * 1. Refrescar el token de sesión de Supabase en cada request (mantiene la
 *    sesión viva sin que el usuario tenga que hacer nada).
 * 2. Redirigir a /login si no hay sesión activa en rutas protegidas.
 * 3. Redirigir al dashboard si ya hay sesión y el usuario visita /login.
 *
 * Rutas públicas (sin sesión requerida):
 * - /login                          → página de autenticación
 * - /auth/callback                  → callback de OAuth
 * - /api/webhooks/*                 → webhooks externos (Meta, EasyLex)
 * - /api/health/*                   → health checks
 * - /api/tasks/*                    → workers invocados por Cloud Tasks
 */

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware-client";

/** Rutas que no requieren sesión. */
const PUBLIC_PATHS = ["/login", "/auth/callback"];

/**
 * Prefijos de página pública (sin sesión). `/solicitar/<token>` es el
 * auto-servicio del EMPLEADO (que no tiene cuenta): la autenticación es el token
 * firmado del link, no una sesión de backoffice.
 */
const PUBLIC_PATH_PREFIXES = ["/solicitar/"];

/**
 * Prefijos de API que no requieren sesión.
 *
 * No son rutas abiertas: cada una se autentica por su cuenta —los webhooks por
 * firma HMAC o secreto compartido, y los workers de `/api/tasks/` por el token
 * OIDC que emite Cloud Tasks—. Quedan fuera del gate de sesión porque quien las
 * llama es una máquina y no tiene cookie de navegador.
 */
const PUBLIC_API_PREFIXES = ["/api/webhooks/", "/api/health/", "/api/tasks/"];

/**
 * Rutas públicas exactas. `/api/health` (el endpoint raíz, sin sub-ruta) es
 * público, pero se lista aparte —en vez de como prefijo `/api/health`— para que
 * un futuro `/api/health-xyz` NO quede público por accidente. Los sub-endpoints
 * (`/api/health/whatsapp`) entran por el prefijo `/api/health/`.
 */
const PUBLIC_API_EXACT = ["/api/health"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pasar siempre los assets estáticos sin procesar.
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Crear la respuesta base que el middleware-client puede mutar (cookies de sesión).
  const response = NextResponse.next({ request });

  let user = null;

  try {
    const { supabase } = createMiddlewareClient(request, response);
    // Refrescar la sesión. Supabase actualiza las cookies en la respuesta si el
    // token de acceso expiró y el refresh token sigue siendo válido.
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // Si faltan variables de entorno (SUPABASE_ANON_KEY), tratamos al usuario
    // como no autenticado para no crashear el servidor en desarrollo.
    user = null;
  }

  const isPublic = isPublicPath(pathname);

  // Usuario sin sesión intentando acceder a ruta protegida → /login
  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    // Guardar la URL original para redirigir después del login.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Usuario con sesión intentando acceder a /login → dashboard
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  /*
   * Aplicar el proxy a todas las rutas excepto:
   * - Archivos estáticos de Next.js (_next/static, _next/image)
   * - Imágenes y assets públicos con extensión conocida
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
