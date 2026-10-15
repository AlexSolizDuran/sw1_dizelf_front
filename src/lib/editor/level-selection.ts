import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  useScene,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";

/**
 * Al borrar un piso hay que mover la selección a otro: si no, el editor queda
 * apuntando a un id que ya no existe y las herramientas de colocación quedan
 * mudas.
 *
 * Esta lógica vive en `lib/level-selection.ts` del paquete y **no está
 * exportada** (`@pascal-app/editor/src/index.tsx` no la incluye). Está
 * reimplementada acá para que el selector de pisos propio pueda usarla.
 *
 * Riesgo: si el paquete cambia su semántica, esta copia queda vieja en
 * silencio. Es la razón por la que vale la pena mirarla en cada upgrade.
 */
function pisoVecinoParaBorrar(nivelId: AnyNodeId): LevelNode["id"] | null {
  const { nodes } = useScene.getState();
  const nivel = nodes[nivelId];
  if (nivel?.type !== "level" || !nivel.parentId) return null;

  const edificio = nodes[nivel.parentId as AnyNodeId];
  if (edificio?.type !== "building") return null;

  const hermanos = (edificio as BuildingNode).children.filter(
    (id): id is LevelNode["id"] => nodes[id as AnyNodeId]?.type === "level",
  );
  const indice = hermanos.indexOf(nivel.id);
  if (indice === -1) return null;

  // El de abajo primero (el anterior en la lista) y, si no hay, el de arriba.
  return hermanos[indice - 1] ?? hermanos[indice + 1] ?? null;
}

export function borrarPisoConSelectionDeRespaldo(nivelId: AnyNodeId): void {
  const estabaSeleccionado = useViewer.getState().selection.levelId === nivelId;
  const siguiente = pisoVecinoParaBorrar(nivelId);

  useScene.getState().deleteNode(nivelId);

  if (estabaSeleccionado) {
    useViewer.getState().setSelection({ levelId: siguiente });
  }
}

/** Nombre visible de un piso: el que le puso el usuario, o `Nivel N`. */
export function nombreDePiso(nivel: AnyNode | undefined): string {
  const conNombre = nivel as (AnyNode & { name?: string }) | undefined;
  const explicito = conNombre?.name?.trim();
  if (explicito) return explicito;
  const nivelado = (nivel as (AnyNode & { level?: number }) | undefined)?.level;
  return `Nivel ${typeof nivelado === "number" ? nivelado : 0}`;
}