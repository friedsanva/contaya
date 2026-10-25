import { exigirContador } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { FormNuevoCliente } from "./form";

export default async function NuevoCliente() {
  const { perfil } = await exigirContador();
  return (
    <>
      <Encabezado rol="contador" email={perfil.email} />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Registrar cliente</h1>
          <p className="text-sm text-gris">Crea la empresa y, si quieres, su usuario para el portal. La contraseña temporal se muestra una sola vez.</p>
        </div>
        <FormNuevoCliente />
      </main>
    </>
  );
}
