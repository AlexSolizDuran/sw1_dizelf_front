"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Loader2, Send, Square, X } from "lucide-react";
import { insertarDictado } from "@/lib/ia/stt";
import { DictationButton } from "./dictation-button";

/**
 * Piezas compartidas por los dos chats flotantes (asistente de escena y ayuda).
 *
 * El diseño sale de la skill del proyecto: tokens DIZELF, radios chicos,
 * bordes finos en vez de sombras, sin gradientes y con estados de foco
 * visibles. Tener un solo juego de piezas evita que los dos paneles se
 * desalineen con el tiempo.
 */

export type TonoChat = "ok" | "error" | "neutro" | "consultando";

const PUNTO_TONO: Record<TonoChat, string> = {
  ok: "bg-[var(--primary)]",
  error: "bg-[var(--destructive)]",
  neutro: "bg-[var(--muted-foreground)]",
  consultando: "bg-[var(--accent-foreground)] animate-pulse",
};

export function ChatLauncher({
  etiqueta,
  icono: Icono,
  lado,
  onClick,
}: {
  etiqueta: string;
  icono: typeof Loader2;
  lado: "izquierda" | "derecha";
  onClick: () => void;
}) {
  const posicion = lado === "izquierda" ? "left-3" : "right-3";
  return (
    <button
      aria-label={etiqueta}
      className={`fixed bottom-3 ${posicion} z-[60] flex h-9 items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--card)] px-2.5 text-[12px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]`}
      onClick={onClick}
      style={{ zIndex: 60 }}
      title={etiqueta}
      type="button"
    >
      <Icono className="h-4 w-4" />
      <span>{etiqueta}</span>
    </button>
  );
}

export function ChatPanel({
  etiqueta,
  lado,
  className,
  ancho,
  children,
}: {
  etiqueta: string;
  lado: "izquierda" | "derecha";
  className?: string;
  /** Permite ensanchar el panel cuando se abre la columna de actividad. */
  ancho?: number;
  children: ReactNode;
}) {
  const posicion = lado === "izquierda" ? "left-3" : "right-3";
  return (
    <aside
      aria-label={etiqueta}
      className={`fixed bottom-3 ${posicion} z-[60] flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] transition-[width] duration-150 ${className ?? ""}`}
      style={{ zIndex: 60, ...(ancho ? { width: ancho } : {}) }}
    >
      {children}
    </aside>
  );
}

export function ChatHeader({
  titulo,
  icono: Icono,
  estado,
  tono,
  acciones,
  onCerrar,
  cerrarTitulo = "Cerrar",
}: {
  titulo: string;
  icono: typeof Loader2;
  estado?: string;
  tono?: TonoChat;
  acciones?: ReactNode;
  onCerrar: () => void;
  cerrarTitulo?: string;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--accent)]">
          <Icono className="h-3.5 w-3.5 text-[var(--primary)]" />
        </span>
        <span className="truncate text-[13px] font-semibold">{titulo}</span>
        {estado && tono && (
          <>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_TONO[tono]}`}
            />
            <span className="truncate text-[10px] text-[var(--muted-foreground)]">
              {estado}
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {acciones}
        <button
          aria-label={cerrarTitulo}
          className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          onClick={onCerrar}
          title={cerrarTitulo}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return partes.filter(Boolean).map((parte, indice) => {
    const claveParte = `${clave}-${indice}`;
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={claveParte}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`")) {
      return (
        <code
          className="rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 font-mono text-[11px]"
          key={claveParte}
        >
          {parte.slice(1, -1)}
        </code>
      );
    }
    if (parte.startsWith("*") && parte.endsWith("*")) {
      return <em key={claveParte}>{parte.slice(1, -1)}</em>;
    }
    return <span key={claveParte}>{parte}</span>;
  });
}

/**
 * Markdown mínimo, sin `dangerouslySetInnerHTML`: negritas, código, itálicas,
 * listas y bloques cercados. Todo lo demás se muestra como texto.
 */
