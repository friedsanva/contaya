# Contaya

Oficina contable virtual para MYPEs del Perú. Los clientes suben los XML de sus comprobantes electrónicos, el contador los valida y la plataforma prepara la liquidación mensual de IGV y el pago a cuenta de Renta.

Un servicio de IPCOM Technologies Perú.

## Qué hace (Fase 1)

- **Portal del cliente**: sube XML (factura, boleta, nota de crédito y débito), ve el estado de cada comprobante y las observaciones del contador.
- **Cartera del contador**: avance de todos los clientes por periodo.
- **Bandeja**: validar, observar, registrar tipo de cambio, eliminar y exportar a CSV el registro de ventas o compras.
- **Cierre mensual**: IGV (débito, crédito, saldo a favor, percepciones y retenciones), pago a cuenta o cuota RER, cuadre con la propuesta del SIRE y marca de "declarado".
- **Alta de clientes** con usuario y contraseña temporal (no depende del envío de correos).

Alertas automáticas al leer el XML: fecha fuera del periodo, moneda extranjera, boleta en compras (sin crédito fiscal), IGV que no cuadra con la base, y comprobantes ya registrados.

## Tecnología

Next.js 14 (App Router) · Supabase (base de datos, login y archivos) · Tailwind CSS · Vercel (hosting).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto nuevo en [supabase.com](https://supabase.com) (región sugerida: São Paulo).
2. **SQL Editor** → pega y ejecuta `supabase/migrations/0001_init.sql`.
3. **Authentication → Providers → Email**: deja activo el ingreso con correo y **desactiva "Allow new users to sign up"** (los usuarios los crea el contador).
4. **Authentication → Users → Add user**: crea tu usuario de contador (marca *Auto Confirm User*).
5. **SQL Editor**: conviértelo en contador:
   ```sql
   update public.perfiles set rol = 'contador', nombre = 'Tu nombre' where email = 'tu-correo@dominio.pe';
   ```
6. **Project Settings → API**: copia la *Project URL*, la *anon key* y la *service_role key*.

### 2. Local
```bash
cp .env.example .env.local   # completa los valores de Supabase
npm install
npm run dev                  # http://localhost:3000
```

### 3. Vercel
1. Importa el repositorio en [vercel.com](https://vercel.com).
2. En **Environment Variables** agrega las cuatro variables de `.env.example` (con la URL real en `NEXT_PUBLIC_SITE_URL`).
3. Despliega.

## Pruebas
```bash
npm test          # lector de XML y cálculos tributarios
npm run typecheck
npm run build
```

## Estructura
```
app/cliente/            portal del cliente
app/contador/           cartera, bandeja, cierre y alta de clientes
lib/ubl.ts              lector de XML UBL 2.1 de SUNAT (función pura, con pruebas)
lib/calculos.ts         liquidación de IGV y pago a cuenta (función pura, con pruebas)
lib/registrar.ts        guarda el XML y registra el comprobante
supabase/migrations/    tablas y permisos (RLS): cada cliente ve solo lo suyo
```

## Próximas fases
- **Fase 2**: acumulado anual para la declaración de Renta, consulta de RUC no habido, avisos por correo/WhatsApp, agentes de atención al cliente.
- **Fase 3**: planillas y resumen para PLAME.
