import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado AES-256-GCM para credenciales SUNAT.
 * La llave vive en la variable de entorno CONTAYA_CRYPTO_KEY (32 bytes en base64), FUERA de la base de datos.
 * Formato guardado: "v1:" + base64(iv[12] | tag[16] | datos).
 */
function llave(): Buffer {
  const b64 = (process.env as Record<string, string | undefined>).CONTAYA_CRYPTO_KEY?.trim();
  if (!b64) throw new Error("Falta CONTAYA_CRYPTO_KEY: genera una llave de 32 bytes en base64 y agrégala en Vercel como Secret.");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("CONTAYA_CRYPTO_KEY debe tener exactamente 32 bytes (base64).");
  return k;
}

export function cifrar(texto: string, k: Buffer = llave()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), datos]).toString("base64");
}

export function descifrar(guardado: string, k: Buffer = llave()): string {
  if (!guardado.startsWith("v1:")) throw new Error("Formato de dato cifrado no reconocido.");
  const b = Buffer.from(guardado.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", k, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

export function hayLlave(): boolean {
  try { llave(); return true; } catch { return false; }
}
