/**
 * Estado de carga de `/proyectos`.
 *
 * La página no puede saber si hay sesión hasta hidratar, así que antes de ese
 * momento lo honesto es una pantalla de espera con la misma forma que usa
 * `EditorLoader` para "Verificando sesión…", en vez de un spinner genérico que
 * aparece y desaparece en un frame.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF7F2]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#F2E8E2] border-t-[#8C432A]" />
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#7A6D63]">
        Abriendo tus proyectos…
      </p>
    </div>
  );
}