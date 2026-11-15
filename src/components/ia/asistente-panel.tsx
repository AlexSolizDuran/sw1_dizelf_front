"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useIAChat } from "@/hooks/use-ia-chat";
import { formatearConformidad } from "@/lib/ia/conformidad";
import { IA_PROVIDER_LABEL, IA_PROVIDERS } from "@/lib/ia/config";
import type { EntradaChat } from "@/lib/ia/storage";
import type { IAProvider, TurnEvent, TurnTrace } from "@/lib/ia/types";
import {
  ChatBubble,
  ChatComposer,
  ChatHeader,
  ChatLauncher,
  ChatNotice,
  ChatPanel,
  ChatTyping,
  type TonoChat,
} from "./chat-kit";
import { ProposalPanel } from "./proposal-panel";
import { ActividadTurno } from "./actividad-turno";

interface Props {
  usuarioId: number | null;
  proyectoId: string;
  puedeEditar: boolean;
}

function formatearTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function TraceChips({ trace }: { trace: TurnTrace[] }) {
  if (trace.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {trace.map((turn, indice) => {
        const etiqueta = turn.duplicate
          ? "repetida"
          : turn.proposed
            ? "propone"
            : turn.ok
              ? "ok"
              : "error";
        // El motivo va en el chip y no solo en el tooltip: con el hover nadie
        // se entera de por qué falló. El `hint` dice qué campo fue; se muestra
        // el primero (hasta el separador) porque el resto no entra.
        const motivo = turn.hint?.split("|")[0]?.trim();
        const tono = turn.duplicate
          ? "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
          : turn.ok
            ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
            : "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]";
        return (
          <span
            className={`inline-block max-w-[26rem] overflow-hidden text-ellipsis whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] ${tono}`}
            key={`${turn.round}-${turn.toolName}-${indice}`}
            title={[turn.error, turn.hint, turn.argsRaw && `args: ${turn.argsRaw}`]
              .filter(Boolean)
              .join(" · ")}
          >
            {etiqueta} · {turn.toolName}
            {!turn.ok && turn.error ? `: ${turn.error}` : ""}
            {!turn.ok && motivo ? ` → ${motivo}` : ""}
          </span>
        );
      })}
    </div>
  );
}

function Message({
  entrada,
  onVerActividad,
}: {
  entrada: EntradaChat;
  onVerActividad?: () => void;
}) {
  const esError = entrada.notice === "error";
  // `contexto.turnos` cuenta mensajes previos del historial, no trabajo hecho:
  // en el primer mensaje siempre daba 0 y parecía que el asistente no hizo nada.
  const rondas = (entrada.trace ?? []).reduce(
    (maximo, turn) => Math.max(maximo, turn.round + 1),
    0
  );
  return (
    <ChatBubble
      error={esError}
      pie={
        <>
          {entrada.notice && entrada.notice !== "error" && (
            <ChatNotice>{entrada.notice}</ChatNotice>
          )}
          {entrada.contexto && (
            <span
              className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]"
              title={`Presupuesto ${formatearTokens(entrada.contexto.presupuestoEntrada)} de ${formatearTokens(entrada.contexto.ventana)} tokens`}
            >
              {formatearTokens(entrada.contexto.tokensEstimados)} tokens ·{" "}
              {rondas} {rondas === 1 ? "ronda" : "rondas"}
            </span>
          )}
          {entrada.truncada && (
            <span
              className="rounded border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--destructive)]"
              title="El proveedor agotó el presupuesto de salida: la respuesta puede haber quedado cortada a mitad de una llamada."
            >
              respuesta cortada
            </span>
          )}
          <TraceChips trace={entrada.trace ?? []} />
          {onVerActividad && (entrada.actividad?.length ?? 0) > 0 && (
            <button
              className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
              onClick={onVerActividad}
              title="Ver los pasos de este turno"
              type="button"
            >
              <Activity className="h-3 w-3" />
              Ver actividad
            </button>
          )}
        </>
      }
      role={entrada.role}
      texto={entrada.content}
    />
  );
}

