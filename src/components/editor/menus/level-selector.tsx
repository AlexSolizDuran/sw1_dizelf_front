"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  LevelNode as LevelNodeSchema,
  cloneLevelSubtree,
  useScene,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { useEditor, useSidebarStore } from "@pascal-app/editor";
import { useShallow } from "zustand/react/shallow";
import {
  Copy,
  GripVertical,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { borrarPisoConSelectionDeRespaldo, nombreDePiso } from "@/lib/editor/level-selection";
import s from "../editor.module.css";

/**
 * Selector de pisos propio.
 *
 * Réplica de `ui/floating-level-selector.tsx` del paquete, con las mismas
 * operaciones: agregar arriba y abajo, insertar entre dos, renombrar, duplicar,
 * borrar con confirmación y reordenar arrastrando.
 *
 * Una diferencia deliberada: **no incluye "pegar en este nivel"**. El portapapeles
 * del editor vive en `lib/scene-clipboard.ts` (332 líneas), no está exportado, y
 * lo alimenta el `Ctrl+C` que corre en el hook de teclado del propio paquete.
 * Reimplementarlo dejaría dos portapapeles conviviendo: copiar en uno y pegar en
 * el otro fallaría. El `Ctrl+V` del paquete sigue funcionando y pega en el nivel
 * actual; lo que se pierde es pegar en un nivel distinto al actual.
 */
export function LevelSelector() {
  const edificioSeleccionado = useViewer((st) => st.selection.buildingId);
  const nivelSeleccionado = useViewer((st) => st.selection.levelId);
  const setSelection = useViewer((st) => st.setSelection);
  const createNode = useScene((st) => st.createNode);
  const createNodes = useScene((st) => st.createNodes);
  const updateNodes = useScene((st) => st.updateNodes);

  const [porBorrar, setPorBorrar] = useState<LevelNode | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  /**
   * El selector vive como hermano de `<Editor>`, así que se posiciona contra
   * `.shell` (fixed inset 0) y no contra la columna del visor. Hay que
   * reconstruir el desplazamiento que antes le daba el layout:
   *
   *   x = rail (44px) + panel del sidebar + `left-3` (12px)
   *   y = navbar (44px) + `top-14` (56px)
   *
   * El ancho del panel sale del store porque es redimensionable y colapsable:
   * con un valor fijo, el selector se desalinearía al cambiar el tamaño.
   */
  const anchoPanel = useSidebarStore((st) => (st.isCollapsed ? 0 : st.width));
  const desplazamientoX = 44 + anchoPanel + 20;
  const desplazamientoY = 44 + 56;

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** Si no hay edificio elegido, tomamos el primero de la escena. */
  const edificioId = useScene((state) => {
    if (edificioSeleccionado) return edificioSeleccionado;
    const primero = Object.values(state.nodes).find(
      (n) => n?.type === "building"
    ) as BuildingNode | undefined;
    return primero?.id ?? null;
  });

  const niveles = useScene(
    useShallow((state) => {
      if (!edificioId) return [] as LevelNode[];
      const edificio = state.nodes[edificioId];
      if (!edificio || edificio.type !== "building") return [] as LevelNode[];
      return (edificio as BuildingNode).children
        .map((id) => state.nodes[id])
        .filter((n): n is LevelNode => n?.type === "level")
        .sort((a, b) => a.level - b.level);
    })
  );

  const nivelesVisibles = useMemo(() => [...niveles].reverse(), [niveles]);
  const hayNiveles = niveles.length > 0;

  const crearEn = useCallback(
    (numero: number, desplazarDesde?: number) => {
      if (!edificioId) return;
      // Para insertar en el medio hay que correr todos los de arriba.
      if (desplazarDesde !== undefined) {
        const aMover = niveles.filter((l) => l.level >= desplazarDesde);
        if (aMover.length > 0) {
          updateNodes(
            aMover.map((l) => ({
              id: l.id as AnyNodeId,
              data: { level: l.level + 1 } as Partial<AnyNode>,
            }))
          );
        }
      }
      // El schema genera el `id` y aplica los defaults del tipo.
      const nuevo = LevelNodeSchema.parse({
        level: numero,
        children: [],
        parentId: edificioId,
      });
      createNode(nuevo as AnyNode, edificioId);
      setSelection({ buildingId: edificioId, levelId: nuevo.id });
    },
    [edificioId, niveles, createNode, updateNodes, setSelection]
  );

  const agregarArriba = () => {
    const maximo = hayNiveles ? Math.max(...niveles.map((l) => l.level)) : -1;
    crearEn(maximo + 1);
  };

  const agregarAbajo = () => {
    const minimo = hayNiveles ? Math.min(...niveles.map((l) => l.level)) : 1;
    crearEn(minimo - 1);
  };

  const insertarEntre = (indiceInferior: number) => {
    const inferior = niveles[indiceInferior];
    if (!inferior) return;
    crearEn(inferior.level + 1, inferior.level + 1);
  };

  const confirmarBorrar = () => {
    if (!porBorrar) return;
    borrarPisoConSelectionDeRespaldo(porBorrar.id as AnyNodeId);
    setPorBorrar(null);
  };

  /**
   * Duplica un piso: copia su subárbol completo un nivel más arriba.
   *
   * `cloneLevelSubtree` clona la|subárbol tal cual, con ids remapeados pero sin
   * tocar el número de nivel ni correr los de arriba. Eso corre por nuestra
   * cuenta: primero se sube un escalón todo lo que está por encima, después se
   * clona y se le asigna el número al nivel nuevo.
   */
  const duplicar = useCallback(
    (nivel: LevelNode) => {
      if (!edificioId) return;
      const escena = useScene.getState();

      const aSubir = niveles.filter((l) => l.level > nivel.level);
      if (aSubir.length > 0) {
        updateNodes(
          aSubir.map((l) => ({
            id: l.id as AnyNodeId,
            data: { level: l.level + 1 } as Partial<AnyNode>,
          }))
        );
      }

      const { clonedNodes, newLevelId } = cloneLevelSubtree(
        escena.nodes,
        nivel.id as AnyNodeId
      );

      // El clon conserva `level` y `parentId` del original: se le da el número
      // del escalón nuevo y se cuelga del mismo edificio.
      const ops = clonedNodes.map((nodo) => {
        const esNivel = nodo.id === newLevelId;
        return {
          node: {
            ...nodo,
            level: esNivel ? nivel.level + 1 : (nodo as AnyNode & { level?: number }).level,
            parentId: esNivel ? edificioId : nodo.parentId,
          } as AnyNode,
          parentId: esNivel ? edificioId : (nodo.parentId as AnyNodeId | undefined),
        };
      });

      createNodes(ops);
      setSelection({ buildingId: edificioId, levelId: newLevelId as LevelNode["id"] });
    },
    [niveles, edificioId, createNodes, updateNodes, setSelection]
  );

  /** Reordena: al soltar, se reescribe el índice de cada nivel. */
  const alSoltar = (event: DragEndEvent) => {
    setArrastrando(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceViejo = nivelesVisibles.findIndex((l) => l.id === active.id);
    const indiceNuevo = nivelesVisibles.findIndex((l) => l.id === over.id);
    if (indiceViejo === -1 || indiceNuevo === -1) return;

    const reordenados = [...nivelesVisibles];
    const [movido] = reordenados.splice(indiceViejo, 1);
    reordenados.splice(indiceNuevo, 0, movido);

    // La lista es inversa a propósito (arriba = nivel más alto). Se reescribe
    // el índice de cada nivel de arriba hacia abajo.
    updateNodes(
      reordenados.map((nivel, i) => ({
        id: nivel.id as AnyNodeId,
        data: { level: reordenados.length - 1 - i } as Partial<AnyNode>,
      }))
    );
  };

  if (!edificioId || !hayNiveles) return null;

  return (
    <div
      className={s.levelDock}
      data-viewer-bounds=""
      style={{ top: desplazamientoY, left: desplazamientoX }}
    >
      <div className={s.levelAddRow}>
        <button
          aria-label="Agregar piso arriba"
          className={s.levelAdd}
          onClick={agregarArriba}
          title="Agregar piso arriba"
          type="button"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={() => setArrastrando(null)}
        onDragEnd={alSoltar}
        onDragStart={(e) => setArrastrando(String(e.active.id))}
        sensors={sensores}
      >
        <SortableContext
          items={nivelesVisibles.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className={s.levelList}>
            {nivelesVisibles.map((nivel, i) => (
              <FilaNivel
                arrastrando={arrastrando === nivel.id}
                key={nivel.id}
                nivel={nivel}
                onDuplicar={() => duplicar(nivel)}
                onPedirBorrar={() => setPorBorrar(nivel)}
                onInsertar={() => insertarEntre(niveles.length - 1 - i - 1)}
                seleccionado={nivel.id === nivelSeleccionado}
                onSeleccionar={() =>
                  setSelection({ buildingId: edificioId, levelId: nivel.id })
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className={s.levelAddRow}>
        <button
          aria-label="Agregar piso abajo"
          className={s.levelAdd}
          onClick={agregarAbajo}
          title="Agregar piso abajo"
          type="button"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {porBorrar ? (
        <div className={s.levelConfirm}>
          <p className={s.hint}>
            ¿Borrar <strong>{nombreDePiso(porBorrar)}</strong> y todo lo que
            contiene? No se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              className={`${s.propsAct} ${s.propsActDanger}`}
              onClick={confirmarBorrar}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
            <button
              className={s.propsAct}
              onClick={() => setPorBorrar(null)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Fila ────────────────────────────────────────────────────────────────── */

function FilaNivel({
  nivel,
  seleccionado,
  arrastrando,
  onSeleccionar,
  onPedirBorrar,
  onDuplicar,
  onInsertar,
}: {
  nivel: LevelNode;
  seleccionado: boolean;
  arrastrando: boolean;
  onSeleccionar: () => void;
  onPedirBorrar: () => void;
  onDuplicar: () => void;
  onInsertar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: nivel.id });

  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nombreDePiso(nivel));

  const guardarNombre = () => {
    const limpio = borrador.trim();
    if (limpio && limpio !== nombreDePiso(nivel)) {
      useScene.getState().updateNodes([
        { id: nivel.id as AnyNodeId, data: { name: limpio } as Partial<AnyNode> },
      ]);
    }
    setEditando(false);
  };

  return (
    <li className={s.levelRow} ref={setNodeRef}>
      <span
        className={`${s.levelRowInner} ${seleccionado ? s.levelRowOn : ""} ${arrastrando ? s.levelRowDrag : ""}`}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <button
          aria-label={`Reordenar ${nombreDePiso(nivel)}`}
          className={s.levelGrip}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {editando ? (
          <input
            autoFocus
            className={s.levelNameInput}
            onBlur={guardarNombre}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardarNombre();
              if (e.key === "Escape") {
                setBorrador(nombreDePiso(nivel));
                setEditando(false);
              }
            }}
            value={borrador}
          />
        ) : (
          <button
            className={s.levelName}
            onClick={onSeleccionar}
            onDoubleClick={() => {
              setBorrador(nombreDePiso(nivel));
              setEditando(true);
            }}
            title="Clic para seleccionar · doble clic para renombrar"
            type="button"
          >
            {nombreDePiso(nivel)}
          </button>
        )}

        <span className={s.levelActions}>
          <button
            aria-label={`Insertar piso entre ${nombreDePiso(nivel)} y el de abajo`}
            className={s.levelAction}
            onClick={onInsertar}
            title="Insertar un piso entre este y el de abajo"
            type="button"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            aria-label={`Duplicar ${nombreDePiso(nivel)}`}
            className={s.levelAction}
            onClick={onDuplicar}
            title="Duplicar este piso"
            type="button"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            aria-label={`Borrar ${nombreDePiso(nivel)}`}
            className={`${s.levelAction} ${s.levelActionDanger}`}
            onClick={onPedirBorrar}
            title="Borrar este piso"
            type="button"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </span>
    </li>
  );
}

export { Layers };