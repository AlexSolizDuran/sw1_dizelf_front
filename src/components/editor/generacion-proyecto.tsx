"use client";

import { CheckCircle2, Loader2, TriangleAlert, X } from "lucide-react";
import { useGeneracionProyecto } from "@/hooks/use-generacion-proyecto";

interface Props {
  proyectoId: string;
  puedeEditar: boolean;
  listo: boolean;
}

/**
 * Banner del runner de generación.
 *
 * No bloquea el editor: mientras corre muestra el paso actual, y al terminar
 * deja un resumen cerrable con las incidencias. Si el usuario recarga, el plan
 * ya se consumió y no aparece nada.
 */
export function GeneracionProyecto({
  proyectoId,
  puedeEditar,
  listo,
}: Props) {
  const { fase, mensaje, detalle, cerrar } = useGeneracionProyecto({
    proyectoId,
    puedeEditar,
    listo,
  });

  if (fase === "inactivo") return null;

  const trabajando =
    fase === "preparando" || fase === "creando" || fase === "validando";
  const error = fase === "error";

  return (
    <div
      aria-live={error ? "assertive" : "polite"}
      className={`fixed left-1/2 top-20 z-[80] w-full max-w-md -translate-x-1/2 rounded-md border px-4 py-3 shadow-lg ${
        error
          ? "border-red-300 bg-red-50 text-red-800"
          : fase === "listo"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-[var(--border)] bg-white text-[var(--foreground)]"
      }`}
      role={error ? "alert" : "status"}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">
          {trabajando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : error ? (
            <TriangleAlert className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{mensaje}</p>
          {detalle.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs opacity-80">
              {detalle.map((linea, indice) => (
                <li key={`${indice}-${linea}`}>{linea}</li>
              ))}
            </ul>
          )}
        </div>
        {!trabajando && (
          <button
            aria-label="Cerrar aviso"
            className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
            onClick={cerrar}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