const SUGERENCIAS = [
  "¿Qué hay en el nivel activo?",
  "Revisá la coherencia del plano.",
  "Crea un baño de 2×1,5 m junto al dormitorio.",
];

const BADGE_TONO: Record<string, string> = {
  verde: "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]",
  amarillo:
    "border-[var(--accent-foreground)]/30 bg-[var(--accent)] text-[var(--accent-foreground)]",
  rojo: "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]",
  gris: "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]",
};

export function AssistantPanel({ usuarioId, proyectoId, puedeEditar }: Props) {
  const {
    proveedor,
    modelo,
    modelos,
    modo,
    salud,
    checking,
    mensajes,
    pensando,
    error,
    avisoFallback,
    propuestas,
    resolviendo,
    trace,
    actividad,
    conformidad,
    probandoConformidad,
    setContexto,
    setProveedor,
    setModelo,
    setModo,
    cargarModelos,
    verificarSalud,
    probarConformidad,
    enviar,
    aprobarPropuestas,
    rechazarPropuestas,
    detener,
    reiniciar,
  } = useIAChat();

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [mostrarActividad, setMostrarActividad] = useState(false);
  // Turno pasado elegido desde "Ver actividad"; si es null se sigue el vivo.
  const [actividadElegida, setActividadElegida] = useState<TurnEvent[] | null>(
    null
  );

  useEffect(() => {
    setContexto({ usuarioId, proyectoId, puedeEditar });
  }, [usuarioId, proyectoId, puedeEditar, setContexto]);

  useEffect(() => {
    void verificarSalud();
    void cargarModelos();
    // Solo al montar: los cambios de proveedor disparan sus propias cargas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = useMemo(() => formatearConformidad(conformidad), [conformidad]);
  const usarLista = modelos.length > 0;

  const enviarActual = () => {
    if (pensando || texto.trim() === "") return;
    const contenido = texto;
    setTexto("");
    setActividadElegida(null);
    void enviar(contenido);
  };

  const eventosActividad = actividadElegida ?? actividad;

  const tonoEstado: TonoChat = checking
    ? "consultando"
    : salud === null
      ? "neutro"
      : salud.ok
        ? "ok"
        : "error";
  const estadoSalud = checking
    ? "Verificando…"
    : salud === null
      ? "Sin verificar"
      : salud.ok
        ? "Conectado"
        : "Sin conexión";

  if (!abierto) {
    return (
      <ChatLauncher
        etiqueta="Asistente"
        icono={Bot}
        lado="derecha"
        onClick={() => setAbierto(true)}
      />
    );
  }

  return (
    <ChatPanel
      ancho={mostrarActividad ? 660 : 380}
      className="top-[56px]"
      etiqueta="Asistente de IA"
      lado="derecha"
    >
      <ChatHeader
        acciones={
          <>
            <button
              aria-label="Ver actividad del modelo"
              aria-pressed={mostrarActividad}
              className={`rounded p-1 transition-colors hover:bg-[var(--muted)] ${
                mostrarActividad
                  ? "bg-[var(--accent)] text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => {
                setMostrarActividad((valor) => !valor);
                setActividadElegida(null);
              }}
              title={mostrarActividad ? "Ocultar actividad" : "Ver actividad del modelo"}
              type="button"
            >
              <Activity className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Recomprobar conexión"
              className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              disabled={checking}
              onClick={() => void verificarSalud()}
              title="Recomprobar conexión"
              type="button"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            </button>
            <button
              aria-label="Borrar historial local"
              className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => {
                if (window.confirm("¿Borrar el historial local de este chat?")) reiniciar();
              }}
              title="Borrar historial local"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        }
        cerrarTitulo="Colapsar asistente"
        estado={estadoSalud}
        icono={Bot}
        onCerrar={() => setAbierto(false)}
        titulo="Asistente"
        tono={tonoEstado}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-[var(--border)] px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Proveedor
            </span>
            <select
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-[11px] text-[var(--foreground)] disabled:opacity-50"
              disabled={pensando}
              onChange={(event) => setProveedor(event.target.value as IAProvider)}
              value={proveedor}
            >
              {IA_PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {IA_PROVIDER_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Modelo
            </span>
            {usarLista ? (
              <select
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-[11px] text-[var(--foreground)] disabled:opacity-50"
                disabled={pensando}
                onChange={(event) => setModelo(event.target.value)}
                value={modelo}
              >
                {!modelos.includes(modelo) && modelo !== "" && (
                  <option value={modelo}>{modelo}</option>
                )}
                {modelos.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 font-mono text-[11px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] disabled:opacity-50"
                disabled={pensando}
                onChange={(event) => setModelo(event.target.value)}
                placeholder="org/modelo"
                value={modelo}
              />
            )}
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Modo
            </span>
            {puedeEditar ? (
              <div className="flex overflow-hidden rounded border border-[var(--border)]">
                <button
                  className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    modo === "plan"
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--background)]"
                  }`}
                  disabled={pensando}
                  onClick={() => setModo("plan")}
                  type="button"
                >
                  Plan
                </button>
                <button
                  className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    modo === "build"
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--background)]"
                  }`}
                  disabled={pensando}
                  onClick={() => setModo("build")}
                  type="button"
                >
                  Build
                </button>
              </div>
            ) : (
              <span className="rounded border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Solo consulta
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${BADGE_TONO[badge.estado ?? "gris"] ?? BADGE_TONO.gris}`}
              title={badge.detalle}
            >
              {badge.etiqueta}
            </span>
            <button
              className="flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-1 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
              disabled={probandoConformidad || pensando || modelo.trim() === ""}
              onClick={() => void probarConformidad(true)}
              title="Envía una petición fija con las herramientas reales para comprobar si el modelo puede editar"
              type="button"
            >
              {probandoConformidad ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {probandoConformidad ? "Probando…" : "Probar"}
            </button>
          </div>
        </div>

        {puedeEditar && modo === "plan" && (
          <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted-foreground)]">
            Modo Plan: solo lee. Para que cree o modifique el plano, pasá a
            Build.
          </p>
        )}

        {avisoFallback && <ChatNotice>{avisoFallback}</ChatNotice>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
              Consultá el plano o pedí cambios. En modo Build las escrituras
              quedan como propuestas hasta que las apruebes. El historial vive
              solo en este navegador.
            </p>
            <div className="flex flex-col gap-1">
              {SUGERENCIAS.map((sugerencia) => (
                <button
                  className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-left text-[11px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
                  key={sugerencia}
                  onClick={() => setTexto(sugerencia)}
                  type="button"
                >
                  {sugerencia}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((entrada) => (
          <Message
            entrada={entrada}
            key={entrada.id}
            onVerActividad={
              (entrada.actividad?.length ?? 0) > 0
                ? () => {
                    setActividadElegida(entrada.actividad ?? []);
                    setMostrarActividad(true);
                  }
                : undefined
            }
          />
        ))}

        {pensando && <ChatTyping texto="Consultando…" />}

        {error && <ChatNotice tono="error">{error}</ChatNotice>}
      </div>

      <ProposalPanel
        onAprobar={() => void aprobarPropuestas()}
        onRechazar={rechazarPropuestas}
        puedeEditar={puedeEditar}
        propuestas={propuestas}
        resolviendo={resolviendo}
      />

      <ChatComposer
        encabezado={pensando && trace.length > 0 ? <TraceChips trace={trace} /> : null}
        onChange={setTexto}
        onDetener={detener}
        onEnviar={enviarActual}
        pensando={pensando}
        placeholder="Preguntá sobre el plano…"
        valor={texto}
      />
        </div>

        {mostrarActividad && (
          <ActividadTurno
            eventos={eventosActividad}
            onCerrar={() => {
              setMostrarActividad(false);
              setActividadElegida(null);
            }}
            pensando={pensando && actividadElegida === null}
          />
        )}
      </div>
    </ChatPanel>
  );
}
