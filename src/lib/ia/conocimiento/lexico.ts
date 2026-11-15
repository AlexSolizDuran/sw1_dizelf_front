import type { Tarjeta } from "./esquema";

/**
 * Búsqueda léxica BM25 sobre las tarjetas.
 *
 * Es el respaldo cuando el servicio de embeddings no responde. También entra
 * en la fusión híbrida: para normativa y medidas, los términos exactos pesan.
 */

const STOPWORDS = new Set([
  "a","al","algo","algun","alguna","algunas","alguno","algunos","ante","antes",
  "aquel","aquella","aquello","aquellos","asi","aun","bajo","bien","cada","como",
  "con","contra","cual","cuales","cuando","cuanto","de","del","desde","donde",
  "dos","el","ella","ellas","ello","ellos","en","entre","era","eran","es","esa",
  "esas","ese","eso","esos","esta","estaba","estan","estar","estas","este","esto",
  "estos","fue","ha","hacia","hasta","hay","la","las","le","les","lo","los","mas",
  "me","mi","mis","muy","no","nos","o","otra","otro","para","pero","poco","por",
  "porque","que","quien","se","sea","segun","ser","si","sin","sobre","son","su",
  "sus","tambien","te","tiene","tienen","todo","todos","tu","un","una","unas",
  "uno","unos","y","ya","yo","deberia","deberian","puede","pueden","sirve","conviene",
]);

const SINONIMOS: Record<string, string> = {
  living: "estar",
  wc: "bano",
  toilette: "bano",
  banio: "bano",
  dorm: "dormitorio",
  dormitorios: "dormitorio",
  banos: "bano",
  cocinas: "cocina",
  ventanas: "ventana",
  puertas: "puerta",
  placares: "placard",
  closets: "placard",
  pasillos: "pasillo",
  escaleras: "escalera",
  muros: "muro",
  ambientes: "ambiente",
  medidas: "medida",
};

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenizar(texto: string): string[] {
  const limpio = normalizarTexto(texto).replace(/[^a-z0-9]+/g, " ");
  const tokens: string[] = [];
  for (const bruto of limpio.split(" ")) {
    if (bruto.length < 2) continue;
    if (STOPWORDS.has(bruto)) continue;
    tokens.push(SINONIMOS[bruto] ?? bruto);
  }
  return tokens;
}

export interface DocumentoLexico {
  id: string;
  tokens: string[];
  frecuencias: Map<string, number>;
  longitud: number;
}

export interface IndiceLexico {
  documentos: DocumentoLexico[];
  idf: Map<string, number>;
  longitudMedia: number;
}

export function indexarLexico(tarjetas: Tarjeta[]): IndiceLexico {
  const documentos: DocumentoLexico[] = tarjetas.map((tarjeta) => {
    const texto = [
      tarjeta.titulo,
      tarjeta.temas.join(" "),
      tarjeta.texto,
      ...(tarjeta.datos ?? []).map((dato) => dato.etiqueta),
    ].join(" ");
    const tokens = tokenizar(texto);
    const frecuencias = new Map<string, number>();
    for (const token of tokens) {
      frecuencias.set(token, (frecuencias.get(token) ?? 0) + 1);
    }
    return { id: tarjeta.id, tokens, frecuencias, longitud: tokens.length };
  });

  const frecuenciaDocumental = new Map<string, number>();
  for (const documento of documentos) {
    for (const token of new Set(documento.tokens)) {
      frecuenciaDocumental.set(token, (frecuenciaDocumental.get(token) ?? 0) + 1);
    }
  }

  const total = documentos.length || 1;
  const idf = new Map<string, number>();
  for (const [token, frecuencia] of frecuenciaDocumental) {
    idf.set(token, Math.log(1 + (total - frecuencia + 0.5) / (frecuencia + 0.5)));
  }

  const longitudMedia =
    documentos.reduce((suma, documento) => suma + documento.longitud, 0) / total;

  return { documentos, idf, longitudMedia };
}

export interface PuntajeLexico {
  id: string;
  puntaje: number;
}

/** BM25 con k1 = 1.5 y b = 0.75. */
export function puntuarLexico(
  indice: IndiceLexico,
  consulta: string
): PuntajeLexico[] {
  const terminos = tokenizar(consulta);
  if (terminos.length === 0) return [];

  const k1 = 1.5;
  const b = 0.75;
  const unicos = [...new Set(terminos)];

  return indice.documentos
    .map((documento) => {
      let puntaje = 0;
      for (const termino of unicos) {
        const frecuencia = documento.frecuencias.get(termino) ?? 0;
        if (frecuencia === 0) continue;
        const idf = indice.idf.get(termino) ?? 0;
        const denominador =
          frecuencia +
          k1 * (1 - b + (b * documento.longitud) / (indice.longitudMedia || 1));
        puntaje += idf * ((frecuencia * (k1 + 1)) / denominador);
      }
      return { id: documento.id, puntaje };
    })
    .filter((entrada) => entrada.puntaje > 0)
    .sort((a, b2) => b2.puntaje - a.puntaje);
}
