# syntax=docker/dockerfile:1
#
# Imagen de producción para Cloud Run. Multi-stage:
#   deps    → instala dependencias con pnpm (capa cacheable)
#   builder → compila Next en modo standalone
#   runner  → imagen mínima, no-root, sólo los artefactos que server.js necesita
#
# Sin secretos en la imagen: los reales se inyectan en runtime (Cloud Run /
# Secret Manager). Los placeholders de build sólo existen en la etapa builder.

# --- deps -------------------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
# pnpm 9 (el lockfile es v9.0). frozen-lockfile = instalación reproducible.
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder ----------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* se inlinea en el bundle EN BUILD, así que debe ser el valor real
# del entorno (lo pasa el job de deploy con --build-arg, distinto por prod/staging).
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Placeholders para el build: algunos módulos leen estas vars al importarse
# durante `next build`. NO son secretos y NO llegan a la imagen final (se quedan
# en esta etapa); en runtime Cloud Run inyecta los valores reales. Mismos que CI.
ENV NEXT_TELEMETRY_DISABLED=1 \
    SUPABASE_URL=https://build.invalid/rest/v1/ \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder \
    SUPABASE_ANON_KEY=build-placeholder

RUN pnpm build

# --- runner -----------------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080

# El servidor standalone trae su propio node_modules podado. `public` y
# `.next/static` NO se copian solos: hay que copiarlos a mano (docs de Next 16).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Correr como usuario sin privilegios (el usuario `node` viene en la imagen).
USER node
EXPOSE 8080

# Cloud Run inyecta PORT; server.js lo respeta vía la env var.
CMD ["node", "server.js"]
