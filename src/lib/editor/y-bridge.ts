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

/**
 * Orígenes de las transacciones del doc.
 *
 * `ORIGEN_LOCAL` marca lo que escribe este cliente y es lo ÚNICO que
 * `Y.UndoManager` registra en el historial. `ORIGEN_REMOTO` marca lo que llega
 * del gateway: no se reenvía y no entra al historial. `ORIGEN_SISTEMA` es para
 * escrituras locales que no son una acción del usuario (sembrar la escena,
 * cambios hechos mientras una herramienta pausó el historial): se envían a los
 * demás, pero no se pueden deshacer.
 */
export const ORIGEN_LOCAL = "local";
export const ORIGEN_REMOTO = "remoto";
export const ORIGEN_SISTEMA = "sistema";

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
  parentPorDefecto?: AnyNodeId,
  /** Origen de la transacción. Ver `ORIGEN_LOCAL` y compañía. */
  origen: string = ORIGEN_LOCAL
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
        if (igualValor(existente.get(clave), valor)) continue;
        existente.set(clave, valor);
        toco = true;
      }
      if (toco) cambio = true;
    }
  }, origen);

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
export function reemplazarTodo(
  doc: Y.Doc,
  estado: EstadoEscena,
  /**
   * Por defecto `ORIGEN_SISTEMA`: cargar la escena es el piso del historial, no
   * una acción que se pueda deshacer. Igual se reenvía a los demás clientes.
   */
  origen: string = ORIGEN_SISTEMA
): void {
  const nodos = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
  const raices = doc.getArray<AnyNodeId>(CLAVES.roots);
  const colecciones = doc.getMap<unknown>(CLAVES.collections);
  const materiales = doc.getMap<unknown>(CLAVES.materials);
  const plugins = doc.getArray<string>(CLAVES.plugins);

  doc.transact(() => {
    for (const id of Array.from(nodos.keys())) {
      nodos.delete(id);
    }
    for (const [id, nodo] of Object.entries(estado.nodes)) {
      nodos.set(id, nodoAMap(nodo as AnyNode));
    }

    raices.delete(0, raices.length);
    raices.push([...new Set(estado.rootNodeIds)]);

    reemplazarMapa(colecciones, estado.collections);
    reemplazarMapa(materiales, estado.materials);

    plugins.delete(0, plugins.length);
    plugins.push([...new Set(estado.installedPlugins)]);
  }, origen);
}

/**
 * Escribe en el doc los cambios que no son nodos.
 *
 * `diffEscena` solo compara nodos; raíces, colecciones, materiales y plugins
 * viajan por estructuras aparte. Sin esto, el gateway nunca recibe esas partes
 * y su primer persist las borra de la base.
 *
 * Devuelve `true` si escribió algo, para no generar updates vacíos.
 */
export function aplicarCambiosDocumento(
  doc: Y.Doc,
  anterior: EstadoEscena,
  siguiente: EstadoEscena,
  origen: string = ORIGEN_LOCAL
): boolean {
  // Comparaciones baratas: el store conserva la referencia de lo que no cambió
  // (las acciones de nodos solo reemplazan `nodes`), así que la igualdad de
  // referencia descarta la mayoría de los casos sin recorrer nada.
  const raicesCambiaron = !igualValor(
    anterior.rootNodeIds,
    siguiente.rootNodeIds
  );
  const coleccionesCambiaron =
    anterior.collections !== siguiente.collections &&
    !mismosValores(anterior.collections, siguiente.collections);
  const materialesCambiaron =
    anterior.materials !== siguiente.materials &&
    !mismosValores(anterior.materials, siguiente.materials);
  const pluginsCambiaron =
    anterior.installedPlugins !== siguiente.installedPlugins &&
    !igualValor(anterior.installedPlugins, siguiente.installedPlugins);

  if (
    !raicesCambiaron &&
    !coleccionesCambiaron &&
    !materialesCambiaron &&
    !pluginsCambiaron
  ) {
    return false;
  }

  doc.transact(() => {
    if (raicesCambiaron) {
      const raices = doc.getArray<AnyNodeId>(CLAVES.roots);
      raices.delete(0, raices.length);
      raices.push([...new Set(siguiente.rootNodeIds)]);
    }

    if (coleccionesCambiaron) {
      sincronizarMapa(
        doc.getMap<unknown>(CLAVES.collections),
        anterior.collections,
        siguiente.collections
      );
    }

    if (materialesCambiaron) {
      sincronizarMapa(
        doc.getMap<unknown>(CLAVES.materials),
        anterior.materials,
        siguiente.materials
      );
    }

    if (pluginsCambiaron) {
      const plugins = doc.getArray<string>(CLAVES.plugins);
      plugins.delete(0, plugins.length);
      plugins.push([...new Set(siguiente.installedPlugins)]);
    }
  }, origen);

  return true;
}

/**
 * Fusiona el estado del servidor con el doc local en una reconexión.
 *
 * Al reconectar, el doc local puede tener ediciones que el servidor no vio. En
 * vez de destruirlo (que es lo correcto al restaurar una versión), se aplica el
 * estado del servidor con `ORIGEN_REMOTO` y se devuelve lo que el servidor no
 * conoce para reenviarlo después del `sync:listo`.
 *
 * El orden importa: `cambiosLocales` se calcula ANTES de aplicar el update del
 * servidor, porque después el doc ya no distingue qué vino de cada lado.
 */
