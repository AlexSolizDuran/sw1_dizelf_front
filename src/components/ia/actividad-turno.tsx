"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flag,
  Info,
  Loader2,
  MessageSquare,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import type { TurnEvent } from "@/lib/ia/types";

/**
 * Subventana de actividad del asistente.
 *
 * Muestra el turno como una línea de tiempo: preparación, cada respuesta del
 * modelo, cada tool con sus argumentos y resultado, los empujones automáticos
 * de la app y el cierre. Es el detalle que los chips de `TurnTrace` no pueden
 * mostrar; los dos se alimentan del mismo loop.
 */

const ETIQUETA_ESTADO: Record<NonNullable<TurnEvent["status"]>, string> = {
  ok: "ok",
  propuesta: "propone",
  repetida: "repetida",
  error: "error",
  info: "info",
};

const ETIQUETA_RIESGO: Record<NonNullable<TurnEvent["riesgo"]>, string> = {
  read: "lectura",
  write: "escritura",
  destructive: "destructiva",
};

function tonoDe(evento: TurnEvent): string {
  if (evento.status === "error") {
    return "border-[var(--destructive)]/40 bg-[var(--destructive)]/5";
  }
  if (evento.status === "propuesta") {
    return "border-[var(--accent-foreground)]/30 bg-[var(--accent)]/40";
  }
  if (evento.status === "repetida") {
    return "border-[var(--border)] bg-[var(--muted)]";
  }
  return "border-[var(--border)] bg-[var(--background)]";
}

function IconoDe({ evento }: { evento: TurnEvent }) {
  if (evento.status === "error") {
    return <XCircle className="h-3 w-3 shrink-0 text-[var(--destructive)]" />;
  }
  if (evento.kind === "tool") {
    return <Wrench className="h-3 w-3 shrink-0 text-[var(--primary)]" />;
  }
  if (evento.kind === "modelo") {
    return <MessageSquare className="h-3 w-3 shrink-0 text-[var(--primary)]" />;
  }
  if (evento.kind === "sistema") {
    return <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--accent-foreground)]" />;
  }
  if (evento.kind === "cierre") {
    return <Flag className="h-3 w-3 shrink-0 text-[var(--primary)]" />;
  }
  if (evento.kind === "inicio") {
    return <Info className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />;
  }
  return <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--primary)]" />;
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function Detalle({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span>{" "}
        {etiqueta}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function Bloque({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border)] bg-[var(--card)] p-1.5 font-mono text-[10px] leading-snug text-[var(--foreground)]">
      {children}
    </pre>
  );
}

