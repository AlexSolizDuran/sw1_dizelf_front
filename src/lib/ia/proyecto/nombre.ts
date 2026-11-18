export const TITULO_POR_DEFECTO = "Proyecto con IA";
export const MAX_TITULO_PROYECTO = 100;

/**
 * Título automático para un proyecto generado desde la barra IA.
 *
 * La barra no pide nombre: usa el que sugiere el modelo y, si ya existe uno
 * igual (sin distinguir mayúsculas ni espacios), agrega un sufijo numérico.
 * La comparación es contra los títulos del usuario, no contra todos los de la
 * base: dos personas pueden tener "Casa" sin problema.
 */
export function tituloProyectoUnico(
  sugerido: string | undefined,
  existentes: readonly string[]
): string {
  const base =
    (sugerido ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TITULO_PROYECTO) ||
    TITULO_POR_DEFECTO;

  const usados = new Set(existentes.map(normalizar));
  if (!usados.has(normalizar(base))) return base;

  for (let numero = 2; numero <= 999; numero += 1) {
    const sufijo = ` (${numero})`;
    const candidato = `${base
      .slice(0, MAX_TITULO_PROYECTO - sufijo.length)
      .trimEnd()}${sufijo}`;
    if (!usados.has(normalizar(candidato))) return candidato;
  }

  // Salida de emergencia: un sufijo temporal garantiza unicidad.
  const marca = ` ${Date.now()}`;
  return `${base
    .slice(0, MAX_TITULO_PROYECTO - marca.length)
    .trimEnd()}${marca}`;
}

function normalizar(titulo: string): string {
  return titulo.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}