export function fusionarDocumento(
  doc: Y.Doc,
  updateServidor: Uint8Array
): Uint8Array {
  const servidor = new Y.Doc();
  try {
    Y.applyUpdate(servidor, updateServidor);
    const cambiosLocales = Y.encodeStateAsUpdate(
      doc,
      Y.encodeStateVector(servidor)
    );

    Y.applyUpdate(doc, updateServidor, ORIGEN_REMOTO);
    return cambiosLocales;
  } finally {
    servidor.destroy();
  }
}

/** Reemplaza todo el contenido de un `Y.Map` de valores planos. */
function reemplazarMapa(
  mapa: Y.Map<unknown>,
  valores: Record<string, unknown>
): void {
  for (const clave of Array.from(mapa.keys())) {
    mapa.delete(clave);
  }
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== undefined) mapa.set(clave, valor);
  }
}

/** Aplica solo las altas, bajas y cambios de un `Y.Map` de valores planos. */
function sincronizarMapa(
  mapa: Y.Map<unknown>,
  anterior: Record<string, unknown>,
  siguiente: Record<string, unknown>
): void {
  for (const [clave, valor] of Object.entries(siguiente)) {
    if (valor === undefined) continue;
    if (igualValor(anterior[clave], valor)) continue;
    mapa.set(clave, valor);
  }
  for (const clave of Array.from(mapa.keys())) {
    if (siguiente[clave] === undefined) mapa.delete(clave);
  }
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
 * Igualdad estructural para valores JSON, sin serializar.
 *
 * `JSON.stringify` por campo era el costo dominante del diff: asignaba una
 * cadena por cada valor de cada nodo en cada cambio. Esto corta en el primer
 * valor distinto y no asigna nada en el caso común (primitivos).
 */
function igualValor(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  const aEsArray = Array.isArray(a);
  if (aEsArray !== Array.isArray(b)) return false;

  if (aEsArray) {
    const arregloA = a as unknown[];
    const arregloB = b as unknown[];
    if (arregloA.length !== arregloB.length) return false;
    for (let i = 0; i < arregloA.length; i++) {
      if (!igualValor(arregloA[i], arregloB[i])) return false;
    }
    return true;
  }

  const objetoA = a as Record<string, unknown>;
  const objetoB = b as Record<string, unknown>;
  const clavesA = Object.keys(objetoA);
  if (clavesA.length !== Object.keys(objetoB).length) return false;
  for (const clave of clavesA) {
    if (!Object.prototype.hasOwnProperty.call(objetoB, clave)) return false;
    if (!igualValor(objetoA[clave], objetoB[clave])) return false;
  }
  return true;
}

/**
 * Compara dos mapas de valores por clave.
 *
 * La referencia del mapa cambia aunque no cambie ningún valor (el store hace
 * `{ ...state.collections }` al aplicar cambios de nodos), así que la igualdad
 * de referencia del mapa no alcanza. Los valores, en cambio, sí son inmutables:
 * si la referencia coincide no hay nada que comparar.
 */
function mismosValores(
  anterior: Record<string, unknown>,
  siguiente: Record<string, unknown>
): boolean {
  if (anterior === siguiente) return true;
  const claves = Object.keys(anterior);
  if (claves.length !== Object.keys(siguiente).length) return false;
  for (const clave of claves) {
    if (!Object.prototype.hasOwnProperty.call(siguiente, clave)) return false;
    if (!igualValor(anterior[clave], siguiente[clave])) return false;
  }
  return true;
}

/**
 * Compara dos escenas para sacar el delta.
 *
 * El store ya expone `applyNodeChanges`, pero no emite el delta: solo cambia el
 * mapa. Esta función lo deriva comparando contra el estado anterior, que es lo
 * que se necesita para empujar al doc.
 *
 * La primera pasada es por identidad: el store reemplaza el objeto del nodo
 * cuando cambia (`parseUpdatedNode`) y conserva la referencia del resto, así
 * que un arrastre de un solo nodo cuesta O(N) comparaciones de puntero y no
 * O(N·campos) comparaciones de valores.
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

  for (const id in siguientes) {
    const nodo = siguientes[id];
    const previo = previos[id];
    if (!previo) {
      crear.push({
        node: nodo as AnyNode,
        parentId: (nodo.parentId ?? undefined) as AnyNodeId | undefined,
      });
      continue;
    }
    // Misma referencia: el store no tocó este nodo.
    if (previo === nodo) continue;

    const cambios: Record<string, unknown> = {};
    for (const clave of Object.keys(nodo)) {
      const valor = nodo[clave];
      if (valor === undefined) continue;
      if (igualValor(previo[clave], valor)) continue;
      cambios[clave] = valor;
    }
    if (Object.keys(cambios).length > 0) {
      actualizar.push({ id: id as AnyNodeId, data: cambios as Partial<AnyNode> });
    }
  }

  for (const id in previos) {
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