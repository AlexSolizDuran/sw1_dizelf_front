"use client";

import { sceneRegistry, useScene } from "@pascal-app/core";
import { useEditor, exportSceneToGlb } from "@pascal-app/editor";
import { useViewer } from "@pascal-app/viewer";
import type { Object3D } from "three";

/** Nombre del grupo exportable dentro del canvas del editor. */
const GRUPO_ESCENA = "scene-renderer";

/** Dos frames: uno encola el render y el otro confirma que ya se pintó. */
function siguienteFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function esperarDosFrames(): Promise<void> {
  await siguienteFrame();
  await siguienteFrame();
}

/**
 * Sube por los padres hasta el grupo que el paquete usa como raíz exportable.
 *
 * No se puede pedir con un hook de R3F (`useThree`) porque el botón vive en la
 * navbar, fuera del canvas. El registro de escena sí es accesible desde
 * cualquier componente cliente: guarda cada nodo con su `Object3D`.
 */
function buscarGrupoEscena(): Object3D | null {
  for (const objeto of sceneRegistry.nodes.values()) {
    let actual: Object3D | null = objeto;
    while (actual) {
      if (actual.name === GRUPO_ESCENA) return actual;
      actual = actual.parent;
    }
  }
  return null;
}

/**
 * Genera el GLB de lo que el usuario ve ahora.
 *
 * Devuelve el binario sin descargarlo: quien llama decide si lo sube. Es la
 * misma ruta que usa el panel de Ajustes (Export GLB), para que lo publicado y
 * lo descargado a mano sean idénticos.
 *
 * Si el editor está en 2D hay que forzar la vista 3D antes de exportar: el
 * grupo `scene-renderer` no existe mientras la escena 3D está desmontada.
 */
export async function exportarGlbDelProyecto(): Promise<Blob> {
  const editor = useEditor.getState();

  if (editor.viewMode !== "3d") {
    editor.setViewMode("3d");
    await esperarDosFrames();
  }

  const grupo = buscarGrupoEscena();
  if (!grupo) {
    throw new Error(
      "No encontramos la escena 3D. Abrí la vista 3D del proyecto y volvé a intentar."
    );
  }

  // Avisa a los tipos instanciados (árboles, plantas) que cambien su proxy
  // invisible por geometría exportable antes de que se clone el grafo.
  useViewer.getState().setExporting(true);
  try {
    await esperarDosFrames();
    const buffer = await exportSceneToGlb(grupo, useScene.getState().nodes);
    return new Blob([buffer], { type: "model/gltf-binary" });
  } finally {
    useViewer.getState().setExporting(false);
  }
}
