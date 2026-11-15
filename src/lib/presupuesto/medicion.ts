/**
 * Motor de medición: del plano a cantidades.
 *
 * Qué mide y qué NO mide
 * ----------------------
 * Mide geometría que la escena ya tiene: largo y alto de cada muro, el hueco de
 * cada puerta y ventana, y la superficie de las losas. De ahí sale el muro NETO
 * (bruto menos aberturas), que es lo que se compra en ladrillo y mortero.
 *
 * No mide acero ni pintura: el acero depende del cálculo estructural y la
 * pintura de las manos. Esos materiales se agregan a mano en el panel.
 *
 * El alto del muro sale de `wall.height`; si el nodo no lo tiene, se asume
 * `ALTO_MURO_POR_DEFECTO`. Ese supuesto se informa en el resultado para que el
 * usuario sepa qué se usó.
 */
import type { AnyNode } from "@pascal-app/core";

/** Alto de muro asumido cuando el nodo no lo declara (m). */
export const ALTO_MURO_POR_DEFECTO = 2.7;

export interface MedicionNivel {
  nivelNombre: string;
  /** Muros considerados. */
  muros: number;
  /** Suma de las longitudes de eje de los muros (m). */
  largoMuroM: number;
  /** Área de muro sin descontar aberturas (m²). */
  areaMuroBrutaM2: number;
  /** Área de los huecos de puertas y ventanas (m²). */
  areaAberturasM2: number;
  /** Bruta menos aberturas: es la que se compra (m²). */
  areaMuroNetaM2: number;
  puertas: number;
  ventanas: number;
  /** Aberturas sin `width`/`height`: no se pueden descontar. */
  aberturasSinMedidas: number;
  /** Superficie de losas del nivel (m²). */
  areaPisoM2: number;
  /** `true` si algún muro usó el alto por defecto. */
  usoAltoPorDefecto: boolean;
}

function rec(n: unknown): Record<string, unknown> {
  return n && typeof n === "object" ? (n as Record<string, unknown>) : {};
}

function num(n: unknown, key: string): number | null {
  const v = rec(n)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function tipo(n: unknown): string {
  const t = rec(n).type;
  return typeof t === "string" ? t : "";
}

/** `start` / `end` de un muro: dos coordenadas de planta `[x, z]`. */
function punto(n: unknown, key: string): [number, number] | null {
  const v = rec(n)[key];
  if (!Array.isArray(v) || v.length < 2) return null;
  const [x, z] = v;
  return typeof x === "number" && typeof z === "number" ? [x, z] : null;
}

/**
 * Polígono de una losa, en tuplas `[x, z]`.
 *
 * Acepta la forma real del schema (array de tuplas) y la envuelta
 * `{ type: "polygon", points }` que aparece en datos viejos.
 */
function poligono(n: unknown): [number, number][] | null {
  const crudo = rec(n).polygon;
  const lista = Array.isArray(crudo)
    ? crudo
    : Array.isArray(rec(crudo).points)
      ? (rec(crudo).points as unknown[])
      : null;
  if (!lista) return null;

  const puntos = lista.filter(
    (p): p is [number, number] =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === "number" &&
      typeof p[1] === "number"
  );
  return puntos.length >= 3 ? puntos : null;
}

/** Área por la fórmula del polígono (shoelace). */
function areaPoligono(puntos: [number, number][]): number {
  let suma = 0;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    suma += (puntos[j][0] + puntos[i][0]) * (puntos[j][1] - puntos[i][1]);
  }
  return Math.abs(suma / 2);
}

/**
 * ¿El nodo cuelga del nivel pedido?
 *
 * Se sube por `parentId` en vez de mirar solo el padre directo: un muro puede
 * estar dentro de una zona o de un grupo intermedio y seguir perteneciendo al
 * piso. El tope de saltos evita un ciclo de datos corruptos.
 */
function perteneceAlNivel(
  nodes: Record<string, AnyNode>,
  nodo: unknown,
  nivelId: string
): boolean {
  let actual = rec(nodo).parentId;
  for (let salto = 0; salto < 8; salto++) {
    if (typeof actual !== "string") return false;
    if (actual === nivelId) return true;
    actual = rec(nodes[actual]).parentId;
  }
  return false;
}

