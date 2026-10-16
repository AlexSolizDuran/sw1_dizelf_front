"use client";

import * as Y from "yjs";
import type { AnyNode, AnyNodeId } from "@pascal-app/core";

/**
 * Puente entre el grafo de escena y un `Y.Doc` de Yjs.
 *
 * POR QUÉ UN `Y.Map` POR NODO
 * ---------------------------
 * `applyNodeChanges({create, update, delete})` del store de `@pascal-app/core`
 * trabaja a granularidad de nodo, así que un `Y.Map` por nodo mapea 1:1 con lo
 * que el editor puede aplicar. Además da la mezcla que se quiere sin más: dos
 * personas que tocan nodos distintos nunca se pisan, y si tocan el mismo nodo,
 * Yjs resuelve campo por campo.
 *
 * POR QUÉ EL MAPEO ES ESTRUCTURAL
 * ------------------------------
 * Y.Map.toJSON() y Y.Array.toJSON() devuelven estructuras planas, así que
 * convertir el doc a la escena es solo JSON.stringify de las cinco estructuras.
 * No hace falta conocer el esquema de nodos: esto no sabe qué es un `wall`.
 *
 * POR QUÉ UN FLAG DE ECO
 * ---------------------
 * El store notifica los cambios locales, y aplicar un cambio remoto también
 * dispara la notificación. Sin una bandera, cada update remoto volvería a
 * escribirse al doc y rebotaría a todos los demás clientes, en bucle.
 */

/** Nombres de las estructuras del documento. Fijos: el backend los replica. */
export const CLAVES = {
  nodes: "scene:nodes",
  roots: "scene:roots",
  collections: "scene:collections",
  materials: "scene:materials",
  plugins: "scene:plugins",
} as const;

/** Parte del store que el puente necesita leer. */
export interface EstadoEscena {
  nodes: Record<AnyNodeId, AnyNode>;
  rootNodeIds: AnyNodeId[];
  collections: Record<string, unknown>;
  materials: Record<string, unknown>;
  installedPlugins: string[];
}

export interface DeltaNodos {
  create?: { node: AnyNode; parentId?: AnyNodeId }[];
  update?: { id: AnyNodeId; data: Partial<AnyNode> }[];
  delete?: AnyNodeId[];
}

/**
 * Escribe un delta del store en el documento.
 *
 * Devuelve `true` si algo cambió de verdad. El store dispara `updateNode` aun
 * cuando el valor es idéntico, y escribir eso al doc genera un update que viaja
 * por la red sin motivo.
 */
export function aplicarDelta(
  doc: Y.Doc,
  delta: DeltaNodos,
  /** Padre de la raíz, para las creaciones. El caller lo pasa porque el store lo sabe. */
  parentPorDefecto?: AnyNodeId
): boolean {
  const nodos = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
  let cambio = false;

  doc.transact(() => {
    for (const id of delta.delete ?? []) {
      if (nodos.has(id)) {
        nodos.delete(id);
        cambio = true;
      }
    }

    for (const { node, parentId } of delta.create ?? []) {
      if (nodos.has(node.id)) continue;
      nodos.set(node.id, nodoAMap(node, parentId ?? parentPorDefecto));
      cambio = true;
    }

    for (const { id, data } of delta.update ?? []) {
      const existente = nodos.get(id);
      if (!existente) continue;
      // Solo se marca lo que de verdad difiere.
      let toco = false;
      for (const [clave, valor] of Object.entries(data)) {
        if (valor === undefined) continue;
        if (JSON.stringify(existente.get(clave)) === JSON.stringify(valor)) continue;
        existente.set(clave, valor);
        toco = true;
      }
      if (toco) cambio = true;
    }
  });

  return cambio;
}

/**
 * Reemplaza el documento entero.
 *
 * Para el resync: cuando el doc quedó corrupto o el cliente se quedó atrás y
 * conviene volver al estado del servidor en vez de intentar unir. Se usa
 * `setScene` del store, no `applyNodeChanges`, porque la escena remota no es un
 * delta sino la verdad.
 */
