import type { ConocimientoUsado, TarjetaFuente } from "./esquema";

/**
 * Cliente del endpoint de conocimiento.
 *
 * Vive del lado del navegador: no importa el índice ni los vectores. Si la API
 * tarda o falla, devuelve `null` y el turno sigue sin conocimiento en vez de
 * bloquear el chat.
 */

const TIMEOUT_MS = 9000;

function esTarjeta(valor: unknown): valor is TarjetaFuente {
  if (typeof valor !== "object" || valor === null) return false;
  const crudo = valor as Record<string, unknown>;
  return (
    typeof crudo.id === "string" &&
    typeof crudo.titulo === "string" &&
    typeof crudo.texto === "string" &&
    (crudo.tipo === "referencia" || crudo.tipo === "buena-practica")
  );
}

export async function pedirConocimiento(
  consulta: string,
  limite: number,
  signal?: AbortSignal
): Promise<ConocimientoUsado | null> {
  const texto = consulta.trim();
  if (!texto) return null;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  const alAbortar = () => controlador.abort();
  signal?.addEventListener("abort", alAbortar, { once: true });

  try {
    const respuesta = await fetch("/api/ia/conocimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consulta: texto, limite }),
      signal: controlador.signal,
      cache: "no-store",
    });

    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as {
      origen?: unknown;
      tarjetas?: unknown;
    };

    const origen = datos.origen === "lexico" ? "lexico" : "vectorial";
    if (!Array.isArray(datos.tarjetas)) return null;

    const tarjetas = datos.tarjetas.filter(esTarjeta);
    if (tarjetas.length === 0) return null;

    return { origen, tarjetas };
  } catch {
    return null;
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", alAbortar);
  }
}
