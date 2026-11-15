"use client";

import * as Y from "yjs";
import { useScene } from "@pascal-app/core";
import { CLAVES, ORIGEN_LOCAL } from "./y-bridge";

/**
 * Historial de deshacer sobre el `Y.Doc`.
 *
 * POR QUÉ NO ZUNDO
 * ----------------
 * zundo guarda snapshots del store, y por eso el sync tenía que llamar
 * `clearSceneHistory()` después de CADA update remoto: si no, un Ctrl-Z
 * intentaba deshacer trabajo que otro ya había cambiado y pisaba la escena.
 * Con `Y.UndoManager` el historial se registra por transacción y solo para el
 * origen local (`ORIGEN_LOCAL`), así que:
 *
 * - los cambios remotos no entran al historial ni lo borran,
 * - deshacer revierte únicamente lo que hizo este cliente,
 * - si otro cambió el mismo campo, el paso se resuelve sobre ese campo (ver
 *   `ignoreRemoteMapChanges`): no se descarta el paso entero ni se salta a uno
 *   anterior.
 *
 * CASO BORDE
 * ----------
 * Si otro ya revirtió la acción que se quiere deshacer (creaste un nodo y otro
 * lo borró), ese paso no tiene nada que rehacer y Yjs pasa al anterior. Es
 * inevitable: el efecto ya no existe en el documento.
 *
 * EL SHIM
 * -------
 * El paquete (`runUndo`, las herramientas, los atajos) habla con
 * `useScene.temporal`, que es el store de zundo. En vez de tocar
 * `node_modules`, se reemplaza su API pública por la de este módulo:
 * `getState().undo/redo/clear/pause/resume/isTracking/pastStates` pasan a leer
 * el `UndoManager`. Los suscriptores existentes siguen funcionando porque el
 * estado también se empuja al store original (`publicar`); así el marcado de
 * nodos sucios que hace `@pascal-app/core` al deshacer se entera.
 *
 * Al desmontar se restaura la API y el estado originales.
 */

/** Mismos pasos que el historial del store (`limit: 50` en zundo). */
const LIMITE = 50;

/**
 * Ventana de agrupación de Yjs.
 *
 * zundo creaba un paso por `set`, pero el editor fusiona las acciones
 * compuestas (`runAsSingleSceneHistoryStep`) manipulando `pastStates`, algo que
 * no se puede replicar sobre Yjs. Las escrituras de una misma acción son
 * síncronas, así que una ventana corta alcanza para agruparlas sin fusionar dos
 * acciones humanas seguidas. El default de Yjs (500 ms) sí las fusionaría:
 * crear un muro y moverlo enseguida quedaría en un solo paso, y un Ctrl-Z
 * borraría el muro en vez de devolverlo a su posición.
 */
const VENTANA_MS = 50;

/** Forma mínima del estado temporal que consumen el paquete y los atajos. */
interface EstadoTemporal {
  pastStates: unknown[];
  futureStates: unknown[];
  isTracking: boolean;
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;
  setOnSave: () => void;
  _handleSet: () => void;
}

/**
 * `useScene.temporal` visto desde acá. Se castea porque el tipo real es el de
 * zundo y el objetivo es justamente reemplazar su comportamiento.
 */
interface StoreTemporal {
  getState: () => EstadoTemporal;
  getInitialState: () => EstadoTemporal;
  setState: (parcial: Partial<EstadoTemporal>) => void;
  subscribe: (oyente: (estado: EstadoTemporal) => void) => () => void;
}

export interface UndoYjs {
  /** `true` mientras una herramienta pidió pausar el historial. */
  estaPausado: () => boolean;
  /** Restaura zundo y suelta el manager. Idempotente. */
  destruir: () => void;
}

/**
 * Las cinco estructuras del doc que forman el historial.
 *
 * El tipo sale del propio constructor de `UndoManager`: sus firmas usan
 * `AbstractType<any>` internamente, y repetir ese `any` acá obligaría a
 * desactivar la regla del proyecto.
 */
type Alcance = ConstructorParameters<typeof Y.UndoManager>[0];

function estructuras(doc: Y.Doc): Alcance {
  return [
    doc.getMap(CLAVES.nodes),
    doc.getArray(CLAVES.roots),
    doc.getMap(CLAVES.collections),
    doc.getMap(CLAVES.materials),
    doc.getArray(CLAVES.plugins),
  ];
}

/**
 * Instala el historial de Yjs para `doc`.
 *
 * @param doc Documento vivo del proyecto.
 * @param alVolcar Vuelca el doc al store de escena. Se llama después de
 *   deshacer/rehacer, con el flag de "aplicando remoto" puesto por el caller
 *   para que ese volcado no vuelva al doc.
 */
