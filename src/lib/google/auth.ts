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

export async function getGoogleAuthClient() {
  const credentialsRaw = await readFile(CREDENTIALS_PATH, "utf-8");
  const credentials = JSON.parse(credentialsRaw);

  const { client_id, client_secret } =
    credentials.installed ?? credentials.web;

  const REDIRECT_URI = "http://localhost:3333";

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    REDIRECT_URI
  );

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      "No existe token.json. Ejecuta primero: pnpm dlx tsx scripts/google-auth.ts"
    );
  }

  const token = JSON.parse(await readFile(TOKEN_PATH, "utf-8"));
  oAuth2Client.setCredentials(token);

  oAuth2Client.on("tokens", async (tokens) => {
    if (!tokens.refresh_token) return;
    // En producción el token viene de un secreto montado de SOLO LECTURA, así
    // que este guardado falla — y sin capturarlo sería un unhandled rejection
    // que tumba el proceso. No es fatal: el cliente ya tiene las credenciales en
    // memoria; sólo se pierde la persistencia del refresh token rotado.
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
