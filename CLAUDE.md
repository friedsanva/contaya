# Contaya — guía para Claude

Oficina contable virtual para MYPEs del Perú (IPCOM Technologies Perú). Dueño: Fried (no es programador: explicar en español sencillo).

## Reglas
- Interfaz, textos y mensajes de error **en español de Perú**. Tono cercano y claro.
- Marca: Contaya, "Tu contabilidad al día, ya." Colores en `tailwind.config.ts` (tinta, hoja, verde, sol). Tipos: Rubik (títulos) y Nunito Sans (texto).
- La lógica tributaria vive en funciones puras (`lib/ubl.ts`, `lib/calculos.ts`) y **toda regla nueva lleva su prueba** en `tests/`.
- Los permisos los garantiza la base de datos (RLS en `supabase/migrations`). Nunca confiar solo en la interfaz. Cambios de esquema = nueva migración numerada, nunca editar una ya aplicada.
- `SUPABASE_SERVICE_ROLE_KEY` solo en servidor (`lib/supabase/admin.ts`) y solo tras `exigirContador()`.
- Solo cuentan para el cierre los comprobantes **validados**. Notas de crédito restan. Moneda extranjera necesita tipo de cambio.
- La plataforma prepara y cuadra; la presentación en SUNAT (Formulario 621, Renta anual) la hace el contador con su Clave SOL.
- **El modelo de proceso oficial está en `docs/proceso-mensual.md`. Léelo antes de cambiar el flujo.**
- Compras y ventas vienen del **SIRE** (propuestas RCE y RVIE). El cliente solo sube ventas/NC/guías cuando se le pide.
- Objetivo: el contador solo ve excepciones (semáforo). "Cero errores silenciosos": toda diferencia se muestra.
- Credenciales SUNAT: siempre cifradas (`lib/cripto.ts`, llave `CONTAYA_CRYPTO_KEY`), nunca devueltas al navegador, cada uso en `bitacora`. Solo APIs oficiales de SUNAT; nunca automatizar el portal SOL.
- La IA explica; nunca calcula impuestos.

## Comandos
`npm test` · `npm run typecheck` · `npm run build` · `npm run dev`

## Hoja de ruta
Ver la tabla de fases en `docs/proceso-mensual.md`.