export function instalarUndoYjs(
  doc: Y.Doc,
  alVolcar: () => void
): UndoYjs {
  const manager = new Y.UndoManager(estructuras(doc), {
    trackedOrigins: new Set([ORIGEN_LOCAL]),
    captureTimeout: VENTANA_MS,
    /**
     * Sin esto, cuando un cambio remoto gana sobre el item local, el undo
     * detecta el conflicto, no rehace ese campo y SIGUE con el paso anterior:
     * el usuario pulsa Ctrl-Z una vez y se le deshace de más (hasta borrar el
     * nodo entero). Con `true`, el undo reinserta el valor local anterior y
     * gana sobre el remoto SOLO en los campos que tocaba esa acción.
     */
    ignoreRemoteMapChanges: true,
  });

  const temporal = useScene.temporal as unknown as StoreTemporal;
  const originales = {
    getState: temporal.getState,
    getInitialState: temporal.getInitialState,
    setState: temporal.setState,
  };
  // El estado de zundo se guarda para devolverlo tal cual al desinstalar.
  const estadoOriginal = originales.getState();
  const empujarAlStore = originales.setState as unknown as (
    parcial: Partial<EstadoTemporal>
  ) => void;

  let pausado = false;
  let silencio = false;
  let destruido = false;
  let estadoActual: EstadoTemporal = crearEstado();

  function recortar(): void {
    // Yjs no tiene `limit`: se descarta el paso más viejo, como zundo.
    while (manager.undoStack.length > LIMITE) manager.undoStack.shift();
  }

  /**
   * Publica el estado nuevo en el store original. Es lo que despierta a los
   * suscriptores que ya existían (el marcado de nodos sucios del paquete).
   */
  function publicar(): void {
    recortar();
    estadoActual = crearEstado();
    empujarAlStore(estadoActual);
  }

  function notificar(): void {
    if (silencio || destruido) return;
    publicar();
  }

  function crearEstado(): EstadoTemporal {
    return {
      pastStates: manager.undoStack,
      futureStates: manager.redoStack,
      isTracking: !pausado,
      undo,
      redo,
      clear,
      pause,
      resume,
      setOnSave: () => {},
      _handleSet: () => {},
    };
  }

  function volcar(): void {
    try {
      alVolcar();
    } finally {
      manager.stopCapturing();
    }
  }

  function undo(steps = 1): void {
    if (destruido) return;

    let hizo = false;
    silencio = true;
    try {
      const total = Math.max(1, Math.trunc(steps));
      for (let i = 0; i < total; i += 1) {
        if (manager.undo() === null) break;
        hizo = true;
      }
    } finally {
      silencio = false;
    }

    if (!hizo) return;
    volcar();
    publicar();
  }

  function redo(steps = 1): void {
    if (destruido) return;

    let hizo = false;
    silencio = true;
    try {
      const total = Math.max(1, Math.trunc(steps));
      for (let i = 0; i < total; i += 1) {
        if (manager.redo() === null) break;
        hizo = true;
      }
    } finally {
      silencio = false;
    }

    if (!hizo) return;
    volcar();
    publicar();
  }

  function clear(): void {
    if (destruido) return;
    manager.clear();
    publicar();
  }

  function pause(): void {
    if (destruido || pausado) return;
    pausado = true;
    publicar();
  }

  function resume(): void {
    if (destruido || !pausado) return;
    pausado = false;
    publicar();
  }

  // Los eventos de la pila mantienen sincronizado el estado que leen React y
  // el marcado de nodos sucios.
  manager.on("stack-item-added", notificar);
  manager.on("stack-item-updated", notificar);
  manager.on("stack-item-popped", notificar);
  manager.on("stack-cleared", notificar);

  // Se reemplaza solo la API pública; el objeto `temporal` conserva su
  // identidad para cualquier referencia que ya exista.
  temporal.getState = () => estadoActual;
  temporal.getInitialState = () => estadoActual;
  // `runAsSingleSceneHistoryStep` fusiona `pastStates` a mano. Sobre Yjs no se
  // puede: se ignora y la fusión la hace `captureTimeout`.
  temporal.setState = () => {};

  publicar();

  return {
    estaPausado: () => pausado,
    destruir: () => {
      if (destruido) return;
      destruido = true;

      manager.off("stack-item-added", notificar);
      manager.off("stack-item-updated", notificar);
      manager.off("stack-item-popped", notificar);
      manager.off("stack-cleared", notificar);
      manager.destroy();

      temporal.getState = originales.getState;
      temporal.getInitialState = originales.getInitialState;
      temporal.setState = originales.setState;
      // El store original todavía tiene el estado del shim: se devuelve el de
      // zundo para que `undo`/`redo` vuelvan a ser los suyos.
      empujarAlStore(estadoOriginal);
    },
  };
}
