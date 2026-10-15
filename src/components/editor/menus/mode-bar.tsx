"use client";

import { Boxes, MousePointer2, Trash2, type LucideIcon } from "lucide-react";
import { useEditor } from "@pascal-app/editor";
import { MeasurementControl } from "./measurement-control";
import s from "../editor.module.css";

type Control = "select" | "zone" | "delete";

const CONTROLES: {
  id: Control;
  label: string;
  atajo: string;
  Icon: LucideIcon;
  color: string;
}[] = [
  {
    id: "select",
    label: "Seleccionar",
    atajo: "V",
    Icon: MousePointer2,
    color: "hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)]",
  },
  {
    id: "zone",
    label: "Zona",
    atajo: "Z",
    Icon: Boxes,
    color: "hover:bg-[color-mix(in_oklch,var(--primary)_14%,transparent)]",
  },
  {
    id: "delete",
    label: "Borrar",
    atajo: "X",
    Icon: Trash2,
    color: "hover:bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)]",
  },
];

/**
 * Barra de modos: Seleccionar · Zona · Borrar, con el control de medición antes
 * del botón de borrar — igual que el `ControlModes` del paquete.
 *
 * Réplica de `action-menu/control-modes.tsx`, con los mismos disparadores de
 * store. La diferencia es el texto (español, voseo) y los íconos, que son de
 * lucide en vez de los `.webp` que el paquete no tiene.
 */
export function ModeBar() {
  const mode = useEditor((st) => st.mode);
  const phase = useEditor((st) => st.phase);
  const selectionTool = useEditor((st) => st.floorplanSelectionTool);
  const structureLayer = useEditor((st) => st.structureLayer);
  const setMode = useEditor((st) => st.setMode);
  const setPhase = useEditor((st) => st.setPhase);
  const setStructureLayer = useEditor((st) => st.setStructureLayer);
  const setSelectionTool = useEditor((st) => st.setFloorplanSelectionTool);

  const estaEnSitio = phase === "site";

  const activo = (id: Control): boolean => {
    if (id === "select") return mode === "select" && selectionTool === "click";
    if (id === "zone")
      return mode === "build" && phase === "structure" && structureLayer === "zones";
    return mode === id;
  };

  const click = (id: Control) => {
    // Salir primero de la edición del terreno, si es que estamos en ella.
    if (estaEnSitio) {
      setPhase("structure");
      setStructureLayer("elements");
    }

    if (id === "select") {
      setMode("select");
      setSelectionTool("click");
    } else if (id === "zone") {
      // Zona alterna: si ya está activa, vuelve a selección.
      if (activo("zone")) {
        setMode("select");
      } else {
        setPhase("structure");
        setStructureLayer("zones");
        setMode("build");
      }
    } else {
      setMode(id);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {CONTROLES.map((c) => (
        <div className="contents" key={c.id}>
          {/* Igual que el original: la medición va justo antes de borrar. */}
          {c.id === "delete" ? <MeasurementControl /> : null}
          <button
            aria-label={c.label}
            aria-pressed={activo(c.id)}
            className={`${s.menuBtn} ${c.color}`}
            data-active={activo(c.id)}
            onClick={() => click(c.id)}
            title={`${c.label} (${c.atajo})`}
            type="button"
          >
            <c.Icon className="h-5 w-5" />
            <span className={s.menuKey}>{c.atajo}</span>
          </button>
        </div>
      ))}
    </div>
  );
}