function redondear(n: number, decimales = 3): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/**
 * Mide un nivel de la escena.
 *
 * `nivelId` en `null` mide la escena entera (útil cuando todavía no hay
 * niveles). Las aberturas se cuentan una sola vez aunque el nodo aparezca a la
 * vez en `wall.children` y tenga `wallId` apuntando al mismo muro.
 */
/**
 * Qué abarca la medición.
 *
 * `nivel` mide solo el nivel activo del visor (una planta); `proyecto` suma
 * todos los niveles del proyecto. El motor ya sabe medir la escena entera con
 * `nivelId = null`, así que la diferencia es solo el alcance que se elige.
 */
export type AlcanceMedicion = "nivel" | "proyecto";

export function medirNivel(
  nodes: Record<string, AnyNode>,
  nivelId: string | null,
  nivelNombre = "Nivel actual"
): MedicionNivel {
  const todos = Object.values(nodes);
  const dentro = (n: unknown): boolean =>
    nivelId === null ? true : perteneceAlNivel(nodes, n, nivelId);

  const muros = todos.filter((n) => tipo(n) === "wall" && dentro(n));
  const murosPorId = new Set(muros.map((m) => String(m.id)));

  const aberturasVistas = new Set<string>();
  const aberturas: unknown[] = [];

  const agregarAbertura = (id: unknown) => {
    const clave = String(id);
    if (aberturasVistas.has(clave)) return;
    const nodo = nodes[clave as keyof typeof nodes];
    if (!nodo) return;
    const t = tipo(nodo);
    if (t !== "door" && t !== "window") return;
    aberturasVistas.add(clave);
    aberturas.push(nodo);
  };

  let largoMuroM = 0;
  let areaMuroBrutaM2 = 0;
  let usoAltoPorDefecto = false;

  for (const muro of muros) {
    const inicio = punto(muro, "start");
    const fin = punto(muro, "end");
    if (!inicio || !fin) continue;

    const largo = Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]);
    const alto = num(muro, "height");
    if (alto === null) usoAltoPorDefecto = true;
    const efectivo = alto !== null && alto > 0 ? alto : ALTO_MURO_POR_DEFECTO;

    largoMuroM += largo;
    areaMuroBrutaM2 += largo * efectivo;

    for (const hijo of (rec(muro).children as unknown[] | undefined) ?? []) {
      agregarAbertura(hijo);
    }
  }

  // Aberturas con `wallId` pero que no están en `children` del muro (el editor
  // las deja en el nivel en algunos flujos).
  for (const nodo of todos) {
    const t = tipo(nodo);
    if (t !== "door" && t !== "window") continue;
    const wallId = rec(nodo).wallId;
    if (typeof wallId === "string" && murosPorId.has(wallId)) {
      agregarAbertura(nodo.id);
    }
  }

  let areaAberturasM2 = 0;
  let puertas = 0;
  let ventanas = 0;
  let aberturasSinMedidas = 0;

  for (const abertura of aberturas) {
    const esPuerta = tipo(abertura) === "door";
    if (esPuerta) puertas += 1;
    else ventanas += 1;

    const ancho = num(abertura, "width");
    const alto = num(abertura, "height");
    if (ancho === null || alto === null || ancho <= 0 || alto <= 0) {
      aberturasSinMedidas += 1;
      continue;
    }
    areaAberturasM2 += ancho * alto;
  }

  let areaPisoM2 = 0;
  for (const nodo of todos) {
    if (tipo(nodo) !== "slab" || !dentro(nodo)) continue;
    const pts = poligono(nodo);
    if (pts) areaPisoM2 += areaPoligono(pts);
  }

  return {
    nivelNombre,
    muros: muros.length,
    largoMuroM: redondear(largoMuroM, 2),
    areaMuroBrutaM2: redondear(areaMuroBrutaM2, 2),
    areaAberturasM2: redondear(areaAberturasM2, 2),
    areaMuroNetaM2: redondear(
      Math.max(0, areaMuroBrutaM2 - areaAberturasM2),
      2
    ),
    puertas,
    ventanas,
    aberturasSinMedidas,
    areaPisoM2: redondear(areaPisoM2, 2),
    usoAltoPorDefecto,
  };
}
