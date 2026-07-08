import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CREDENTIALS_PATH = join(process.cwd(), "google_oauth_client.json");
const TOKEN_PATH = join(process.cwd(), "token.json");

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
    if (tokens.refresh_token) {
      const current = JSON.parse(await readFile(TOKEN_PATH, "utf-8"));
      await writeFile(
        TOKEN_PATH,
        JSON.stringify({ ...current, ...tokens }, null, 2)
      );
    }
  });

  return oAuth2Client;
}
