import { MAX_CARACTERES_PRIVADO, MAX_ENTRADAS_PRIVADAS } from "@/lib/ia/config";

/**
 * Historial local del chat de ayuda.
 *
 * Igual que el chat del asistente: no hay persistencia en base de datos. Vive
 * en `localStorage` bajo una clave por usuario y se recorta por cantidad y
 * tamaño.
 */

export interface ProyectoAyuda {
  id: string;
  nombre: string;
  miRol?: string;
}

export interface InvitacionPendiente {
  tipo: "invitar";
  identificador: string;
  rol: "EDITOR" | "LECTOR";
}

export interface MensajeAyuda {
  id: string;
  role: "user" | "assistant";
  content: string;
  notice?: string;
  /** Ids de `HELP_ENTRIES` que se muestran como tarjetas al pie. */
  entries?: string[];
  /** Proyectos clicables cuando la acción necesita elegir uno. */
  proyectos?: ProyectoAyuda[];
  /** Acción que se completa al elegir un proyecto de la lista. */
  pendiente?: InvitacionPendiente;
}

const PREFIJO = "dizelf.ayuda.chat";

function hayNavegador(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function claveAyuda(usuarioId: number | null): string | null {
  return usuarioId === null ? null : `${PREFIJO}:${usuarioId}`;
}

function recortar(mensajes: MensajeAyuda[]): MensajeAyuda[] {
  let lista = mensajes;
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

function esMensaje(valor: unknown): valor is MensajeAyuda {
  if (typeof valor !== "object" || valor === null) return false;
  const crudo = valor as Record<string, unknown>;
  return (
    typeof crudo.id === "string" &&
    (crudo.role === "user" || crudo.role === "assistant") &&
    typeof crudo.content === "string"
  );
}

export function cargarAyuda(usuarioId: number | null): MensajeAyuda[] {
  const clave = claveAyuda(usuarioId);
  if (!clave || !hayNavegador()) return [];
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return [];
    const parsed: unknown = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(esMensaje)
      .map((mensaje) => ({
        ...mensaje,
        entries: Array.isArray(mensaje.entries)
          ? mensaje.entries.filter((id): id is string => typeof id === "string")
          : undefined,
        proyectos: Array.isArray(mensaje.proyectos)
          ? mensaje.proyectos.filter(
              (proyecto): proyecto is ProyectoAyuda =>
                typeof proyecto === "object" &&
                proyecto !== null &&
                typeof (proyecto as ProyectoAyuda).id === "string" &&
                typeof (proyecto as ProyectoAyuda).nombre === "string"
            )
          : undefined,
      }));
  } catch {
    return [];
  }
}

export function guardarAyuda(
  usuarioId: number | null,
  mensajes: MensajeAyuda[]
): void {
  const clave = claveAyuda(usuarioId);
  if (!clave || !hayNavegador()) return;
  try {
    window.localStorage.setItem(clave, JSON.stringify(recortar(mensajes)));
  } catch {
    // Cuota llena: el chat sigue funcionando en memoria.
  }
}

export function borrarAyuda(usuarioId: number | null): void {
  const clave = claveAyuda(usuarioId);
  if (!clave || !hayNavegador()) return;
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // La clave no existía o el navegador lo impidió.
  }
}
