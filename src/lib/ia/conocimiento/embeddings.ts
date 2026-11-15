import type { RespuestaEmbeddings } from "./tipos";

/**
 * Cliente del microservicio de embeddings.
 *
 * Corre solo en el servidor (route handler). El navegador nunca ve vectores
 * ni conoce el índice. Si el Space está dormido o falla, devuelve `null` y el
 * retrieval sigue con la búsqueda léxica: una consulta nunca queda bloqueada.
 */

const URL_POR_DEFECTO = "https://alexsolizduran-ia-marranque.hf.space";

function baseUrl(): string {
  const configurada = process.env.EMBEDDINGS_URL?.trim();
  return (configurada || URL_POR_DEFECTO).replace(/\/+$/, "");
}

function timeoutMs(): number {
  const valor = Number(process.env.EMBEDDINGS_TIMEOUT_MS ?? "8000");
  return Number.isFinite(valor) && valor > 0 ? valor : 8000;
}

function token(): string {
  return process.env.EMBEDDINGS_TOKEN?.trim() ?? "";
}

function dimensionEsperada(): number {
  const valor = Number(process.env.EMBEDDINGS_DIMENSIONS ?? "1024");
  return Number.isFinite(valor) && valor > 0 ? valor : 1024;
}

interface CacheEntrada {
  vector: number[];
  expira: number;
}

const CACHE_MAX = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntrada>();

function leerCache(clave: string): number[] | null {
  const entrada = cache.get(clave);
  if (!entrada) return null;
  if (entrada.expira < Date.now()) {
    cache.delete(clave);
    return null;
  }
  // Reinsertar para que el Map se comporte como LRU.
  cache.delete(clave);
  cache.set(clave, entrada);
  return entrada.vector;
}

function guardarCache(clave: string, vector: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const primero = cache.keys().next().value;
    if (primero !== undefined) cache.delete(primero);
  }
  cache.set(clave, { vector, expira: Date.now() + CACHE_TTL_MS });
}

function esVector(valor: unknown): valor is number[] {
  return (
    Array.isArray(valor) &&
    valor.length === dimensionEsperada() &&
    valor.every((componente) => typeof componente === "number" && Number.isFinite(componente))
  );
}

/** Normaliza por las dudas: el servicio devuelve vectores normalizados, pero
 *  si algún día cambia `normalize`, el coseno sigue siendo correcto. */
function normalizar(vector: number[]): number[] {
  let suma = 0;
  for (const componente of vector) suma += componente * componente;
  const norma = Math.sqrt(suma);
  if (norma === 0 || !Number.isFinite(norma)) return vector;
  return vector.map((componente) => componente / norma);
}

export async function vectorizarLote(
  textos: string[]
): Promise<RespuestaEmbeddings | null> {
  if (textos.length === 0) return null;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs());
  const claveApi = token();

  try {
    const respuesta = await fetch(`${baseUrl()}/api/vectorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(claveApi ? { "X-API-Key": claveApi } : {}),
      },
      body: JSON.stringify({ texts: textos }),
      signal: controlador.signal,
      cache: "no-store",
    });

    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as {
      embeddings?: unknown;
      embedding?: unknown;
      model?: string;
      revision?: string;
      dimensions?: number;
    };

    const crudos = Array.isArray(datos.embeddings)
      ? datos.embeddings
      : esVector(datos.embedding)
        ? [datos.embedding]
        : null;

    if (!crudos || crudos.length !== textos.length) return null;
    if (!crudos.every(esVector)) return null;

    return {
      embeddings: (crudos as number[][]).map(normalizar),
      modelo: datos.model ?? "desconocido",
      revision: datos.revision ?? "desconocida",
      dimensions: datos.dimensions ?? dimensionEsperada(),
    };
  } catch {
    // Timeout, red caída, Space dormido: se degrada, no se rompe.
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function vectorizarConsulta(texto: string): Promise<number[] | null> {
  const limpio = texto.trim();
  if (!limpio) return null;

  const enCache = leerCache(limpio);
  if (enCache) return enCache;

  const respuesta = await vectorizarLote([limpio]);
  if (!respuesta) return null;
  const vector = respuesta.embeddings[0] ?? null;
  if (vector) guardarCache(limpio, vector);
  return vector;
}