export function MarkdownLigero({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  let numerada = false;
  let codigo: string[] | null = null;

  const cerrarLista = () => {
    if (lista.length === 0) return;
    const Elemento = numerada ? "ol" : "ul";
    bloques.push(
      <Elemento
        className={`my-1 space-y-0.5 pl-4 ${numerada ? "list-decimal" : "list-disc"}`}
        key={`lista-${bloques.length}`}
      >
        {lista.map((item, indice) => (
          <li key={`${item}-${indice}`}>{enLinea(item, `li-${indice}`)}</li>
        ))}
      </Elemento>
    );
    lista = [];
  };

  const cerrarCodigo = () => {
    if (codigo === null) return;
    bloques.push(
      <pre
        className="my-1 overflow-x-auto rounded border border-[var(--border)] bg-[var(--muted)] p-2 font-mono text-[11px] leading-snug"
        key={`codigo-${bloques.length}`}
      >
        <code>{codigo.join("\n")}</code>
      </pre>
    );
    codigo = null;
  };

  for (const linea of lineas) {
    const recortada = linea.trim();

    if (recortada.startsWith("```")) {
      if (codigo === null) {
        cerrarLista();
        codigo = [];
      } else {
        cerrarCodigo();
      }
      continue;
    }
    if (codigo !== null) {
      codigo.push(linea);
      continue;
    }
    if (recortada === "") {
      cerrarLista();
      continue;
    }

    const vineta = recortada.match(/^[-*]\s+(.*)$/);
    if (vineta) {
      if (numerada) cerrarLista();
      numerada = false;
      lista.push(vineta[1]);
      continue;
    }
    const numero = recortada.match(/^\d+[.)]\s+(.*)$/);
    if (numero) {
      if (!numerada) cerrarLista();
      numerada = true;
      lista.push(numero[1]);
      continue;
    }

    cerrarLista();
    bloques.push(
      <p className="my-0.5" key={`p-${bloques.length}`}>
        {enLinea(recortada, `p-${bloques.length}`)}
      </p>
    );
  }

  cerrarLista();
  cerrarCodigo();

  return <div className="space-y-0.5 [overflow-wrap:anywhere]">{bloques}</div>;
}

export function ChatBubble({
  role,
  texto,
  error = false,
  pie,
}: {
  role: "user" | "assistant";
  texto: string;
  error?: boolean;
  pie?: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded bg-[var(--primary)] px-3 py-2 text-[12px] leading-relaxed text-[var(--primary-foreground)]">
          {texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className={`max-w-[92%] rounded border px-3 py-2 text-[12px] leading-relaxed ${
          error
            ? "border-[var(--destructive)]/50 bg-[var(--destructive)]/5 text-[var(--destructive)]"
            : "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"
        }`}
      >
        <MarkdownLigero texto={texto} />
      </div>
      {pie}
    </div>
  );
}

export function ChatTyping({ texto = "Pensando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
      <span className="text-[11px] text-[var(--muted-foreground)]">{texto}</span>
    </div>
  );
}

export function ChatNotice({
  children,
  tono = "neutro",
}: {
  children: ReactNode;
  tono?: "neutro" | "error";
}) {
  return (
    <p
      className={`text-[10px] leading-snug ${
        tono === "error" ? "text-[var(--destructive)]" : "text-[var(--accent-foreground)]"
      }`}
      role={tono === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function ChatComposer({
  valor,
  onChange,
  onEnviar,
  onDetener,
  pensando,
  placeholder,
  disabled = false,
  encabezado,
}: {
  valor: string;
  onChange: (valor: string) => void;
  onEnviar: () => void;
  onDetener?: () => void;
  pensando: boolean;
  placeholder: string;
  disabled?: boolean;
  encabezado?: ReactNode;
}) {
  const areaRef: RefObject<HTMLTextAreaElement | null> =
    useRef<HTMLTextAreaElement>(null);
  const puedeEnviar = !pensando && !disabled && valor.trim() !== "";

  const aplicarDictado = (dictado: string) => {
    const area = areaRef.current;
    const cursor = area?.selectionStart ?? valor.length;
    const resultado = insertarDictado(valor, dictado, cursor);
    onChange(resultado.texto);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(resultado.cursor, resultado.cursor);
    });
  };

  return (
    <div className="shrink-0 border-t border-[var(--border)] px-3 py-2">
      {encabezado}
      <div className="flex items-end gap-2">
        <textarea
          className="max-h-32 min-h-[36px] flex-1 resize-y rounded border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] disabled:opacity-50"
          disabled={pensando || disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (puedeEnviar) onEnviar();
            }
          }}
          placeholder={placeholder}
          ref={areaRef}
          rows={1}
          value={valor}
        />
        <DictationButton
          disabled={pensando || disabled}
          onTexto={aplicarDictado}
          title="Dictar mensaje"
        />
        {pensando && onDetener ? (
          <button
            aria-label="Detener"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[var(--destructive)] text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            onClick={onDetener}
            title="Detener"
            type="button"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--primary)] text-[var(--primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-40"
            disabled={!puedeEnviar}
            onClick={onEnviar}
            title="Enviar"
            type="button"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
