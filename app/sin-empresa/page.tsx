export default function SinEmpresa() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 space-y-4">
      <h1 className="text-3xl font-bold">Tu cuenta aún no está lista</h1>
      <p className="text-gris">Tu usuario existe, pero todavía no está vinculado a una empresa. Escríbenos por WhatsApp al 967 660 865 y lo activamos.</p>
      <form action="/salir" method="post"><button className="btn">Salir</button></form>
    </main>
  );
}
