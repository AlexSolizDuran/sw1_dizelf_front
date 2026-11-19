/**
 * Motor de medición: del plano a cantidades.
 *
 * Qué mide y qué NO mide
 * ----------------------
 * Mide geometría que la escena ya tiene: largo y alto de cada muro, el hueco de
 * cada puerta y ventana, la superficie de las losas y la de los techos. De ahí
 * sale el muro NETO (bruto menos aberturas), que es lo que se compra en
 * ladrillo y mortero.
 *
 * También mide la pintura: de qué caras de cada muro y de qué techos hay
 * material elegido y con qué color, para que el presupuesto compre un balde por
 * color sobre la superficie realmente pintada. Lo que no puede medir es acero:
 * depende del cálculo estructural, no del área.
 *
 * El alto del muro sale de `wall.height`; si el nodo no lo tiene, se asume
 * `ALTO_MURO_POR_DEFECTO`. Ese supuesto se informa en el resultado para que el
 * usuario sepa qué se usó.
 */
import {
  type AnyNode,
  getCatalogMaterialById,
  getLibraryMaterialIdFromRef,
} from "@pascal-app/core";

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
  /** Superficie de techos del nivel, descontados los huecos (m²). */
  areaTechoM2: number;
  /**
   * Superficie pintada acumulada (m²). Suma cada cara de muro pintada, así que
   * un muro pintado de los dos lados aporta dos veces.
   */
  areaPintadaM2: number;
  /** Desglose por color/acabado, para comprar baldes separados. */
  pintura: PinturaColor[];
  /** `true` si algún muro usó el alto por defecto. */
  usoAltoPorDefecto: boolean;
}

/** Superficie pintada de un mismo material, acumulada entre muros y caras. */
export interface PinturaColor {
  /** Ref del slot: `library:<id>` (o `scene:<id>`). */
  ref: string;
  /** Id de catálogo de la biblioteca, si la ref es de biblioteca. */
  materialId: string | null;
  /** Área pintada con ese color, descontadas las aberturas (m²). */
  areaM2: number;
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
 * Área de un polígono con huecos (techos y losas con aberturas).
 *
 * Los huecos vienen como una lista de polígonos paralela a `holes`; se restan
 * del área del contorno. Si un hueco no es un polígono válido se ignora, y el
 * resultado nunca baja de cero.
 */
function areaConHuecos(nodo: unknown): number {
  const contorno = poligono(nodo);
  if (!contorno) return 0;

  let area = areaPoligono(contorno);
  const huecos = rec(nodo).holes;
  if (Array.isArray(huecos)) {
    for (const hueco of huecos) {
      const puntos = poligono({ polygon: hueco });
      if (puntos) area -= areaPoligono(puntos);
    }
  }
  return Math.max(0, area);
}

/**
 * Ref de un slot que cuenta como pintura.
 *
 * Solo la categoría `colors` de la biblioteca: una pared con madera o baldosa
 * también es un acabado, pero no se compra como pintura. Y solo refs de
 * biblioteca: el catálogo de presupuesto no tiene precio para un material
 * `scene:` creado a mano en el inspector.
 */
function refDePintura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const id = getLibraryMaterialIdFromRef(valor);
  if (!id) return null;
  return getCatalogMaterialById(id)?.category === "colors" ? valor : null;
}

/**
 * Área de las aberturas de UN muro (m²).
 *
 * Se deduplica por id porque la misma puerta puede aparecer a la vez en
 * `wall.children` y con `wallId` apuntando al muro. Las aberturas sin medidas
 * no suman acá: ya se informan aparte en la medición global.
 */
function areaAberturasDelMuro(
  nodes: Record<string, AnyNode>,
  muro: unknown
): number {
  const ids = new Set<string>();

  for (const hijo of (rec(muro).children as unknown[] | undefined) ?? []) {
    const id = rec(hijo).id;
    if (typeof id === "string") ids.add(id);
  }

  const muroId = rec(muro).id;
  if (typeof muroId === "string") {
    for (const nodo of Object.values(nodes)) {
      if (rec(nodo).wallId !== muroId) continue;
      const id = rec(nodo).id;
      if (typeof id === "string") ids.add(id);
    }
  }

  let area = 0;
  for (const id of ids) {
    const nodo = nodes[id as keyof typeof nodes];
    if (!nodo) continue;
    const t = tipo(nodo);
    if (t !== "door" && t !== "window") continue;
    const ancho = num(nodo, "width");
    const alto = num(nodo, "height");
    if (ancho === null || alto === null || ancho <= 0 || alto <= 0) continue;
    area += ancho * alto;
  }
  return area;
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
  let areaPintadaM2 = 0;
  const pinturaPorRef = new Map<string, number>();

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

    // Pintura: cada cara con material elegido aporta su área neta. Si el muro
    // está pintado de los dos lados, suma dos veces (se pintan dos paños).
    // Las bandas (`lowerInterior`, `skirtingExterior`…) no se miden: repartir
    // la altura entre bandas exige la configuración de bandas del muro.
    const slots = rec(muro).slots;
    if (slots && typeof slots === "object") {
      const areaNeta = Math.max(
        0,
        largo * efectivo - areaAberturasDelMuro(nodes, muro)
      );
      if (areaNeta > 0) {
        for (const lado of ["interior", "exterior"] as const) {
          // `slots` es el modelo actual; los campos `*MaterialPreset` cubren
          // escenas viejas pintadas antes de la migración a slots.
          const ref =
            refDePintura((slots as Record<string, unknown>)[lado]) ??
            refDePintura(rec(muro)[`${lado}MaterialPreset`]);
          if (!ref) continue;
          pinturaPorRef.set(ref, (pinturaPorRef.get(ref) ?? 0) + areaNeta);
          areaPintadaM2 += areaNeta;
        }
      }
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

  // Techos: se mide el polígono menos sus huecos y, si la cara está pintada
  // con un color de la biblioteca, suma al mismo grupo que los muros. Se
  // acepta el `materialPreset` viejo para escenas anteriores a los slots.
  let areaTechoM2 = 0;
  for (const nodo of todos) {
    if (tipo(nodo) !== "ceiling" || !dentro(nodo)) continue;

    const area = areaConHuecos(nodo);
    areaTechoM2 += area;
    if (area <= 0) continue;

    const slots = rec(nodo).slots;
    const ref =
      refDePintura(rec(slots).surface) ??
      refDePintura(rec(nodo).materialPreset);
    if (!ref) continue;

    pinturaPorRef.set(ref, (pinturaPorRef.get(ref) ?? 0) + area);
    areaPintadaM2 += area;
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
    areaTechoM2: redondear(areaTechoM2, 2),
    areaPintadaM2: redondear(areaPintadaM2, 2),
    pintura: [...pinturaPorRef.entries()]
      .map(([ref, area]) => ({
        ref,
        materialId: getLibraryMaterialIdFromRef(ref),
        areaM2: redondear(area, 2),
      }))
      .sort((a, b) => b.areaM2 - a.areaM2),
    usoAltoPorDefecto,
  };
}
