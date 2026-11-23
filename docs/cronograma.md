# Contaya — Cronograma de trabajo (v1, 21/11/2026)

Meta: llevar con Contaya el **periodo noviembre 2026 de 3 clientes piloto** y declararlo en diciembre.

## Cómo trabajamos

- **Claude** avanza cada día hábil (tarea programada a las 6:34 a. m., hora de Lima): toma la tarea del día de la tabla, la programa con sus pruebas y abre un **Pull Request (PR)** en GitHub. Nunca aprueba su propio trabajo.
- **Fried aprueba**: abre el PR, prueba el cambio en el enlace de vista previa de Vercel que aparece en el PR y, si está bien, presiona **Merge**. Al aprobar, Vercel publica solo y las migraciones de base de datos se aplican solas.
- Si Fried pide cambios en un comentario del PR, Claude los atiende primero al día siguiente.
- Si hay **2 PR sin aprobar**, Claude no abre otro: ese día solo recuerda lo pendiente.
- Lo marcado **Fried** o **Contador** no lo puede hacer Claude (cuentas, claves, firmas, SUNAT).
- Estados: `pendiente`, `en PR #n`, `hecho`, `bloqueado: motivo`. Claude actualiza esta tabla en cada PR.

## Configuración única de Fried (una sola vez)

| # | Qué | Dónde | Estado |
|---|---|---|---|
| F1 | Aprobar el PR "Automatización diaria" | GitHub → Pull requests | pendiente |
| F2 | Secreto `SUPABASE_DB_URL` (migraciones automáticas) | Supabase → Connect → Session pooler → URI (con tu contraseña de BD) → GitHub → Settings → Secrets and variables → Actions → New repository secret | pendiente |
| F3 | Variable `CONTAYA_CRYPTO_KEY` (Secret, frase de 32+ caracteres) y Redeploy | Vercel → contaya → Environment Variables | pendiente |
| F4 | Exportar la propuesta SIRE de compras y ventas de octubre de IPCOM y subirla en Contaya → botón SIRE | SIRE de IPCOM | pendiente |
| F5 | Usuario secundario SOL con perfil SIRE + Credenciales de API SUNAT de IPCOM, registradas en Contaya | SUNAT Operaciones en Línea | pendiente |
| F6 | Elegir los 3 clientes piloto | — | pendiente |
| F7 | Firmas de contrato y autorización SIRE de los pilotos | — | pendiente |
| F8 | `ANTHROPIC_API_KEY` en Vercel (para el asistente IA) | console.anthropic.com → API Keys | pendiente |

## Plan día a día

| Fecha | Tarea | Quién | Estado |
|---|---|---|---|
| Sáb 21/11 | Automatización: revisión automática de PR, migraciones automáticas, llave de cifrado como frase, este cronograma | Claude | en PR |
| Lun 23/11 | **2B-1** Validez de cada comprobante en el semáforo (servicio oficial "Consulta integrada de comprobantes de pago" de SUNAT, con las mismas credenciales de API; si no hay credenciales, el semáforo lo indica) | Claude | en PR #2 |
| Lun 23/11 | F4 · Primera prueba real con archivo SIRE de IPCOM | Fried | pendiente |
| Mar 24/11 | **2B-2** RUC activo y habido de cada proveedor (Decolecta/OpenRUC) con caché de 7 días; proveedor no habido = rojo | Claude | pendiente |
| Mié 25/11 | **2C-1** IGV proyectado del mes en el portal del cliente (tarjeta clara: "Este mes pagarías aprox. S/ X") | Claude | pendiente |
| Mié 25/11 | F5 · Credenciales API de IPCOM | Fried | pendiente |
| Jue 26/11 | **2C-2** Calendario de vencimientos por último dígito del RUC (cronograma oficial SUNAT 2026 y 2027) y fecha límite en portal y cartera | Claude | pendiente |
| Jue 26/11 | Revisar el resumen de octubre de IPCOM contra su cálculo manual | Contador | pendiente |
| Vie 27/11 | **2C-3** Aviso del día 20 cuando el IGV proyectado es alto (aviso dentro de la app; texto con las reglas de crédito fiscal, sin sugerir compras innecesarias) | Claude | pendiente |
| Vie 27/11 | F6 · 3 pilotos elegidos | Fried | pendiente |
| Lun 30/11 | Documentos legales: contrato de servicio, autorización de acceso SIRE y aviso de privacidad (Ley 29733) como borradores en `docs/legal/` + página `/privacidad` | Claude | pendiente |
| Mar 01/12 | **Aprobación con un clic**: resumen validado del mes y, al aprobar, aceptar la propuesta en el SIRE por API | Claude | pendiente |
| Mar 01/12 | Descarga SIRE de noviembre de los pilotos (automática o archivo) | Contaya / Fried | pendiente |
| Mié 02/12 | Ajustes según el uso real de los pilotos | Claude | pendiente |
| Mié 02/12 | F7 · Firmas · F8 · Llave de IA | Fried | pendiente |
| Jue 03/12 | **2D-1** Asistente IA del cliente en el portal ("¿cuánto pago?", "¿por qué subió mi IGV?"); explica, nunca calcula | Claude | pendiente |
| Vie 04/12 | **2D-2** Explicación de cada excepción para el contador | Claude | pendiente |
| Vie 04/12 | Resolver excepciones del cierre de noviembre | Contador | pendiente |
| Lun 07/12 | Descarga automática nocturna del SIRE de todos los clientes con credenciales + bitácora visible | Claude | pendiente |
| Mar 08/12 – Mié 09/12 | Feriados | — | — |
| Jue 10/12 – Vie 11/12 | Correcciones del cierre piloto | Claude | pendiente |
| Lun 14/12 – Vie 18/12 | Declaraciones de los pilotos según su vencimiento; solo correcciones urgentes | Contador / Claude | pendiente |
| Vie 18/12 | Revisión del piloto y propuesta de plan de enero (WhatsApp propio, guías, planillas, dominio contaya.pe) | Claude + Fried | pendiente |

## Reglas para Claude en cada tarea

1. Leer `CLAUDE.md` y `docs/proceso-mensual.md` antes de programar.
2. Toda regla tributaria nueva lleva su prueba en `tests/`. Cambios de base de datos = nueva migración numerada.
3. `npm test`, `npm run typecheck` y `npm run build` deben pasar antes de abrir el PR.
4. PR en español sencillo: qué cambió, cómo probarlo en la vista previa, qué debe hacer Fried.
5. Nunca manejar claves ni credenciales de Fried o de clientes; nunca tocar Supabase/Vercel directamente; solo APIs oficiales de SUNAT.
6. Si una tarea no puede terminarse, abrir el PR con lo avanzado y marcarla `bloqueado: motivo`.
