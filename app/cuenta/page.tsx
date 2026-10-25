import { obtenerSesion } from "@/lib/sesion";
import { Encabezado } from "@/components/Encabezado";
import { FormClave } from "./form";

export default async function Cuenta() {
  const { perfil, user } = await obtenerSesion();
  return (
    <>
      <Encabezado rol={perfil?.rol ?? "cliente"} email={user.email ?? null} />
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Mi cuenta</h1>
          <p className="text-sm text-gris">{user.email}</p>
        </div>
        <FormClave />
      </main>
    </>
  );
}
