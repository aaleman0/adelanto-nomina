/**
 * Autorización OAuth de Google, una sola vez.
 *
 * Genera `token.json` en la raíz del proyecto, que es lo que
 * `src/lib/google/auth.ts` necesita para copiar la plantilla del contrato en
 * Google Docs y exportarla a PDF. Sin este token, el autollenado del contrato
 * falla y toda la solicitud de firma se cae.
 *
 * USO
 *   1. Descarga las credenciales OAuth de Google Cloud Console
 *      (APIs & Services → Credentials → OAuth client ID → tipo "Desktop app")
 *      y guárdalas como `google_oauth_client.json` en la raíz.
 *   2. Activa las APIs de Google Drive y Google Docs en ese proyecto de GCP.
 *   3. Ejecuta:  pnpm dlx tsx scripts/google-auth.ts
 *   4. Se abre (o copias) una URL, inicias sesión con la cuenta DUEÑA de la
 *      plantilla del contrato y apruebas el acceso.
 *   5. El script guarda `token.json`. Listo, no hay que repetirlo salvo que
 *      revoques el acceso o cambies de cuenta.
 *
 * La cuenta con la que autorices debe tener acceso al documento plantilla
 * (TEMPLATE_DOC_ID en src/lib/google/contract-pdf.ts).
 */

import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";

const CREDENTIALS_PATH = join(process.cwd(), "google_oauth_client.json");
const TOKEN_PATH = join(process.cwd(), "token.json");

// Debe coincidir con el de src/lib/google/auth.ts: Google exige que el redirect
// del intercambio de código sea idéntico al de la generación de la URL.
const REDIRECT_URI = "http://localhost:3333";
const PORT = 3333;

// Los que usa contract-pdf.ts: copiar la plantilla y borrarla (drive), exportar
// a PDF (drive) y sustituir el texto (documents). `drive` (completo) es
// necesario porque se copia un documento existente, no uno creado por la app.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

async function main() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(
      `\n❌ No existe ${CREDENTIALS_PATH}\n\n` +
        "Descarga las credenciales OAuth (tipo Desktop app) de Google Cloud\n" +
        "Console y guárdalas ahí antes de correr este script.\n",
    );
    process.exit(1);
  }

  const credentials = JSON.parse(await readFile(CREDENTIALS_PATH, "utf-8"));
  const clientBlock = credentials.installed ?? credentials.web;

  if (!clientBlock?.client_id || !clientBlock?.client_secret) {
    console.error(
      "\n❌ google_oauth_client.json no tiene client_id/client_secret.\n" +
        "¿Descargaste el JSON de un OAuth client ID (no una API key)?\n",
    );
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    clientBlock.client_id,
    clientBlock.client_secret,
    REDIRECT_URI,
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    // offline + prompt consent fuerza que Google devuelva un refresh_token, no
    // solo un access token de corta vida. Sin refresh_token, el servidor
    // dejaría de funcionar en una hora.
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log(
    "\n1. Abre esta URL en tu navegador e inicia sesión con la cuenta dueña\n" +
      "   de la plantilla del contrato:\n\n" +
      `   ${authUrl}\n\n` +
      "2. Aprueba el acceso. Al terminar, esta terminal guardará el token.\n",
  );

  const code = await waitForOAuthCode();

  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    console.warn(
      "\n⚠️  Google no devolvió refresh_token. Suele pasar si ya habías\n" +
        "   autorizado antes. Revoca el acceso en\n" +
        "   https://myaccount.google.com/permissions y vuelve a correr esto,\n" +
        "   o el token caducará en ~1 hora.\n",
    );
  }

  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✅ token.json guardado en ${TOKEN_PATH}\n`);
  process.exit(0);
}

/**
 * Levanta un servidor local efímero en el puerto del redirect, espera a que
 * Google redirija con `?code=...`, lo devuelve y cierra el servidor.
 */
function waitForOAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Autorización denegada. Puedes cerrar esta pestaña.");
        server.close();
        reject(new Error(`Google devolvió un error de autorización: ${error}`));
        return;
      }

      if (!code) {
        // Ignora peticiones sueltas (favicon, etc.) sin resolver.
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body style='font-family:sans-serif;text-align:center;padding-top:3rem'>" +
          "<h2>✅ Autorización completada</h2>" +
          "<p>Ya puedes cerrar esta pestaña y volver a la terminal.</p>" +
          "</body></html>",
      );
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(PORT, () => {
      console.log(`   (esperando el redirect de Google en ${REDIRECT_URI} …)\n`);
    });
  });
}

main().catch((error) => {
  console.error("\n❌ Falló la autorización:", error instanceof Error ? error.message : error);
  process.exit(1);
});
