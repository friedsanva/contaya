import { FormLogin } from "./form";

export default function Login() {
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-tinta p-12 text-hoja md:flex">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-sol">Oficina contable virtual</p>
        <div className="space-y-5">
          <h1 className="text-6xl font-bold tracking-tight">Contaya</h1>
          <p className="max-w-md text-2xl font-display">Tu contabilidad al día, <span className="text-sol">ya.</span></p>
          <p className="max-w-md text-[#BFD3D6]">Sube tus comprobantes, tu contador los revisa y declaramos a tiempo.</p>
        </div>
        <p className="text-sm text-[#8FAAB0]">Un servicio de IPCOM Technologies Perú</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="md:hidden">
            <h1 className="text-4xl font-bold">Contaya</h1>
            <p className="text-gris">Tu contabilidad al día, ya.</p>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Ingresa a tu cuenta</h2>
            <p className="text-sm text-gris">Usa el correo y la contraseña que te dio tu contador.</p>
          </div>
          <FormLogin />
          <p className="text-xs text-gris">¿Olvidaste tu contraseña? Escríbenos por WhatsApp al 967 660 865.</p>
        </div>
      </section>
    </main>
  );
}
