"use client";

import { Check, Loader2, PencilRuler, X } from "lucide-react";
import type { PendingProposal } from "@/lib/ia/types";

interface Props {
  propuestas: PendingProposal[];
  resolviendo: boolean;
  puedeEditar: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
}

function resumenArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args, null, 2);
  return json === undefined ? "{}" : json;
}

/**
 * Bandeja de propuestas HITL.
 *
 * En modo Build cada tool de escritura corre sobre un borrador reversible y
 * llega acá con el resultado de la validación. La escena solo cambia cuando la
 * persona aprueba, y ahí se aplica el lote completo.
 */
export function ProposalPanel({
  propuestas,
  resolviendo,
  puedeEditar,
  onAprobar,
  onRechazar,
}: Props) {
  if (propuestas.length === 0) return null;

  return (
    <section className="shrink-0 border-t border-[var(--border)] bg-[var(--accent)]/60 px-3 py-2">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PencilRuler className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground)]">
            Propuestas ({propuestas.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card)] disabled:opacity-40"
            disabled={resolviendo}
            onClick={onRechazar}
            type="button"
          >
            <X className="h-3 w-3" />
            Descartar
          </button>
          <button
            className="flex items-center gap-1 rounded bg-[var(--primary)] px-2 py-1 text-[11px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={resolviendo || !puedeEditar}
            onClick={onAprobar}
            type="button"
          >
            {resolviendo ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {resolviendo ? "Aplicando…" : "Aprobar"}
          </button>
        </div>
      </header>

      <div className="max-h-40 space-y-2 overflow-y-auto">
        {propuestas.map((propuesta) => (
          <div
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5"
            key={propuesta.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-medium text-[var(--primary)]">
                {propuesta.toolName}
              </span>
              <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {propuesta.risk === "destructive" ? "destructivo" : "escritura"}
              </span>
            </div>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-[var(--muted-foreground)]">
              {resumenArgs(propuesta.args)}
            </pre>
            {propuesta.validacion &&
              propuesta.validacion.errores + propuesta.validacion.advertencias > 0 && (
                <p
                  className={`mt-1 text-[10px] leading-snug ${
                    propuesta.validacion.errores > 0
                      ? "text-[var(--destructive)]"
                      : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {propuesta.validacion.errores > 0
                    ? `${propuesta.validacion.errores} error(es)`
                    : `${propuesta.validacion.advertencias} advertencia(s)`}
                  {propuesta.validacion.detalle.length > 0
                    ? `: ${propuesta.validacion.detalle[0]}`
                    : ""}
                </p>
              )}
          </div>
        ))}
      </div>
    </section>
  );
}
