/**
 * Clasificación de ambientes por nombre.
 *
 * El modelo de escena no guarda un tipo de ambiente: el nombre que escribe la
 * persona es la única señal disponible. Este módulo centraliza la heurística
 * para que la validación de la escena y el diagnóstico del plano coincidan;
 * si cada uno tuviera su propia lista, un "Hall" podría pedir ventana en un
 * lado y no en el otro.
 *
 * Es una heurística, no un dato: ante la duda devuelve `"ambiente"`, y los
 * consumidores tratan ese valor de la forma conservadora.
 */

export type TipoAmbiente =
  | "baño"
  | "cocina"
  | "dormitorio"
  | "estar"
  | "comedor"
  | "circulación"
  | "lavadero"
  | "garaje"
  | "patio"
  | "vestidor"
  | "depósito"
  | "ambiente";

/** Normaliza sin depender del tokenizador del RAG (que trae stopwords). */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tipoAmbiente(nombre: string, area = 0): TipoAmbiente {
  const n = normalizar(nombre);
  // Los sufijos se aceptan con `\w*`: "dormitorio", "dormitorios" y "dorm"
  // tienen que caer en el mismo tipo. Con `\bdorm\b` no matcheaba ninguno de
  // los dos primeros, y el diagnóstico trataba un dormitorio como "ambiente".
  if (/\b(bano\w*|wc|toilette\w*|aseo\w*|servicio\w*)\b/.test(n)) return "baño";
  if (/\bcocina\w*\b/.test(n)) return "cocina";
  if (/\b(dorm\w*|habitacion\w*|recamara\w*|pieza\w*)\b/.test(n)) {
    return "dormitorio";
  }
  if (/\b(living\w*|estar\w*|sala\w*|salon\w*)\b/.test(n)) return "estar";
  if (/\bcomedor\w*\b/.test(n)) return "comedor";
  if (/\b(pasillo\w*|circul\w*|hall|distribuidor\w*)\b/.test(n)) {
    return "circulación";
  }
  if (/\b(lavadero\w*|lavander\w*)\b/.test(n)) return "lavadero";
  if (/\b(garage\w*|cochera\w*|garaje\w*)\b/.test(n)) return "garaje";
  if (/\b(patio\w*|terraza\w*|balcon\w*|jardin\w*)\b/.test(n)) return "patio";
  if (/\bvestidor\w*\b/.test(n)) return "vestidor";
  if (area > 0 && area <= 2) return "depósito";
  return "ambiente";
}

/** Estancia donde se vive: iluminación y ventilación son exigibles. */
export function esHabitable(tipo: TipoAmbiente): boolean {
  return (
    tipo === "dormitorio" ||
    tipo === "estar" ||
    tipo === "comedor" ||
    tipo === "cocina"
  );
}

/**
 * ¿Le corresponde una abertura al exterior?
 *
 * Los ambientes de paso (circulación), guardado (vestidor, depósito) y el
 * garaje no la necesitan: pedirla generaba advertencias que el modelo después
 * intentaba resolver con aberturas absurdas. Baño y lavadero sí, por humedad.
 * `"ambiente"` es el caso desconocido y se trata como habitable.
 */
export function requiereVentana(tipo: TipoAmbiente): boolean {
  return (
    esHabitable(tipo) ||
    tipo === "baño" ||
    tipo === "lavadero" ||
    tipo === "ambiente"
  );
}
