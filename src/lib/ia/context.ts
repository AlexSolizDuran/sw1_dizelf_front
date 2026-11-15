import type { AnyNode } from "@pascal-app/core";
import type { ContextoInfo, IAChatMessage, IAToolDef } from "./types";

const ETIQUETA: Record<string, string> = {
  wall: "muros",
  zone: "ambientes",
  slab: "losas",
  ceiling: "techos",
  door: "puertas",
  window: "ventanas",
  item: "muebles",
  column: "columnas",
  fence: "cercos",
  shelf: "estantes",
  stair: "escaleras",
  "stair-segment": "tramos",
  roof: "cubiertas",
  "roof-segment": "paños",
  elevator: "ascensores",
  spawn: "spawns",
  chimney: "chimeneas",
};

const ORDEN = [
  "wall",
  "zone",
  "slab",
  "ceiling",
  "door",
  "window",
  "item",
  "column",
  "fence",
  "shelf",
  "stair",
  "roof",
  "elevator",
  "chimney",
  "spawn",
] as const;

function nombre(node: AnyNode): string {
  const valor = (node as unknown as { name?: unknown }).name;
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : "";
}

function hijosDe(nodes: Record<string, AnyNode>, parentId: string): AnyNode[] {
  return Object.values(nodes).filter(
    (node) => (node.parentId as string | null) === parentId
  );
}

function contarHijos(nodes: Record<string, AnyNode>, levelId: string) {
  const directos = hijosDe(nodes, levelId);
  const conteo = new Map<string, number>();
  for (const nodo of directos) {
    conteo.set(nodo.type, (conteo.get(nodo.type) ?? 0) + 1);
  }
  // Puertas y ventanas cuelgan de muros, no del nivel.
  const muros = directos.filter((nodo) => nodo.type === "wall");
  for (const muro of muros) {
    for (const hijo of hijosDe(nodes, muro.id)) {
      conteo.set(hijo.type, (conteo.get(hijo.type) ?? 0) + 1);
    }
  }
  return { directos, conteo };
}

interface BBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

type Punto2 = [number, number];

/** Un decimal: alcanza para decidir dónde poner algo y no infla el prompt. */
function m(valor: number): string {
  return (Math.round(valor * 10) / 10).toFixed(1);
}

function bboxDePuntos(puntos: Punto2[]): BBox | null {
  if (puntos.length === 0) return null;
  const xs = puntos.map((punto) => punto[0]);
  const zs = puntos.map((punto) => punto[1]);
  return {
    x0: Math.min(...xs),
    z0: Math.min(...zs),
    x1: Math.max(...xs),
    z1: Math.max(...zs),
  };
}

function unirBBox(a: BBox, b: BBox): BBox {
  return {
    x0: Math.min(a.x0, b.x0),
    z0: Math.min(a.z0, b.z0),
    x1: Math.max(a.x1, b.x1),
    z1: Math.max(a.z1, b.z1),
  };
}

function dimensiones(b: BBox): string {
  return `${m(b.x1 - b.x0)}×${m(b.z1 - b.z0)}`;
}

function rangoBBox(b: BBox): string {
  return `x ${m(b.x0)}–${m(b.x1)} / z ${m(b.z0)}–${m(b.z1)}`;
}

function areaPoligono(puntos: Punto2[]): number {
  let area = 0;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    area += (puntos[j][0] + puntos[i][0]) * (puntos[j][1] - puntos[i][1]);
  }
  return Math.abs(area / 2);
}

/** Centroide real (shoelace), no promedio de vértices: en un L no coinciden. */
function centroidePoligono(puntos: Punto2[]): Punto2 | null {
  let dobleArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const factor = puntos[j][0] * puntos[i][1] - puntos[i][0] * puntos[j][1];
    dobleArea += factor;
    cx += (puntos[j][0] + puntos[i][0]) * factor;
    cz += (puntos[j][1] + puntos[i][1]) * factor;
  }
  if (Math.abs(dobleArea) < 0.0001) return null;
  return [cx / (3 * dobleArea), cz / (3 * dobleArea)];
}

function poligonoDe(node: AnyNode): Punto2[] | null {
  const valor = (node as unknown as { polygon?: unknown }).polygon;
  if (!Array.isArray(valor)) return null;
  const puntos = valor.filter(
    (punto): punto is Punto2 =>
      Array.isArray(punto) &&
      punto.length >= 2 &&
      Number.isFinite(punto[0]) &&
      Number.isFinite(punto[1])
  );
  return puntos.length >= 3 ? puntos : null;
}

interface ConfigResumen {
  maxNiveles: number;
  maxZonas: number;
  maxMuros: number;
  muebles: boolean;
  libre: boolean;
  bbox: boolean;
}

