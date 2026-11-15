"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type DoorNode,
  type LevelNode,
  type WindowNode,
  useScene,
} from "@pascal-app/core";
import {
  childrenOfType,
  effectiveWallHeight,
  polygonArea,
  polygonPerimeter,
  round,
} from "../tools/helpers";
import { esHabitable, tipoAmbiente } from "../tipos-ambiente";

/**
 * Hechos del plano calculados en código.
 *
 * El modelo no mide ni compara: recibe estas líneas ya resueltas y se limita a
 * redactar. La geometría sale de las zones, los muros y las aberturas reales.
 */

const MAX_AMBIENTES = 8;
const MAX_CARACTERES = 1300;

export interface DiagnosticoPlano {
  texto: string;
  /** Consulta corta para el retrieval, construida desde los hechos. */
  consulta: string;
  ambientes: number;
  alertas: string[];
}

function numero(valor: number, decimales = 1): string {
  return valor.toFixed(decimales).replace(".", ",");
}

function dimensiones(poligono: readonly [number, number][]): {
  ancho: number;
  alto: number;
  menor: number;
} {
  if (poligono.length === 0) return { ancho: 0, alto: 0, menor: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poligono) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const ancho = maxX - minX;
  const alto = maxY - minY;
  return { ancho, alto, menor: Math.min(ancho, alto) };
}

function nivelDe(
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: string | null
): LevelNode | null {
  if (levelId) {
    const nodo = nodes[levelId as AnyNodeId];
    if (nodo?.type === "level") return nodo;
  }
  return (
    Object.values(nodes).find((nodo): nodo is LevelNode => nodo.type === "level") ??
    null
  );
}

function aberturasDe(
  node: DoorNode | WindowNode,
  wallIds: Set<string>
): string | null {
  const padre = (node.wallId ?? node.parentId ?? "") as string;
  return wallIds.has(padre) ? padre : null;
}

