"use client";

import { useState } from "react";
import {
  Box,
  Check,
  Eye,
  EyeOff,
  Ruler,
  ScanSearch,
  Square,
  Triangle,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useViewer } from "@pascal-app/viewer";
import { useEditor } from "@pascal-app/editor";
import { Popover, PopoverBody, PopoverChevron, PopoverTrigger } from "./ui/popover";
import s from "../editor.module.css";

type TipoMedicion = "distance" | "angle" | "area" | "perimeter" | "volume" | "smart";

const MEDICIONES: { kind: TipoMedicion; label: string; Icon: LucideIcon }[] = [
  { kind: "distance", label: "Distancia", Icon: Ruler },
  { kind: "angle", label: "Ángulo", Icon: Triangle },
  { kind: "area", label: "Área", Icon: Square },
  { kind: "perimeter", label: "Perímetro", Icon: Waypoints },
  { kind: "volume", label: "Volumen", Icon: Box },
];

/**
 * Control de medición: botón principal con la última herramienta usada, más un
 * desplegable con las cinco medidas y el modo inteligente.
 *
 * Réplica de `action-menu/measurement-control.tsx` del paquete. El botón
 * principal alterna entre activar y desactivar; el desplegable fija cuál.
 */
export function MeasurementControl() {
  const [abierto, setAbierto] = useState(false);

  const mode = useEditor((st) => st.mode);
  const tool = useEditor((st) => st.tool);
  const ultimoKind = useEditor((st) => st.lastMeasurementKind);
  const kindActivo = useEditor((st) => st.toolDefaults.measurement?.kind);
  const setMode = useEditor((st) => st.setMode);
  const setPhase = useEditor((st) => st.setPhase);
  const setLastMeasurementKind = useEditor((st) => st.setLastMeasurementKind);
  const setStructureLayer = useEditor((st) => st.setStructureLayer);
  const setTool = useEditor((st) => st.setTool);
  const setToolDefaults = useEditor((st) => st.setToolDefaults);
  const showMeasurements = useViewer((st) => st.showMeasurements);
  const setShowMeasurements = useViewer((st) => st.setShowMeasurements);

  const seleccionada =
    MEDICIONES.find((m) => m.kind === ultimoKind) ?? MEDICIONES[0];
  const activo = mode === "build" && tool === "measurement";
  const smartActivo = activo && kindActivo === "smart";
  const IconoActivo = smartActivo ? ScanSearch : seleccionada.Icon;
  const etiquetaActiva = smartActivo ? "Inteligente" : seleccionada.label;

  const activar = (kind: TipoMedicion) => {
    setPhase("structure");
    setStructureLayer("elements");
    setLastMeasurementKind(kind as never);
    setToolDefaults("measurement", { kind } as never);
    setMode("build");
    setTool("measurement");
  };

  const clickPrincipal = () => {
    if (activo) {
      setMode("select");
      return;
    }
    activar(smartActivo ? "smart" : (ultimoKind as TipoMedicion));
  };

  return (
    <Popover>
      {({ abierto: abiertoPop }) => (
        <>
          <button
            aria-label={`Medir: ${etiquetaActiva}`}
            aria-pressed={activo}
            className={`${s.menuBtn} ${s.menuBtnSplit}`}
            data-active={activo}
            onClick={clickPrincipal}
            title={`Medir: ${etiquetaActiva} (M)`}
            type="button"
          >
            <IconoActivo className="h-5 w-5" />
            <span className={s.menuKey}>M</span>
          </button>

          <PopoverTrigger
            className={`${s.menuBtn} ${s.menuChevron} ${activo ? s.menuBtnOn : ""}`}
            label="Tipos de medición"
          >
            <PopoverChevron abierto={abiertoPop} />
          </PopoverTrigger>

          <PopoverBody Icon={Ruler} titulo="Medir">
            <div className={s.popoverList}>
              {MEDICIONES.map((m) => (
                <button
                  className={s.popoverRow}
                  data-active={activo && kindActivo === m.kind}
                  key={m.kind}
                  onClick={() => activar(m.kind)}
                  type="button"
                >
                  <m.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">{m.label}</span>
                  {activo && kindActivo === m.kind ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </button>
              ))}

              <div className={s.techDivider} />

              <button
                className={s.popoverRow}
                data-active={smartActivo}
                onClick={() => activar("smart")}
                type="button"
              >
                <ScanSearch className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Inteligente</span>
                {smartActivo ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>

              <div className={s.techDivider} />

              <button
                className={s.popoverRow}
                onClick={() => setShowMeasurements(!showMeasurements)}
                type="button"
              >
                {showMeasurements ? (
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="flex-1 text-left">
                  {showMeasurements ? "Ocultar mediciones" : "Mostrar mediciones"}
                </span>
              </button>
            </div>
          </PopoverBody>
        </>
      )}
    </Popover>
  );
}