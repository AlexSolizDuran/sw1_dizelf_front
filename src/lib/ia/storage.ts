import {
  MAX_CARACTERES_PRIVADO,
  MAX_ENTRADAS_PRIVADAS,
  modeloPorDefecto,
} from "./config";
import type {
  ContextoInfo,
  IAProvider,
  ModoIA,
  TurnEvent,
  TurnTrace,
} from "./types";

/**
 * Persistencia local del chat.
 *
 * No hay historial en la base de datos: la conversación vive solo en
 * `localStorage`, bajo una clave por usuario. Dos topes: cantidad de entradas y
 * tamaño en caracteres. Al excederlos se descartan las más antiguas.
 */

export interface EntradaChat {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: TurnTrace[];
  /** Pasos detallados del turno para la subventana de actividad. */
  actividad?: TurnEvent[];
  notice?: string;
  contexto?: ContextoInfo;
  /** El proveedor cortó la salida por presupuesto de tokens. */
  truncada?: boolean;
}

export interface PrefsIA {
  proveedor: IAProvider;
  modelo: string;
  modo: ModoIA;
}

const PREFIJO_CHAT = "dizelf.ia.chat";
const PREFIJO_PREFS = "dizelf.ia.prefs";

function hayNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function claveChat(usuarioId: number | null): string | null {
  return usuarioId === null ? null : `${PREFIJO_CHAT}:${usuarioId}`;
}

export function clavePrefs(usuarioId: number | null): string | null {
  return usuarioId === null ? null : `${PREFIJO_PREFS}:${usuarioId}`;
}

function recortar(entradas: EntradaChat[]): EntradaChat[] {
  let lista = entradas;
  if (lista.length > MAX_ENTRADAS_PRIVADAS) {
    lista = lista.slice(lista.length - MAX_ENTRADAS_PRIVADAS);
  }
  while (lista.length > 1) {
    try {
      if (JSON.stringify(lista).length <= MAX_CARACTERES_PRIVADO) break;
    } catch {
      break;
    }
    lista = lista.slice(1);
  }
  return lista;
}

export function cargarChat(usuarioId: number | null): EntradaChat[] {
  const clave = claveChat(usuarioId);
  if (!clave || !hayNavegador()) return [];
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return [];
    const parsed: unknown = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is EntradaChat =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as EntradaChat).id === "string" &&
        ((item as EntradaChat).role === "user" ||
          (item as EntradaChat).role === "assistant") &&
        typeof (item as EntradaChat).content === "string"
    );
  } catch {
    return [];
  }
}

export function guardarChat(
  usuarioId: number | null,
  entradas: EntradaChat[]
): boolean {
  const clave = claveChat(usuarioId);
  if (!clave || !hayNavegador()) return false;
  try {
    window.localStorage.setItem(clave, JSON.stringify(recortar(entradas)));
    return true;
  } catch {
    return false;
  }
}

export function borrarChat(usuarioId: number | null): void {
  const clave = claveChat(usuarioId);
  if (!clave || !hayNavegador()) return;
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // nada que hacer: la clave no existía o el navegador lo impidió
  }
}

export function cargarPrefs(usuarioId: number | null): PrefsIA | null {
  const clave = clavePrefs(usuarioId);
  if (!clave || !hayNavegador()) return null;
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const parsed: unknown = JSON.parse(crudo);
    if (typeof parsed !== "object" || parsed === null) return null;
    const prefs = parsed as Partial<PrefsIA>;
    if (
      prefs.proveedor !== "hf-space" &&
      prefs.proveedor !== "openrouter" &&
      prefs.proveedor !== "huggingface"
    ) {
      return null;
    }
    return {
      proveedor: prefs.proveedor,
      modelo:
        typeof prefs.modelo === "string" && prefs.modelo.trim() !== ""
          ? prefs.modelo
          : modeloPorDefecto(prefs.proveedor),
      modo: prefs.modo === "build" ? "build" : "plan",
    };
  } catch {
    return null;
  }
}

export function guardarPrefs(
  usuarioId: number | null,
  prefs: PrefsIA
): void {
  const clave = clavePrefs(usuarioId);
  if (!clave || !hayNavegador()) return;
  try {
    window.localStorage.setItem(clave, JSON.stringify(prefs));
  } catch {
    // Cuota llena: las preferencias se pierden, el chat sigue funcionando.
  }
}