/**
 * Degradación determinista del resumen: se suelta lo menos accionable primero.
 * El último escalón entra siempre, para no dejar el prompt sin contexto.
 *
 * Los muros del nivel activo son lo primero que se conserva después de los
 * ambientes: sin sus IDs el modelo inventa `wall_123abc` al pedirle aberturas.
 */
const CONFIGS: ConfigResumen[] = [
  { maxNiveles: 12, maxZonas: 20, maxMuros: 24, muebles: true, libre: true, bbox: true },
  { maxNiveles: 12, maxZonas: 20, maxMuros: 18, muebles: false, libre: true, bbox: true },
  { maxNiveles: 12, maxZonas: 12, maxMuros: 14, muebles: false, libre: true, bbox: true },
  { maxNiveles: 6, maxZonas: 12, maxMuros: 10, muebles: false, libre: false, bbox: true },
  { maxNiveles: 6, maxZonas: 8, maxMuros: 8, muebles: false, libre: false, bbox: false },
  { maxNiveles: 6, maxZonas: 5, maxMuros: 6, muebles: false, libre: false, bbox: false },
];

/**
 * Resumen compacto de la escena para el prompt.
 *
 * No manda la escena completa: niveles, conteos y, del nivel activo, el brief
 * geométrico de cada ambiente (superficie, medidas, centro). Sin esos datos el
 * modelo inventaba coordenadas cerca del origen y pisaba ambientes existentes,
 * o gastaba una ronda en `get_level` para averiguarlo.
 *
 * El detalle fino (vértices, aberturas, muebles) sigue en `get_level`.
 */
export function resumirEscena(
  nodes: Record<string, AnyNode>,
  nivelActivo: string | null,
  opciones: { maxTokens?: number } = {}
): string {
  const maxTokens = opciones.maxTokens ?? 900;
  let texto = "";
  for (const config of CONFIGS) {
    texto = construirResumen(nodes, nivelActivo, config);
    if (estimarTokens(texto) <= maxTokens) return texto;
  }
  return texto;
}