export function construirDiagnostico(levelId: string | null): DiagnosticoPlano {
  const nodes = useScene.getState().nodes as Record<AnyNodeId, AnyNode>;
  const nivel = nivelDe(nodes, levelId);
  if (!nivel) {
    return { texto: "", consulta: "", ambientes: 0, alertas: [] };
  }

  const zonas = childrenOfType(nodes, nivel.id, "zone");
  const muros = childrenOfType(nodes, nivel.id, "wall");

  if (zonas.length === 0) {
    return { texto: "", consulta: "", ambientes: 0, alertas: [] };
  }

  const idsMuros = new Set(muros.map((muro) => muro.id as string));

  // Cuántas zonas referencian cada muro: 1 o 0 significa muro exterior.
  const usos = new Map<string, number>();
  for (const zona of zonas) {
    for (const muroId of zona.boundaryWallIds ?? []) {
      usos.set(muroId as string, (usos.get(muroId as string) ?? 0) + 1);
    }
  }
  const exteriores = muros.filter(
    (muro) => (usos.get(muro.id as string) ?? 0) <= 1
  ).length;

  const aberturas = Object.values(nodes).filter(
    (node): node is DoorNode | WindowNode =>
      (node.type === "door" || node.type === "window") &&
      aberturasDe(node, idsMuros) !== null
  );

  const lineas: string[] = [];
  const alertas: string[] = [];
  const consulta: string[] = [];
  const alturas = muros.map((muro) => effectiveWallHeight(muro));
  const alturaMaxima = alturas.length > 0 ? Math.max(...alturas) : 0;

  const ordenadas = [...zonas].sort(
    (a, b) => polygonArea(b.polygon) - polygonArea(a.polygon)
  );

  for (const zona of ordenadas.slice(0, MAX_AMBIENTES)) {
    const area = round(polygonArea(zona.polygon));
    const perimetro = round(polygonPerimeter(zona.polygon));
    const lados = dimensiones(zona.polygon);
    const tipo = tipoAmbiente(zona.name ?? "", area);
    const murosZona = new Set((zona.boundaryWallIds ?? []).map(String));

    const propias = aberturas.filter((abertura) => {
      const muroId = aberturasDe(abertura, idsMuros);
      return muroId ? murosZona.has(muroId) : false;
    });

    const ventanas = propias.filter(
      (abertura): abertura is WindowNode => abertura.type === "window"
    );
    const puertas = propias.filter(
      (abertura): abertura is DoorNode => abertura.type === "door"
    );

    const areaVentanas = round(
      ventanas.reduce((suma, ventana) => suma + ventana.width * ventana.height, 0)
    );
    const ventanasExterior = ventanas.filter((ventana) => {
      const muroId = aberturasDe(ventana, idsMuros);
      return muroId ? (usos.get(muroId) ?? 0) <= 1 : false;
    }).length;

    const puertaMinima =
      puertas.length > 0
        ? round(Math.min(...puertas.map((puerta) => puerta.width)))
        : 0;

    const detalles: string[] = [
      `${numero(area)} m²`,
      `lado menor ${numero(lados.menor)} m`,
    ];
    if (ventanas.length > 0) {
      detalles.push(
        `${ventanas.length} ventana${ventanas.length === 1 ? "" : "s"} (${numero(areaVentanas)} m², ${ventanasExterior} al exterior)`
      );
    } else {
      detalles.push("sin ventanas");
    }
    if (puertas.length > 0) {
      detalles.push(`puerta ${numero(puertaMinima, 2)} m`);
    } else {
      detalles.push("sin puerta");
    }

    lineas.push(`- ${zona.name ?? "Ambiente"} (${tipo}, ${numero(perimetro)} m de perímetro): ${detalles.join("; ")}`);

    // Consulta para el retrieval: tipo + problema + medidas.
    consulta.push(
      `${tipo} ${numero(area)} m2 lado ${numero(lados.menor)} m ${
        ventanas.length === 0 ? "sin ventana ventilacion" : `${ventanas.length} ventana iluminacion`
      } ${puertas.length === 0 ? "sin puerta" : `puerta ${numero(puertaMinima, 2)} m`}`
    );

    const habitable = esHabitable(tipo);

    if (puertas.length === 0) {
      alertas.push(`${zona.name ?? tipo} sin puerta`);
      consulta.push("circulacion acceso");
    }
    if (habitable && ventanasExterior === 0) {
      alertas.push(`${zona.name ?? tipo} sin ventana al exterior`);
      consulta.push("iluminacion natural ventilacion");
    }
    if (tipo === "baño") {
      if (ventanas.length === 0) {
        alertas.push(`${zona.name ?? tipo} sin ventana`);
        consulta.push("ventilacion bano humedad");
      }
      if (area < 3) {
        alertas.push(`${zona.name ?? tipo} con ${numero(area)} m² (referencia 3,0 m²)`);
        consulta.push("superficie minima bano");
      }
    }
    if (tipo === "dormitorio" && area < 9) {
      alertas.push(`${zona.name ?? tipo} con ${numero(area)} m² (referencia 9 m²)`);
      consulta.push("superficie minima dormitorio");
    }
    if (tipo === "circulación" && lados.menor > 0 && lados.menor < 0.9) {
      alertas.push(`${zona.name ?? tipo} de ${numero(lados.menor, 2)} m de ancho`);
      consulta.push("ancho de paso circulacion");
    }
  }

  const resto = ordenadas.length - Math.min(MAX_AMBIENTES, ordenadas.length);
  const cabecera = `Nivel "${nivel.name ?? `Nivel ${nivel.level + 1}`}": ${ordenadas.length} ambiente${ordenadas.length === 1 ? "" : "s"}.`;
  const cierre: string[] = [
    `Muros: ${muros.length} (${exteriores} exteriores).`,
  ];
  if (alturaMaxima > 0) cierre.push(`Altura libre: ${numero(alturaMaxima, 2)} m.`);
  if (resto > 0) cierre.push(`${resto} ambiente${resto === 1 ? "" : "s"} más sin detallar.`);

  let texto = [cabecera, ...lineas, cierre.join(" ")].join("\n");
  if (alertas.length > 0) {
    texto += `\nAlertas: ${alertas.slice(0, 6).join("; ")}.`;
  }
  if (texto.length > MAX_CARACTERES) {
    texto = `${texto.slice(0, MAX_CARACTERES - 1).trimEnd()}…`;
  }

  return {
    texto,
    consulta: consulta.join(" ").slice(0, 600),
    ambientes: ordenadas.length,
    alertas,
  };
}

export function construirConsulta(
  diagnostico: DiagnosticoPlano,
  mensaje: string
): string {
  const pedido = mensaje
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return [diagnostico.consulta, pedido].filter(Boolean).join(" ");
}
