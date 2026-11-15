import crudoVectores from "./vectores.json";
import { HASH_TARJETAS, TARJETAS, TARJETAS_POR_ID } from "./tarjetas";
import { indexarLexico, puntuarLexico } from "./lexico";
import { vectorizarConsulta } from "./embeddings";
import type { ArchivoVectores } from "./tipos";
import type { OrigenConocimiento, Tarjeta } from "./esquema";

/**
 * Retrieval híbrido sobre 32 tarjetas.
 *
 * Con este tamaño no hace falta base vectorial: producto punto en memoria.
 * La fusión es RRF, que tolera bien que las dos señales tengan escalas
 * distintas. Si el servicio de embeddings falla, queda solo el léxico.
 */

const VECTORES = crudoVectores as ArchivoVectores;
const INDICE_LEXICO = indexarLexico(TARJETAS);
const K_RRF = 60;
const PROFUNDIDAD = 12;
const COSENO_MINIMO = 0.32;

function indiceVigente(): boolean {
  return (
    VECTORES.hash === HASH_TARJETAS &&
    VECTORES.dimensions > 0 &&
    Object.keys(VECTORES.vectores).length > 0
  );
}

function coseno(a: number[], b: number[]): number {
  const largo = Math.min(a.length, b.length);
  let producto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < largo; i += 1) {
    producto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  if (normaA === 0 || normaB === 0) return 0;
  return producto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

export interface ResultadoRecuperacion {
  origen: OrigenConocimiento;
  tarjetas: Tarjeta[];
}

export async function recuperar(
  consulta: string,
  limite = 3
): Promise<ResultadoRecuperacion> {
  const tope = Math.min(5, Math.max(1, Math.round(limite)));
  const texto = consulta.trim();
  if (!texto) return { origen: "lexico", tarjetas: [] };

  const lexicos = puntuarLexico(INDICE_LEXICO, texto);
  const rankingLexico = lexicos.slice(0, PROFUNDIDAD).map((entrada) => entrada.id);

  let rankingDenso: string[] = [];
  if (indiceVigente()) {
    const vector = await vectorizarConsulta(texto);
    if (vector) {
      const puntuados = TARJETAS.map((tarjeta) => ({
        id: tarjeta.id,
        puntaje: coseno(vector, VECTORES.vectores[tarjeta.id] ?? []),
      }))
        .filter((entrada) => entrada.puntaje > 0)
        .sort((a, b) => b.puntaje - a.puntaje);

      const mejor = puntuados[0]?.puntaje ?? 0;
      if (mejor >= COSENO_MINIMO) {
        rankingDenso = puntuados.slice(0, PROFUNDIDAD).map((entrada) => entrada.id);
      }
    }
  }

  if (rankingDenso.length === 0 && rankingLexico.length === 0) {
    return { origen: "lexico", tarjetas: [] };
  }

  const puntaje = new Map<string, number>();
  const sumar = (ids: string[], peso: number) => {
    ids.forEach((id, posicion) => {
      puntaje.set(id, (puntaje.get(id) ?? 0) + peso / (K_RRF + posicion + 1));
    });
  };

  // El léxico pesa un poco más cuando hay coincidencia exacta de términos,
  // que en este dominio suele ser la señal más confiable.
  sumar(rankingDenso, 1);
  sumar(rankingLexico, 1.15);

  const ordenados = [...puntaje.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, tope)
    .map(([id]) => TARJETAS_POR_ID.get(id))
    .filter((tarjeta): tarjeta is Tarjeta => Boolean(tarjeta));

  return {
    origen: rankingDenso.length > 0 ? "vectorial" : "lexico",
    tarjetas: ordenados,
  };
}
