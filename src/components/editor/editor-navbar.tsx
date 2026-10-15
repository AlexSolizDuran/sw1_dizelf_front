"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Box, Compass, Moon, Scan, Sun } from "lucide-react";
import { useEditor } from "@pascal-app/editor";
import { useViewer } from "@pascal-app/viewer";
import s from "./editor.module.css";

/** Tono del indicador de guardado, derivado del `SaveStatus` del paquete. */
export type TonoGuardado = "idle" | "working" | "saved" | "error";

const TEXTO_TONO: Record<TonoGuardado, string> = {
  idle: "Sin cambios",
  working: "Guardando",
  saved: "Guardado",
  error: "Sin guardar",
};

interface Props {
  nombreProyecto: string;
  tema: "claro" | "oscuro";
  onToggleTema: () => void;
  tonoGuardado: TonoGuardado;
  mensajeGuardado?: string | null;
}

export function EditorNavbar({
  nombreProyecto,
  tema,
  onToggleTema,
  tonoGuardado,
  mensajeGuardado,
}: Props) {
  const viewMode = useEditor((st) => st.viewMode);
  const mode = useEditor((st) => st.mode);
  const setViewMode = useEditor((st) => st.setViewMode);
  const setMode = useEditor((st) => st.setMode);
  const setTool = useEditor((st) => st.setTool);
  const sceneTheme = useViewer((st) => st.sceneTheme);
  const setSceneTheme = useViewer((st) => st.setSceneTheme);

  const volverASeleccion = useCallback(() => {
    setMode("select");
    setTool(null);
  }, [setMode, setTool]);

  return (
    <div className={s.topbar}>
      <Link
        aria-label="Volver a mis proyectos"
        className={s.iconBtn}
        href="/proyectos"
        title="Volver a mis proyectos"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>

      <div className={s.brandMark}>D</div>
      <span className={s.brandName}>Dizelf</span>
      <div className={s.vDivider} />
      <span className={s.projectName}>{nombreProyecto}</span>

      <div className="ml-auto flex items-center gap-2">
        <div
          className={s.saveState}
          data-tone={tonoGuardado}
          title={mensajeGuardado ?? undefined}
        >
          <span className={s.saveDot} data-tone={tonoGuardado} />
          <span>{TEXTO_TONO[tonoGuardado]}</span>
        </div>

        <div className={s.seg}>
          <button
            data-active={viewMode === "2d"}
            onClick={() => setViewMode("2d")}
            type="button"
          >
            <Scan className="h-3.5 w-3.5" />
            2D
          </button>
          <button
            data-active={viewMode === "3d"}
            onClick={() => setViewMode("3d")}
            type="button"
          >
            <Box className="h-3.5 w-3.5" />
            3D
          </button>
        </div>

        <div className={s.seg}>
          <button
            data-active={mode === "select"}
            onClick={volverASeleccion}
            type="button"
          >
            <Compass className="h-3.5 w-3.5" />
            Select
          </button>
        </div>

        <button
          aria-label="Ambiente 3D"
          className={s.iconBtn}
          onClick={() => setSceneTheme(sceneTheme === "night" ? "overcast" : "night")}
          title="Ambiente 3D"
          type="button"
        >
          <span className="font-mono text-[10px]">
            {sceneTheme === "night" ? "N" : "O"}
          </span>
        </button>

        <button
          aria-label={tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
          className={s.iconBtn}
          onClick={onToggleTema}
          title={tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
          type="button"
        >
          {tema === "oscuro" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
