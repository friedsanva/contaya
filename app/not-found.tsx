import Link from "next/link";
export default function NoEncontrado() {
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-20">
      <h1 className="text-3xl font-bold">No encontramos esta página</h1>
      <Link href="/" className="btn-primario">Volver al inicio</Link>
    </main>
  );
}