export function reemplazarTodo(doc: Y.Doc, estado: EstadoEscena): void {
  const nodos = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
  const raices = doc.getArray<AnyNodeId>(CLAVES.roots);

  doc.transact(() => {
    for (const id of Array.from(nodos.keys())) {
      nodos.delete(id);
    }
    for (const [id, nodo] of Object.entries(estado.nodes)) {
      nodos.set(id, nodoAMap(nodo as AnyNode));
    }

    raices.delete(0, raices.length);
    raices.push([...new Set(estado.rootNodeIds)]);
  });
}

/** Convierte el `Y.Doc` a la forma que el store entiende. */
export function materializar(doc: Y.Doc): EstadoEscena {
  return {
    nodes: doc.getMap<Y.Map<unknown>>(CLAVES.nodes).toJSON() as Record<
      AnyNodeId,
      AnyNode
    >,
    rootNodeIds: doc.getArray<AnyNodeId>(CLAVES.roots).toJSON(),
    collections: doc.getMap(CLAVES.collections).toJSON(),
    materials: doc.getMap(CLAVES.materials).toJSON(),
    installedPlugins: doc.getArray<string>(CLAVES.plugins).toJSON(),
  };
}

/**
 * Nodo → `Y.Map`.
 *
 * Los valores viajan como JSON plano a propósito: el CRDT necesita granularity
 * de campo para mezclar, no de tipo. Anidar un `Y.Map` por propiedad duplicaría
 * la estructura sin ganar mezcla, porque el schema de un nodo es rígido y nadie
 * va a editar `wall.start` en un editor y `wall.end` en el otro a la vez.
 */
function nodoAMap(
  nodo: AnyNode,
  parentId?: AnyNodeId
): Y.Map<unknown> {
  const mapa = new Y.Map<unknown>();
  for (const [clave, valor] of Object.entries(nodo)) {
    if (valor === undefined) continue;
    mapa.set(clave, valor);
  }
  if (parentId !== undefined && !mapa.has("parentId")) {
    mapa.set("parentId", parentId);
  }
  return mapa;
}

/**
 * Compara dos escenas para sacar el delta.
 *
 * El store ya expone `applyNodeChanges`, pero no emite el delta: solo cambia el
 * mapa. Esta función lo deriva comparando contra el estado anterior, que es lo
 * que se necesita para empujar al doc.
 */
export function diffEscena(
  anterior: EstadoEscena,
  siguiente: EstadoEscena
): DeltaNodos {
  const crear: { node: AnyNode; parentId?: AnyNodeId }[] = [];
  const actualizar: { id: AnyNodeId; data: Partial<AnyNode> }[] = [];
  const borrar: AnyNodeId[] = [];

  // Los ids del store son plantillas de tipo, no `string`: se trabaja sobre
  // registros indexados por `string` para no pelearse con el tipo en cada
  // acceso.
  const previos = anterior.nodes as Record<string, Record<string, unknown>>;
  const siguientes = siguiente.nodes as Record<string, Record<string, unknown>>;

  for (const [id, nodo] of Object.entries(siguientes)) {
    const previo = previos[id];
    if (!previo) {
      crear.push({
        node: nodo as AnyNode,
        parentId: (nodo.parentId ?? undefined) as AnyNodeId | undefined,
      });
      continue;
    }
    const cambios: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(nodo)) {
      if (valor === undefined) continue;
      if (JSON.stringify(previo[clave]) === JSON.stringify(valor)) continue;
      cambios[clave] = valor;
    }
    if (Object.keys(cambios).length > 0) {
      actualizar.push({ id: id as AnyNodeId, data: cambios as Partial<AnyNode> });
    }
  }

  for (const id of Object.keys(previos)) {
    if (!(id in siguientes)) borrar.push(id as AnyNodeId);
  }

  return {
    ...(crear.length > 0 ? { create: crear } : {}),
    ...(actualizar.length > 0 ? { update: actualizar } : {}),
    ...(borrar.length > 0 ? { delete: borrar } : {}),
  };
}

export function deltaVacio(delta: DeltaNodos): boolean {
  return (
    (delta.create?.length ?? 0) === 0 &&
    (delta.update?.length ?? 0) === 0 &&
    (delta.delete?.length ?? 0) === 0
  );
}