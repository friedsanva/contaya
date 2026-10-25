const ESTILOS = {
  ok: "bg-[#DDF1E6] text-[#1F6B57]",
  alerta: "bg-[#FBEBD2] text-[#8A5A00]",
  error: "bg-[#F8DEDC] text-[#A3261E]",
  info: "bg-[#DCE9F3] text-[#1F5F8B]",
  neutro: "bg-hoja text-gris",
} as const;

export type TonoChip = keyof typeof ESTILOS;

export function Chip({ tono, children }: { tono: TonoChip; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${ESTILOS[tono]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function ChipEstado({ estado }: { estado: string }) {
  if (estado === "validado") return <Chip tono="ok">Validado</Chip>;
  if (estado === "observado") return <Chip tono="error">Observado</Chip>;
  return <Chip tono="alerta">Por revisar</Chip>;
}
