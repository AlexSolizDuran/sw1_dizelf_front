import { REGLAS_CONOCIMIENTO } from "./reglas";
import type { Tarjeta, TarjetaFuente } from "./esquema";

/**
 * Bloque que se inyecta en el system prompt.
 *
 * Tope duro de caracteres: con 3 tarjetas rondamos 900-1.200 tokens. Si una
 * tarjeta quedó larga se recorta el texto, nunca las cifras del título.
 */

const MAX_CARACTERES_TARJETA = 1200;
const MAX_CARACTERES_BLOQUE = 5200;

export function recortar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  return `${texto.slice(0, maximo - 1).trimEnd()}…`;
}

export function construirBloqueConocimiento(tarjetas: TarjetaFuente[]): string {
  if (tarjetas.length === 0) return "";

  const encabezado = [
    "CONOCIMIENTO RECUPERADO (referencias generales de diseño; no son normativa local)",
    "Usá estas tarjetas para responder sobre el plano. Citá el id entre corchetes.",
    ...REGLAS_CONOCIMIENTO.map((regla) => `- ${regla}`),
  ].join("\n");

  let bloque = encabezado;

  for (const tarjeta of tarjetas) {
    const cuerpo = recortar(tarjeta.texto, MAX_CARACTERES_TARJETA);
    const datos =
      tarjeta.datos && tarjeta.datos.length > 0
        ? `\nDatos: ${tarjeta.datos
            .map((dato) => `${dato.etiqueta} ${dato.valor} ${dato.unidad}`)
            .join("; ")}.`
        : "";
    const seccion = `\n\n[${tarjeta.id}] ${tarjeta.titulo}\n${cuerpo}${datos}`;

    if (bloque.length + seccion.length > MAX_CARACTERES_BLOQUE) break;
    bloque += seccion;
  }

  return bloque;
}

export function aFuente(tarjeta: Tarjeta): TarjetaFuente {
  return {
    id: tarjeta.id,
    titulo: tarjeta.titulo,
    texto: recortar(tarjeta.texto, 900),
    tipo: tarjeta.tipo,
    ...(tarjeta.datos ? { datos: tarjeta.datos } : {}),
  };
}
