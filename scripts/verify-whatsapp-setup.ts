#!/usr/bin/env node
/**
 * Script de verificación de setup de WhatsApp
 * 
 * Uso:
 *   npx ts-node scripts/verify-whatsapp-setup.ts
 * 
 * Verifica:
 *   - Variables de entorno
 *   - Conexión a Supabase
 *   - Tablas requeridas
 *   - Endpoint de health check
 */

import { validateWhatsAppEnv } from "../src/lib/env";

console.log("🔍 Verificando setup de WhatsApp...\n");

// 1. Verificar variables de entorno
console.log("📋 Variables de entorno:");
const envCheck = validateWhatsAppEnv();
if (envCheck.ok) {
  console.log("  ✅ Todas las variables de entorno están configuradas");
} else {
  console.log("  ⚠️  Variables faltantes:");
  envCheck.errors.forEach((err) => console.log(`    - ${err}`));
  console.log("\n💡 Tip: Configura las variables en tu archivo .env.local");
}

// 2. Verificar health endpoint
console.log("\n🏥 Health Check:");
fetch("http://localhost:3000/api/health/whatsapp")
  .then(async (res) => {
    const data = await res.json();
    if (data.ok) {
      console.log("  ✅ WhatsApp module está healthy");
      console.log(`  📊 Supabase: ${data.checks.supabase ? "✅" : "❌"}`);
      console.log(`  📊 Tablas: ${Object.values(data.checks.tables).every(Boolean) ? "✅" : "❌"}`);
      console.log(`  📊 Configurado: ${data.whatsappConfigured ? "✅" : "⚠️"}`);
    } else {
      console.log("  ❌ WhatsApp module no está healthy");
      if (data.errors) {
        data.errors.forEach((err: string) => console.log(`    - ${err}`));
      }
    }
  })
  .catch((err) => {
    console.log("  ❌ No se pudo conectar al health endpoint");
    console.log(`     Error: ${err.message}`);
    console.log("\n💡 Tip: Asegúrate de que el servidor esté corriendo (pnpm dev)");
  });

console.log("\n✅ Verificación completada");