function Paso({ evento }: { evento: TurnEvent }) {
  if (evento.kind === "tool") {
    const estado = evento.status ? ETIQUETA_ESTADO[evento.status] : "info";
    return (
      <div className={`rounded border px-2 py-1.5 ${tonoDe(evento)}`}>
        <div className="flex items-center gap-1.5">
          <IconoDe evento={evento} />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold">
            {evento.toolName}
          </span>
          {evento.durationMs !== undefined && (
            <span className="shrink-0 font-mono text-[9px] text-[var(--muted-foreground)]">
              {evento.durationMs < 1000
                ? `${evento.durationMs} ms`
                : segundos(evento.durationMs)}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span
            className={`rounded border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              evento.status === "error"
                ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]"
                : evento.status === "propuesta"
                  ? "border-[var(--accent-foreground)]/30 bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
            }`}
          >
            {estado}
          </span>
          {evento.riesgo && (
            <span className="rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {ETIQUETA_RIESGO[evento.riesgo]}
            </span>
          )}
          {evento.validacion && (
            <span
              className={`rounded border px-1 py-0.5 font-mono text-[9px] ${
                evento.validacion.errores > 0
                  ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]"
                  : "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}
            >
              {evento.validacion.errores} err · {evento.validacion.advertencias} adv
            </span>
          )}
        </div>

        {evento.error && (
          <p className="mt-1 text-[10px] leading-snug text-[var(--destructive)]">
            {evento.error}
          </p>
        )}
        {evento.hint && (
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted-foreground)]">
            {evento.hint}
          </p>
        )}

        {evento.args && (
          <Detalle etiqueta="Argumentos">
            <Bloque>{evento.args}</Bloque>
          </Detalle>
        )}
        {evento.resultado && (
          <Detalle etiqueta="Resultado">
            <Bloque>{evento.resultado}</Bloque>
          </Detalle>
        )}
      </div>
    );
  }

  if (evento.kind === "modelo") {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--muted)]/60 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <IconoDe evento={evento} />
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">
            {evento.title ?? "El modelo respondió"}
          </span>
          {evento.durationMs !== undefined && (
            <span className="shrink-0 font-mono text-[9px] text-[var(--muted-foreground)]">
              {segundos(evento.durationMs)}
            </span>
          )}
        </div>
        {evento.texto && (
          <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--foreground)]">
            {evento.texto}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {evento.modelo && (
            <span className="max-w-full truncate rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 font-mono text-[9px] text-[var(--muted-foreground)]">
              {evento.modelo}
            </span>
          )}
          {evento.tokens && (
            <span className="rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 font-mono text-[9px] text-[var(--muted-foreground)]">
              {evento.tokens.entrada} in · {evento.tokens.salida} out
            </span>
          )}
          {evento.finishReason === "length" && (
            <span className="rounded border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-1 py-0.5 font-mono text-[9px] text-[var(--destructive)]">
              cortada
            </span>
          )}
        </div>
      </div>
    );
  }

  const esSistema = evento.kind === "sistema";
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        esSistema
          ? "border-[var(--accent-foreground)]/25 bg-[var(--accent)]/30"
          : "border-[var(--border)] bg-[var(--background)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <IconoDe evento={evento} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">
          {evento.title ?? "Paso"}
        </span>
      </div>
      {evento.texto && (
        <p className="mt-0.5 whitespace-pre-wrap text-[10px] leading-snug text-[var(--muted-foreground)]">
          {evento.texto}
        </p>
      )}
    </div>
  );
}

export function ActividadTurno({
  eventos,
  pensando = false,
  onCerrar,
}: {
  eventos: TurnEvent[];
  pensando?: boolean;
  onCerrar: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pegadoRef = useRef(true);

  const resumen = useMemo(() => {
    if (eventos.length === 0) return null;
    const rondas = eventos.reduce(
      (maximo, evento) => Math.max(maximo, evento.round + 1),
      0
    );
    const primero = eventos[0]?.at ?? 0;
    const ultimo = eventos[eventos.length - 1]?.at ?? primero;
    const tokens = eventos.reduce(
      (total, evento) => total + (evento.tokens?.salida ?? 0),
      0
    );
    return { rondas, duracion: ultimo - primero, tokens };
  }, [eventos]);

  useEffect(() => {
    const contenedor = scrollRef.current;
    if (!contenedor || !pegadoRef.current) return;
    contenedor.scrollTop = contenedor.scrollHeight;
  }, [eventos.length, pensando]);

  let rondaAnterior = -1;
  const filas: ReactNode[] = [];

  for (const evento of eventos) {
    if (evento.round >= 0 && evento.round !== rondaAnterior) {
      rondaAnterior = evento.round;
      filas.push(
        <div
          className="flex items-center gap-1.5 pt-1"
          key={`ronda-${evento.round}-${evento.id}`}
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Ronda {evento.round + 1}
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
      );
    }
    filas.push(
      <div key={evento.id}>
        <Paso evento={evento} />
      </div>
    );
  }

  return (
    <section
      aria-label="Actividad del modelo"
      className="absolute inset-0 z-10 flex min-h-0 w-full flex-col border-l border-[var(--border)] bg-[var(--card)] sm:static sm:z-auto sm:w-[250px] sm:shrink-0"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
          <span className="text-[11px] font-semibold">Actividad</span>
          {pensando && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--primary)]" />
          )}
        </div>
        <button
          aria-label="Cerrar actividad"
          className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={onCerrar}
          title="Cerrar actividad"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {resumen && (
        <div className="shrink-0 border-b border-[var(--border)] px-2.5 py-1.5 font-mono text-[9px] text-[var(--muted-foreground)]">
          {resumen.rondas} {resumen.rondas === 1 ? "ronda" : "rondas"} ·{" "}
          {segundos(resumen.duracion)}
          {resumen.tokens > 0 ? ` · ${resumen.tokens} tok salida` : ""}
        </div>
      )}

      <div
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-2"
        onScroll={(event) => {
          const elemento = event.currentTarget;
          pegadoRef.current =
            elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight <
            24;
        }}
        ref={scrollRef}
      >
        {eventos.length === 0 ? (
          <p className="text-[10px] leading-relaxed text-[var(--muted-foreground)]">
            Todavía no hay actividad. Enviá un pedido y acá vas a ver cada paso:
            lo que dice el modelo, qué tool llama, con qué argumentos y qué
            devuelve.
          </p>
        ) : (
          filas
        )}
        {pensando && eventos.length > 0 && (
          <div className="flex items-center gap-1.5 py-1 text-[10px] text-[var(--muted-foreground)]">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
            Trabajando…
          </div>
        )}
      </div>
    </section>
  );
}
