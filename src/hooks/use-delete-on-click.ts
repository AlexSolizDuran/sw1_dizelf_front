"use client";

import { useEffect } from "react";
import {
  nodeRegistry,
  resolveLevelId,
  useScene,
  type AnyNode,
  type AnyNodeId,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { useEditor } from "@pascal-app/editor";

/**
 * Click-to-delete del modo borrar ("martillo").
 *
 * POR QUÉ EXISTE: el modo borrar de `@pascal-app/editor` delega en eventos
 * `${tipo}:click` del `emitter` (selection-manager.tsx, `onClick` en el effect
 * de delete). En la 0.9.2 —y también en la 1.0.4— esos eventos casi nunca se
 * emiten: en todo el paquete solo hay dos emisiones, `wall:click` y
 * `ceiling:click`, y ambas están condicionadas a colocar aberturas
 * (`isOpeningPlacementActive` / `isCeilingBuildActive`). Los nodos del registro
 * solo hacen `event.stopPropagation()`. Resultado: el modo borrar se activa
 * (el ícono se pinta, el hover marca en rojo) pero el clic no borra nada.
 *
 * No se puede arreglar desde la app sin tocar `node_modules`, así que se
 * reimplementa la parte útil con las APIs públicas. Es complementario al
 * paquete: si una versión futura emite los eventos, este hook no estorba
 * porque `deleteNode` sobre un id que ya no existe es un no-op.
 */
export function useDeleteOnClick() {
  const mode = useEditor((st) => st.mode);

  useEffect(() => {
    if (mode !== "delete") return;

    const onClick = (event: MouseEvent) => {
      // El plano 2D es SVG y el visor 3D es un <canvas>. Los menús y paneles
      // propios son HTML, así que esto descarta los clics que caen en nuestra UI.
      const target = event.target;
      const sobreElPlano =
        target instanceof SVGElement ||
        (typeof HTMLCanvasElement !== "undefined" && target instanceof HTMLCanvasElement);
      if (!sobreElPlano) return;

      const hoveredId = useViewer.getState().hoveredId as AnyNodeId | null;
      if (!hoveredId) return;

      const scene = useScene.getState();
      const node = scene.nodes[hoveredId] as AnyNode | undefined;
      if (!node) return;
      if (node.type === "building" || node.type === "site") return;
      if (nodeRegistry.get(node.type)?.capabilities.deletable === false) return;

      // Los ascensores son de alcance edificio; el resto se filtra por nivel.
      if (node.type !== "elevator") {
        const nivelActual = useViewer.getState().selection.levelId;
        if (nivelActual && resolveLevelId(node, scene.nodes) !== nivelActual) return;
      }

      scene.deleteNode(hoveredId);
      if (node.parentId) scene.dirtyNodes.add(node.parentId as AnyNodeId);

      useViewer.setState({ hoveredId: null });
      // El paquete puede seleccionar el nodo en el mismo clic. Como ya no
      // existe, se limpia siempre: el panel de Propiedades no debe quedar
      // apuntando a algo borrado.
      useViewer.getState().setSelection({ selectedIds: [], zoneId: null });
    };

    // CAPTURA, no bubble. Cada nodo del registry layer hace
    // `onClick={onClickStop}` → `event.stopPropagation()`
    // (floorplan-registry-layer.tsx:1618). React 17+ engancha los eventos
    // sintéticos en el contenedor raíz, así que ese `stopPropagation` frena
    // también el evento nativo y un listener en `window` en fase bubble nunca
    // se ejecuta para clics sobre nodos 2D. En captura el listener corre antes
    // del target y ningún `stopPropagation` posterior puede alcanzarlo.
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [mode]);
}