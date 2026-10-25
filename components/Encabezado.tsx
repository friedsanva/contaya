import Link from "next/link";

export function Encabezado({ rol, email, titulo }: { rol: "contador" | "cliente"; email: string | null; titulo?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-linea bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold">Contaya</span>
          {titulo && <span className="text-sm text-gris">· {titulo}</span>}
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          {rol === "contador" && (
            <>
              <Link className="btn" href="/contador">Cartera</Link>
              <Link className="btn" href="/contador/clientes/nuevo">Nuevo cliente</Link>
            </>
          )}
          <Link className="btn" href="/cuenta" title={email ?? ""}>Mi cuenta</Link>
          <form action="/salir" method="post"><button className="btn">Salir</button></form>
        </nav>
      </div>
    </header>
  );
}
