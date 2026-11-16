import type { SceneGraph } from "@pascal-app/editor";
import type { DocumentoProyecto } from "@/types/proyecto";

/**
 * Escena inicial de un proyecto nuevo: terreno de 30×30 m con un edificio y un
 * nivel.
 *
 * Vive en `lib/` y no en `editor-shell` porque la usan dos caminos:
 *
 *  - `createDefaultDocument`, al crear el proyecto (`apiCrearProyecto`), para
 *    que la escena quede persistida desde el primer instante.
 *  - `onLoad` del editor, como respaldo cuando el documento guardado está
 *    vacío o ilegible.
 *
 * POR QUÉ SE PERSISTE AL CREAR
 * ----------------------------
 * Antes solo existía en el store del cliente. El gateway sembraba su `Y.Doc`
 * desde una base vacía y emitía `sync:inicial` vacío; si ese evento llegaba
 * después de `onLoad`, `setScene` borraba el terreno y el editor quedaba sin
 * building/level ("Switch to a building level to view and edit the floorplan").
 */
export function createDefaultScene(): SceneGraph {
  const siteId = "site_default";
  const buildingId = "building_default";
  const levelId = "level_default";

  return {
    nodes: {
      [siteId]: {
        id: siteId,
        type: "site",
        polygon: {
          type: "polygon",
          points: [
            [-15, -15],
            [15, -15],
            [15, 15],
            [-15, 15],
          ],
        },
        children: [buildingId],
      },
      [buildingId]: {
        id: buildingId,
        type: "building",
        children: [levelId],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      [levelId]: {
        id: levelId,
        type: "level",
        level: 0,
        children: [],
      },
    },
    rootNodeIds: [siteId],
  } as SceneGraph;
}

/** Documento completo (`{ version, scene, vista }`) para un proyecto nuevo. */
export function createDefaultDocument(): DocumentoProyecto {
  return {
    version: 1,
    scene: createDefaultScene(),
    vista: "2d",
  };
}
