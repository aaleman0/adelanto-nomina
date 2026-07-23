# syntax=docker/dockerfile:1
#
# Imagen de producción para Cloud Run. Multi-stage:
#   deps    → instala dependencias con pnpm (capa cacheable)
#   builder → compila Next en modo standalone
#   runner  → imagen mínima, no-root, sólo los artefactos que server.js necesita
#
# Sin secretos en la imagen: los reales se inyectan en runtime (Cloud Run /
# Secret Manager). Los placeholders de build viven sólo en el RUN que los usa.
#
# La versión de pnpm sale de `packageManager` en package.json (corepack), para
# que Docker, CI y local usen exactamente la misma. Importa: `pnpm-workspace.yaml`
# usa `ignoredBuiltDependencies`, sintaxis de pnpm 10; con pnpm 9 el install falla
# con "packages field missing or empty".

# --- deps -------------------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# package.json debe estar antes de corepack: de ahí lee la versión de pnpm.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare --activate
RUN pnpm install --frozen-lockfile

# --- builder ----------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare --activate

# NEXT_PUBLIC_* se inlinea en el bundle EN BUILD, así que debe ser el valor real
# del entorno (lo pasa el job de deploy con --build-arg, distinto por prod/staging).
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Placeholders sólo para que el build no falle: algunos módulos leen estas vars
# al importarse durante `next build`. Van inline en el RUN (no como ENV) para que
# no queden en los metadatos de la capa. En runtime Cloud Run inyecta los reales.
RUN SUPABASE_URL=https://build.invalid/rest/v1/ \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder \
    SUPABASE_ANON_KEY=build-placeholder \
    pnpm build

# --- runner -----------------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080

# El servidor standalone trae su propio node_modules podado. `public` y
# `.next/static` NO se copian solos: hay que copiarlos a mano (docs de Next 16).
# Verificado contra un build real: estos tres son exactamente los artefactos que
# `server.js` necesita (no hace falta `sharp`; ver nota en next.config.ts).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Correr como usuario sin privilegios (el usuario `node` viene en la imagen).
USER node
EXPOSE 8080

# Cloud Run inyecta PORT; server.js lo respeta vía la env var.
CMD ["node", "server.js"]