function construirResumen(
  nodes: Record<string, AnyNode>,
  nivelActivo: string | null,
  config: ConfigResumen
): string {
  const todos = Object.values(nodes);
  const niveles = todos
    .filter((node) => node.type === "level")
    .sort((a, b) => {
      const la = (a as unknown as { level?: number }).level ?? 0;
      const lb = (b as unknown as { level?: number }).level ?? 0;
      return la - lb;
    });

  const lineas: string[] = [];

  const sitios = todos.filter((node) => node.type === "site");
  const terrenoBBox = sitios.reduce<BBox | null>((acc, sitio) => {
    const poligono = poligonoDe(sitio);
    const bbox = poligono ? bboxDePuntos(poligono) : null;
    if (!bbox) return acc;
    return acc ? unirBBox(acc, bbox) : bbox;
  }, null);

  if (terrenoBBox) {
    const superficie =
      (terrenoBBox.x1 - terrenoBBox.x0) * (terrenoBBox.z1 - terrenoBBox.z0);
    lineas.push(
      `TERRENO ${dimensiones(terrenoBBox)} m (${m(superficie)} m²) · bbox ${rangoBBox(terrenoBBox)}`
    );
  }
  if (sitios.length > 0) {
    lineas.push(
      `Terreno: ${sitios.map((s) => `"${nombre(s) || s.id}"`).join(", ")}.`
    );
  }

  const edificios = todos.filter((node) => node.type === "building");
  if (edificios.length > 0) {
    lineas.push(
      `Edificios: ${edificios
        .map((e) => `id=${e.id}${nombre(e) ? ` "${nombre(e)}"` : ""}`)
        .join(", ")}.`
    );
  }

  lineas.push(`Niveles (${niveles.length}):`);
  for (const nivel of niveles.slice(0, config.maxNiveles)) {
    const indice = (nivel as unknown as { level?: number }).level ?? 0;
    const activo = nivel.id === nivelActivo ? " [ACTIVO]" : "";
    const { directos, conteo } = contarHijos(nodes, nivel.id);
    const resumen = ORDEN.map((tipo) => {
      const cantidad = conteo.get(tipo) ?? 0;
      return cantidad > 0 ? `${cantidad} ${ETIQUETA[tipo] ?? tipo}` : null;
    })
      .filter(Boolean)
      .join(", ");

    const zonas = directos.filter((node) => node.type === "zone");
    const muros = directos.filter((node) => node.type === "wall");
    const altura = alturaDeNivel(muros);
    const construido = zonas.reduce((total, zona) => {
      const poligono = poligonoDe(zona);
      return poligono ? total + areaPoligono(poligono) : total;
    }, 0);

    const metadatos = [
      altura !== null ? `altura ${m(altura)} m` : "",
      zonas.length > 0 ? `construido ${m(construido)} m²` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    lineas.push(
      `- id=${nivel.id} "${nombre(nivel) || `Nivel ${indice + 1}`}" indice=${indice}${activo}: ${
        resumen || "vacío"
      }${metadatos ? ` · ${metadatos}` : ""}.`
    );

    if (nivel.id === nivelActivo) {
      const ocupado = bboxDeMuros(muros) ?? bboxDeZonas(zonas);
      if (config.bbox && ocupado) {
        lineas.push(`  bbox ocupado ${rangoBBox(ocupado)}`);
      }

      const listado = zonas.slice(0, config.maxZonas);
      const usos = usosDeMuros(nodes);
      for (const zona of listado) {
        lineas.push(`  ${lineaAmbiente(zona, config.maxMuros > 0)}`);
      }
      if (zonas.length > listado.length) {
        lineas.push(`  … y ${zonas.length - listado.length} ambientes más.`);
      }

      if (config.maxMuros > 0 && muros.length > 0) {
        const listadoMuros = muros.slice(0, config.maxMuros);
        lineas.push(
          `  Muros (${muros.length}) · id · inicio→fin · largo · ext = exterior:`
        );
        for (const muro of listadoMuros) {
          lineas.push(`  ${lineaMuro(muro, usos)}`);
        }
        if (muros.length > listadoMuros.length) {
          lineas.push(
            `  … y ${muros.length - listadoMuros.length} muros más.`
          );
        }
      }

      if (config.libre && terrenoBBox && ocupado) {
        const franja = franjaLibre(terrenoBBox, ocupado);
        if (franja) lineas.push(`  ${franja}`);
      }

      if (config.muebles) {
        const muebles = directos
          .filter((node) => node.type === "item")
          .slice(0, 12)
          .map((node) => `"${nombre(node) || node.id}" (${node.id})`);
        if (muebles.length > 0) {
          lineas.push(`  Muebles: ${muebles.join(", ")}.`);
        }
      }
    }
  }

  if (niveles.length > config.maxNiveles) {
    lineas.push(`… y ${niveles.length - config.maxNiveles} niveles más.`);
  }

  return lineas.join("\n");
}

/** Altura de referencia del nivel: la de sus muros, que es la que se dibuja. */
function alturaDeNivel(muros: AnyNode[]): number | null {
  const alturas = muros
    .map((muro) => (muro as unknown as { height?: unknown }).height)
    .filter((valor): valor is number => typeof valor === "number" && valor > 0);
  if (alturas.length === 0) return null;
  return Math.max(...alturas);
}

function bboxDeMuros(muros: AnyNode[]): BBox | null {
  let acumulado: BBox | null = null;
  for (const muro of muros) {
    const datos = muro as unknown as { start?: Punto2; end?: Punto2 };
    if (!Array.isArray(datos.start) || !Array.isArray(datos.end)) continue;
    const bbox = bboxDePuntos([datos.start, datos.end]);
    if (!bbox) continue;
    acumulado = acumulado ? unirBBox(acumulado, bbox) : bbox;
  }
  return acumulado;
}

function bboxDeZonas(zonas: AnyNode[]): BBox | null {
  let acumulado: BBox | null = null;
  for (const zona of zonas) {
    const poligono = poligonoDe(zona);
    const bbox = poligono ? bboxDePuntos(poligono) : null;
    if (!bbox) continue;
    acumulado = acumulado ? unirBBox(acumulado, bbox) : bbox;
  }
  return acumulado;
}

/**
 * `Living 24.6 m² · 6.0×4.1 · centro (4.2, 5.1) · id=zone_ab · muros=wall_1,…`
 *
 * Los IDs de los muros del ambiente permiten resolver `add_opening` por nombre
 * de ambiente, sin que el modelo tenga que pedir wallIds ni inventarlos.
 */
function lineaAmbiente(zona: AnyNode, conMuros: boolean): string {
  const etiqueta = (nombre(zona) || zona.id).slice(0, 28);
  const poligono = poligonoDe(zona);
  const partes: string[] = [];
  if (!poligono) {
    partes.push(`${etiqueta} · id=${zona.id}`);
  } else {
    const bbox = bboxDePuntos(poligono);
    const centro = centroidePoligono(poligono);
    partes.push(`${etiqueta} ${m(areaPoligono(poligono))} m²`);
    if (bbox) partes.push(dimensiones(bbox));
    if (centro) partes.push(`centro (${m(centro[0])}, ${m(centro[1])})`);
    partes.push(`id=${zona.id}`);
  }

  if (conMuros) {
    const ids = (zona as unknown as { boundaryWallIds?: unknown })
      .boundaryWallIds;
    if (Array.isArray(ids) && ids.length > 0) {
      const mostrados = ids.filter(
        (id): id is string => typeof id === "string"
      );
      if (mostrados.length > 0) {
        const limite = 8;
        const recorte = mostrados.slice(0, limite);
        const resto =
          mostrados.length > limite ? `,+${mostrados.length - limite}` : "";
        partes.push(`muros=${recorte.join(",")}${resto}`);
      }
    }
  }

  return partes.join(" · ");
}

/** `id=wall_ab · (0.0,0.0)→(5.0,0.0) · 5.0 m · ext` */
function lineaMuro(muro: AnyNode, usos: Map<string, number>): string {
  const datos = muro as unknown as { start?: Punto2; end?: Punto2 };
  const partes = [`id=${muro.id}`];

  if (Array.isArray(datos.start) && Array.isArray(datos.end)) {
    const [x0, z0] = datos.start;
    const [x1, z1] = datos.end;
    partes.push(`(${m(x0)},${m(z0)})→(${m(x1)},${m(z1)})`);
    partes.push(`${m(Math.hypot(x1 - x0, z1 - z0))} m`);
  } else {
    partes.push(nombre(muro) || "sin geometría");
  }

  // Un muro que sólo pertenece a un ambiente (o a ninguno) da al exterior.
  if ((usos.get(muro.id) ?? 0) <= 1) partes.push("ext");
  return partes.join(" · ");
}

/** Cuántas zones referencian cada muro: 1 o 0 significa muro exterior. */
function usosDeMuros(nodes: Record<string, AnyNode>): Map<string, number> {
  const usos = new Map<string, number>();
  for (const nodo of Object.values(nodes)) {
    if (nodo.type !== "zone") continue;
    const ids = (nodo as unknown as { boundaryWallIds?: unknown })
      .boundaryWallIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === "string") usos.set(id, (usos.get(id) ?? 0) + 1);
    }
  }
  return usos;
}

