import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifrado AES-256-GCM para credenciales SUNAT.
 * La llave vive en la variable de entorno CONTAYA_CRYPTO_KEY, FUERA de la base de datos.
 * Acepta 32 bytes en base64 o, más simple, cualquier frase secreta de 32 caracteres o más
 * (se convierte en llave con SHA-256). Formato guardado: "v1:" + base64(iv[12] | tag[16] | datos).
 */
export function llaveDesde(valor: string): Buffer {
  const v = valor.trim();
  const b = /^[A-Za-z0-9+/]{43}=$/.test(v) ? Buffer.from(v, "base64") : null;
  if (b && b.length === 32) return b;
  if (v.length < 32) throw new Error("CONTAYA_CRYPTO_KEY debe tener al menos 32 caracteres.");
  return createHash("sha256").update(v, "utf8").digest();
}

function llave(): Buffer {
  const v = (process.env as Record<string, string | undefined>).CONTAYA_CRYPTO_KEY;
  if (!v?.trim()) throw new Error("Falta CONTAYA_CRYPTO_KEY: agrégala en Vercel como Secret (una frase secreta de 32 caracteres o más).");
  return llaveDesde(v);
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
