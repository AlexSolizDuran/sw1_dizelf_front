"use client";

import { useEffect } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useDictadoVoz } from "@/hooks/use-dictado-voz";

interface Props {
  onTexto: (texto: string) => void;
  disabled?: boolean;
  title?: string;
}

/** Botón de dictado: la primera pulsación graba; la segunda transcribe. */
export function DictationButton({
  onTexto,
  disabled = false,
  title = "Dictar mensaje por voz",
}: Props) {
  const { grabando, transcribiendo, solicitando, error, alternar, limpiarError } =
    useDictadoVoz({ onTexto });

  useEffect(() => {
    if (error === null) return;
    const timer = setTimeout(() => limpiarError(), 7000);
    return () => clearTimeout(timer);
  }, [error, limpiarError]);

  const etiqueta = grabando
    ? "Detener y transcribir"
    : transcribiendo
      ? "Transcribiendo…"
      : solicitando
        ? "Pidiendo micrófono…"
        : title;

  const bloqueado = disabled || transcribiendo || solicitando;

  return (
    <div className="relative shrink-0">
      <button
        aria-label={etiqueta}
        className={`flex h-9 w-9 items-center justify-center rounded border transition-colors ${
          grabando
            ? "border-[var(--destructive)] bg-[var(--destructive)] text-[var(--destructive-foreground)]"
            : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        } disabled:opacity-40`}
        disabled={bloqueado}
        onClick={alternar}
        title={etiqueta}
        type="button"
      >
        {solicitando || transcribiendo ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : grabando ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {error && (
        <p
          className="absolute bottom-full right-0 mb-1 w-56 rounded border border-[var(--destructive)] bg-[var(--card)] px-2 py-1 text-[11px] leading-snug text-[var(--destructive)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
