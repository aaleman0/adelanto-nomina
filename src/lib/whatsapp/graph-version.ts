/**
 * Versión de la Graph API de Meta, centralizada en un solo lugar.
 *
 * Antes estaba fijada como `v18.0` en dos archivos (client.ts y templates.ts);
 * esa versión quedó fuera de la ventana de soporte de Meta. Se puede
 * sobreescribir con `WHATSAPP_GRAPH_VERSION` sin tocar código cuando Meta rote
 * versiones, para no volver a quedar clavados en una obsoleta.
 */
export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
