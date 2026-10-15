"use client";

import { useCallback, useEffect, useState } from "react";
import { useEditor } from "@pascal-app/editor";
import { TOOL_ICON } from "./icons/glyphs";
import s from "./editor.module.css";

/**
 * Las 9 herramientas de estructura.
 *
 * Los `id` son los del union `StructureTool` del paquete: `stair` (no
 * `stairs`). Un id que no exista deja la herramienta muda.
 */
type StructureTool =
  | "wall"
  | "door"
  | "window"
  | "slab"
  | "column"
  | "ceiling"
  | "stair"
  | "roof"
  | "zone";

const tools: { id: StructureTool; label: string; shortcut: string }[] = [
  { id: "wall", label: "Muro", shortcut: "1" },
  { id: "door", label: "Puerta", shortcut: "2" },
  { id: "window", label: "Ventana", shortcut: "3" },
  { id: "slab", label: "Piso", shortcut: "4" },
  { id: "column", label: "Columna", shortcut: "5" },
  { id: "ceiling", label: "Techo", shortcut: "6" },
  { id: "stair", label: "Escalera", shortcut: "7" },
  { id: "roof", label: "Tejado", shortcut: "8" },
  { id: "zone", label: "Zona", shortcut: "Z" },
];

const SHORTCUT_MAP: Record<string, StructureTool> = {
  "1": "wall",
  "2": "door",
  "3": "window",
  "4": "slab",
  "5": "column",
  "6": "ceiling",
  "7": "stair",
  "8": "roof",
  z: "zone",
};

export function BuildTab() {
  const [activeTool, setActiveTool] = useState<StructureTool | null>(null);

  const selectTool = useCallback((toolId: StructureTool) => {
    const state = useEditor.getState();
    state.setPhase("structure");
    // `zone` dibuja sobre la capa de zonas; el resto sobre elementos.
    state.setStructureLayer(toolId === "zone" ? "zones" : "elements");
    state.setMode("build");
    state.setTool(toolId);
    setActiveTool(toolId);
  }, []);

  const selectMode = useCallback((mode: string) => {
    const state = useEditor.getState();
    state.setMode(mode as never);
    state.setTool(null);
    setActiveTool(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const toolId = SHORTCUT_MAP[key];
      if (toolId) {
        e.preventDefault();
        selectTool(toolId);
      }
      if (key === "v") selectMode("select");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectTool, selectMode]);

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-baseline justify-between">
        <span className={s.techLabel}>Herramientas</span>
        <span className={s.toolKey}>{tools.length} activas</span>
      </div>

      <div className={s.toolGrid}>
        {tools.map((t) => {
          const Icon = TOOL_ICON[t.id];
          return (
            <button
              className={s.toolBtn}
              data-active={activeTool === t.id}
              key={t.id}
              onClick={() => selectTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              type="button"
            >
              {Icon ? <Icon className="h-[26px] w-[26px]" /> : null}
              <span className={s.toolName}>{t.label}</span>
              <span className={s.toolKey}>{t.shortcut}</span>
            </button>
          );
        })}
      </div>

      <p className={s.hint}>
        Elegí una herramienta y hacé clic en el plano. <kbd className={s.toolKey}>V</kbd>{" "}
        vuelve a selección, <kbd className={s.toolKey}>1–8</kbd> cambia de herramienta.
      </p>
    </div>
  );
}
