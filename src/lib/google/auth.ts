import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Rutas de las credenciales de Google. Configurables por entorno porque en un
 * contenedor no viven en el directorio de trabajo: Cloud Run monta los secretos
 * en su propia ruta (p. ej. `/secrets/google/token.json`) y no se puede montar
 * un archivo suelto dentro de `/app` sin tapar la app. En local, el default
 * mantiene el comportamiento de siempre.
 */
const CREDENTIALS_PATH =
  process.env.GOOGLE_OAUTH_CLIENT_PATH || join(process.cwd(), "google_oauth_client.json");
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || join(process.cwd(), "token.json");

/**
 * Las credenciales también pueden venir COMO CONTENIDO en una variable de
 * entorno, no solo como archivo. Hay plataformas (Railway, Fly, Heroku) donde no
 * existe forma de montar un archivo secreto: sin esto, la generación del PDF
 * falla en producción con un ENOENT que desde fuera se ve como "no se pudo
 * generar tu contrato", sin pista de la causa.
 *
 * Precedencia: la variable con el JSON gana sobre el archivo.
 */
async function leerCredencial(
  json: string | undefined,
  ruta: string,
  queEs: string,
): Promise<Record<string, unknown>> {
  if (json && json.trim()) {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error(`El JSON de ${queEs} en la variable de entorno no es válido.`);
    }
  }
  if (!existsSync(ruta)) {
    throw new Error(
      `Faltan las credenciales de Google (${queEs}). Define su JSON en la variable de ` +
        `entorno correspondiente, o monta el archivo en ${ruta}.`,
    );
  }
  return JSON.parse(await readFile(ruta, "utf-8"));
}

export async function getGoogleAuthClient() {
  const credentials = await leerCredencial(
    process.env.GOOGLE_OAUTH_CLIENT_JSON,
    CREDENTIALS_PATH,
    "google_oauth_client.json",
  );

  // El JSON de OAuth trae las llaves bajo "installed" (app de escritorio) o
  // "web", según cómo se creó el cliente en Google Cloud.
  const { client_id, client_secret } = (credentials.installed ??
    credentials.web) as { client_id: string; client_secret: string };

  const REDIRECT_URI = "http://localhost:3333";

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    REDIRECT_URI
  );

  const token = await leerCredencial(
    process.env.GOOGLE_TOKEN_JSON,
    TOKEN_PATH,
    "token.json (genéralo con: pnpm dlx tsx scripts/google-auth.ts)",
  );
  oAuth2Client.setCredentials(token);

  oAuth2Client.on("tokens", async (tokens) => {
    if (!tokens.refresh_token) return;
    // En producción el token viene de un secreto montado de SOLO LECTURA, así
    // que este guardado falla — y sin capturarlo sería un unhandled rejection
    // que tumba el proceso. No es fatal: el cliente ya tiene las credenciales en
    // memoria; sólo se pierde la persistencia del refresh token rotado.
    // Con el token en una variable de entorno no hay archivo que actualizar: el
    // refresh token sigue sirviendo en memoria y se re-lee en cada arranque.
    if (process.env.GOOGLE_TOKEN_JSON?.trim()) return;
    try {
      const current = JSON.parse(await readFile(TOKEN_PATH, "utf-8"));
      await writeFile(
        TOKEN_PATH,
        JSON.stringify({ ...current, ...tokens }, null, 2)
      );
    } catch (error) {
      console.warn(
        `[google] No se pudo persistir el token en ${TOKEN_PATH} (¿montaje de solo lectura?):`,
        error instanceof Error ? error.message : error
      );
    }
  });

  return oAuth2Client;
}
