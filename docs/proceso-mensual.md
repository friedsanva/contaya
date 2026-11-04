# Contaya — Modelo de proceso mensual (v2, aprobado 04/11/2026)

Principio: **automatizar al máximo; el contador solo revisa excepciones y aprueba.**
"Cero margen de error" = **cero errores silenciosos**: toda diferencia se detecta y se muestra; nada se declara sin el visto bueno del contador.

## Fuentes de datos

| Dato | Fuente principal | Respaldo |
|---|---|---|
| Ventas | **Propuesta RVIE del SIRE** (API SUNAT) | XML subido por el cliente / archivo exportado del SIRE |
| Compras | **Propuesta RCE del SIRE** (API SUNAT) | Archivo exportado del SIRE / XML puntual |
| Guías de remisión | XML de GRE subido por el cliente (Fase 3) | — |
| RUC del cliente y proveedores | Consulta RUC (Decolecta / OpenRUC) | Manual |

El cliente **ya no sube compras**. Solo ventas, notas de crédito y guías cuando el sistema se lo pida.
Todo comprobante electrónico pasa por SUNAT, por eso el SIRE trae lo emitido con SEE-SOL, con el sistema propio del cliente o con un OSE/PSE. Conectarse al sistema de facturación del cliente es opcional (solo para ver ventas en tiempo real).

## Flujo

```mermaid
flowchart TD
    S[(SUNAT<br/>API SIRE · Validez CPE · RUC)] -->|cada noche| C1

    subgraph AUTO["Contaya trabaja solo"]
      C1[Descarga ventas RVIE y compras RCE de cada cliente] --> C2[Valida cada comprobante:<br/>vigente, proveedor habido, IGV correcto, duplicados,<br/>detracción, bancarización, moneda]
      C2 --> C3{Semáforo}
      C3 -- Verde --> C4[Validado automáticamente]
      C3 -- Ámbar / Rojo --> C5[Excepción para el contador]
      C4 --> C6[IGV y Renta proyectados del mes]
      C6 --> C7{¿Día 20 y el IGV proyectado es alto?}
      C7 -- Sí --> C8[Aviso al cliente en lenguaje sencillo]
    end

    subgraph CLI["Cliente · solo si hace falta"]
      K1[Sube guías o sustentos que el sistema le pida]
      K2[Pregunta al asistente IA]
    end

    subgraph CONT["Contador · excepciones y aprobación"]
      P1[Resuelve excepciones] --> P2[Revisa el RESUMEN VALIDADO]
      P2 --> P3[Aprueba con un clic]
      P3 --> P4[Contaya acepta la propuesta en el SIRE vía API]
      P4 --> P5[Contador presenta el 621 y registra el N.° de orden]
    end

    C5 --> P1
    C4 --> P2
    C8 --> K2
    P5 --> F[Cliente ve: Declarado · monto · fecha de pago]
```

## Semáforo (reglas en `lib/sire/semaforo.ts`, con pruebas)

- **Rojo** (bloquea): comprobante anulado o no válido; IGV que no cuadra con la base; boleta usada como crédito fiscal; RUC del proveedor no habido o de baja; duplicado.
- **Ámbar** (revisar): moneda extranjera sin tipo de cambio; emitido fuera del periodo; posible detracción sin constancia; monto ≥ S/ 2,000 sin medio de pago (bancarización); diferencia entre SIRE y XML del cliente.
- **Verde**: todo lo demás → se valida automáticamente con origen `sire`.

## Aviso "IGV alto" (día 20)

Solo sugiere **adelantar compras que el negocio igual iba a hacer** y que cumplan los requisitos del crédito fiscal (causalidad, factura electrónica, proveedor habido, bancarización, detracción). Nunca sugiere compras innecesarias: comprar S/ 118 para ahorrar S/ 18 es perder dinero.

## Credenciales SUNAT de cada cliente

- Preferir **usuario secundario SOL** con perfil SIRE, nunca la clave principal.
- Credenciales de API (client_id / client_secret) + usuario y clave SOL, **cifradas con AES-256-GCM**; la llave (`CONTAYA_CRYPTO_KEY`) vive fuera de la base de datos.
- Nadie puede leerlas desde la app después de guardarlas; solo el servidor las descifra para llamar a SUNAT.
- **Autorización firmada** del cliente; cada uso queda en la bitácora; el cliente puede revocarla.
- Solo se usan **APIs oficiales**. No se automatiza el portal SOL (captchas, cambios de página, uso indebido).

## La IA en Contaya

Explica y acompaña; **nunca calcula impuestos**. Los montos salen de reglas fijas con pruebas.
- Asistente del cliente (web y luego WhatsApp).
- Explicación de cada excepción al contador.
- Sugerencias de clasificación que el contador confirma.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Portal, bandeja, cierre IGV, alta de clientes, RUC automático | Hecha |
| 2A | Importar propuestas SIRE (archivo y API) + credenciales cifradas + semáforo básico | En curso |
| 2B | Validez de CPE y RUC habido de proveedores en el semáforo | Pendiente |
| 2C | IGV proyectado, aviso día 20, calendario de vencimientos | Pendiente |
| 2D | Asistente IA (web y WhatsApp) | Pendiente |
| 3 | Guías de remisión, conexión a sistemas de facturación, planillas | Pendiente |
