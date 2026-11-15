"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, RefreshCw, Trash2 } from "lucide-react";
import { useAyudaChat } from "@/hooks/use-ayuda-chat";
import { HELP_ENTRIES, entryPorId, searchHelp } from "@/lib/ayuda/knowledge";
import type { MensajeAyuda } from "@/lib/ayuda/storage";
import {
  ChatBubble,
  ChatComposer,
  ChatHeader,
  ChatLauncher,
  ChatNotice,
  ChatPanel,
  ChatTyping,
  type TonoChat,
} from "@/components/ia/chat-kit";

interface Props {
  usuarioId: number | null;
}

function Sugerencias({
  entradas,
  onElegir,
}: {
  entradas: typeof HELP_ENTRIES;
  onElegir: (id: string) => void;
}) {
  if (entradas.length === 0) {
    return (
      <p className="text-[11px] text-[var(--muted-foreground)]">
        No encontré ese tema. Prueba con «proyecto», «nivel», «mueble» o «material».
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {entradas.map((entrada) => (
        <button
          className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-left transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          key={entrada.id}
          onClick={() => onElegir(entrada.id)}
          type="button"
        >
          <span className="block text-[11px] font-semibold text-[var(--foreground)]">
            {entrada.titulo}
          </span>
          <span className="block text-[10px] text-[var(--muted-foreground)]">
            {entrada.pregunta}
          </span>
        </button>
      ))}
    </div>
  );
}

function Mensaje({
  mensaje,
  onElegirProyecto,
  onVerTema,
}: {
  mensaje: MensajeAyuda;
  onElegirProyecto: (mensajeId: string, proyectoId: string) => void;
  onVerTema: (entryId: string) => void;
}) {
  const entradas = (mensaje.entries ?? [])
    .map((id) => entryPorId(id))
    .filter((entrada): entrada is NonNullable<typeof entrada> => entrada !== null);

  return (
    <ChatBubble
      error={mensaje.notice === "error"}
      pie={
        <>
          {mensaje.notice && mensaje.notice !== "error" && (
            <ChatNotice>{mensaje.notice}</ChatNotice>
          )}

          {mensaje.proyectos && mensaje.proyectos.length > 0 && (
            <div className="flex w-full flex-col gap-1">
              {mensaje.proyectos.map((proyecto) => (
                <button
                  className="flex items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-left text-[11px] text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--accent)]"
                  key={proyecto.id}
                  onClick={() => onElegirProyecto(mensaje.id, proyecto.id)}
                  type="button"
                >
                  <span className="truncate font-medium">{proyecto.nombre}</span>
                  {proyecto.miRol && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                      {proyecto.miRol}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {entradas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entradas.map((entrada) => (
                <button
                  className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]"
                  key={entrada.id}
                  onClick={() => onVerTema(entrada.id)}
                  title={entrada.pregunta}
                  type="button"
                >
                  {entrada.titulo}
                </button>
              ))}
            </div>
          )}
        </>
      }
      role={mensaje.role}
      texto={mensaje.content}
    />
  );
}

/**
 * Chat de ayuda de DIZELF.
 *
 * Solo explica la aplicación y gestiona lo que está fuera del plano: crear o
 * abrir proyectos, ir a Mis Proyectos e invitar colaboradores. No lee ni
 * modifica la escena.
 */
export function HelpAssistant({ usuarioId }: Props) {
  const router = useRouter();
  const {
    mensajes,
    pensando,
    error,
    online,
    checking,
    destino,
    setContexto,
    verificarOnline,
    enviar,
    mostrarTema,
    elegirProyecto,
    limpiarDestino,
    reiniciar,
  } = useAyudaChat();

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContexto(usuarioId);
  }, [usuarioId, setContexto]);

  useEffect(() => {
    if (!destino) return;
    router.push(destino);
    limpiarDestino();
  }, [destino, router, limpiarDestino]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, pensando]);

  const filtradas = useMemo(
    () => (consulta.trim() !== "" ? searchHelp(consulta, 6) : HELP_ENTRIES.filter((entrada) => entrada.atajos).slice(0, 7)),
    [consulta]
  );

  const enviarActual = () => {
    if (pensando || texto.trim() === "") return;
    const contenido = texto;
    setTexto("");
    void enviar(contenido);
  };

  const abrirTema = (id: string) => {
    setConsulta("");
    mostrarTema(id);
  };

  const estadoOnline: { texto: string; tono: TonoChat } = checking
    ? { texto: "Comprobando…", tono: "consultando" }
    : online === null
      ? { texto: "Sin verificar", tono: "neutro" }
      : online
        ? { texto: "Asistente IA conectado", tono: "ok" }
        : { texto: "Respuestas locales — sin internet", tono: "error" };

  if (!abierto) {
    return (
      <ChatLauncher
        etiqueta="Ayuda"
        icono={HelpCircle}
        lado="izquierda"
        onClick={() => setAbierto(true)}
      />
    );
  }

  return (
    <ChatPanel
      className="h-[560px] max-h-[calc(100vh-24px)]"
      etiqueta="Chat de ayuda"
      lado="izquierda"
    >
      <ChatHeader
        acciones={
          <>
            <button
              aria-label="Recomprobar conexión"
              className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              disabled={checking}
              onClick={() => void verificarOnline()}
              title="Recomprobar conexión"
              type="button"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            </button>
            <button
              aria-label="Borrar historial del chat de ayuda"
              className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => {
                if (window.confirm("¿Borrar el historial local de la ayuda?")) {
                  reiniciar();
                }
              }}
              title="Borrar historial local"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        }
        estado={estadoOnline.texto}
        icono={HelpCircle}
        onCerrar={() => setAbierto(false)}
        titulo="Ayuda"
        tono={estadoOnline.tono}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3" ref={scrollRef}>
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
              Te explico cómo usar DIZELF y puedo crear o abrir proyectos,
              llevarte a Mis Proyectos e invitar colaboradores. No modifico el
              plano: para eso está el Asistente del editor.
            </p>
            <input
              aria-label="Buscar un tema de ayuda"
              className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)]"
              onChange={(event) => setConsulta(event.target.value)}
              placeholder="Buscar un tema: niveles, muebles, versiones…"
              type="search"
              value={consulta}
            />
            <Sugerencias entradas={filtradas} onElegir={abrirTema} />
          </div>
        )}

        {mensajes.map((mensaje) => (
          <Mensaje
            key={mensaje.id}
            mensaje={mensaje}
            onElegirProyecto={(mensajeId, proyectoId) =>
              void elegirProyecto(mensajeId, proyectoId)
            }
            onVerTema={abrirTema}
          />
        ))}

        {pensando && <ChatTyping texto="Buscando la respuesta…" />}

        {error && <ChatNotice tono="error">{error}</ChatNotice>}
      </div>

      <ChatComposer
        onChange={setTexto}
        onEnviar={enviarActual}
        pensando={pensando}
        placeholder="Pregunta sobre DIZELF…"
        valor={texto}
      />
    </ChatPanel>
  );
}