/**
 * Franja libre aproximada: el bbox del terreno menos el bbox ocupado del nivel.
 * No es un cálculo exacto de polígonos, pero alcanza para que el modelo no
 * arranque en el origen. La más grande, y solo si tiene un ancho útil.
 */
function franjaLibre(terreno: BBox, ocupado: BBox): string | null {
  const candidatas = [
    { b: { x0: terreno.x0, z0: terreno.z0, x1: ocupado.x0, z1: terreno.z1 }, eje: "x" },
    { b: { x0: ocupado.x1, z0: terreno.z0, x1: terreno.x1, z1: terreno.z1 }, eje: "x" },
    { b: { x0: terreno.x0, z0: terreno.z0, x1: terreno.x1, z1: ocupado.z0 }, eje: "z" },
    { b: { x0: terreno.x0, z0: ocupado.z1, x1: terreno.x1, z1: terreno.z1 }, eje: "z" },
  ];

  const validas = candidatas
    .map(({ b, eje }) => ({
      b,
      eje,
      ancho: b.x1 - b.x0,
      fondo: b.z1 - b.z0,
    }))
    .filter((item) => item.ancho > 1 && item.fondo > 1)
    .sort((a, b) => b.ancho * b.fondo - a.ancho * a.fondo);

  const mejor = validas[0];
  if (!mejor) return null;

  const desde = mejor.eje === "x" ? mejor.b.x0 : mejor.b.z0;
  const hasta = mejor.eje === "x" ? mejor.b.x1 : mejor.b.z1;
  return `Libre aprox.: franja ${mejor.eje} ${m(desde)}–${m(hasta)} · ${dimensiones(mejor.b)} m`;
}

export function estimarTokens(valor: string): number {
  return Math.ceil(valor.length / 4);
}

export function construirContextoInfo(input: {
  systemPrompt: string;
  messages: IAChatMessage[];
  tools: IAToolDef[];
  ventana: number;
  maxOutput: number;
  turnos: number;
}): ContextoInfo {
  const tokensEstimados =
    estimarTokens(input.systemPrompt) +
    estimarTokens(JSON.stringify(input.messages)) +
    estimarTokens(JSON.stringify(input.tools));
  const presupuestoEntrada = Math.max(
    0,
    Math.floor(input.ventana - input.maxOutput)
  );
  return {
    tokensEstimados,
    ventana: input.ventana,
    presupuestoEntrada,
    turnos: input.turnos,
    ...(tokensEstimados > presupuestoEntrada
      ? {
          aviso:
            "El contexto supera el presupuesto del proveedor; se enviarán solo los últimos turnos.",
        }
      : {}),
  };
}
