"use client";

import { create } from "zustand";
import {
  apiGuardarProyecto,
  apiGuardarVersion,
  apiObtenerProyecto,
  apiListarVersiones,
} from "@/lib/projects";
import {
  leerDocumento,
  type DocumentoProyecto,
  type Proyecto,
  type Version,
} from "@/types/proyecto";

interface ProjectState {
  proyecto: Proyecto | null;
  documento: DocumentoProyecto | null;
  cargando: boolean;
  guardando: boolean;
  error: string | null;

  /** Historial de guardados manuales del proyecto abierto. */
  versiones: Version[];

  cargar: (id: string) => Promise<DocumentoProyecto | null>;
  guardar: (
    documento: DocumentoProyecto,
    opciones?: { keepalive?: boolean }
  ) => Promise<void>;

  /** Guardado manual: consolida y crea la fila en `version`. */
  guardarVersion: (nombre?: string) => Promise<boolean>;
  cargarVersiones: () => Promise<void>;

  limpiar: () => void;
}

/**
 * Guardado en vuelo. Vive fuera del estado de zustand a propósito: es un
 * detalle de la máquina de guardado, no algo que la UI tenga que observar ni
 * que dispare renders.
 */
let pendiente: {
  documento: DocumentoProyecto;
  keepalive: boolean;
} | null = null;

let guardandoAhora = false;

/**
 * Estado del proyecto abierto en el editor.
 *
 * El store NO guarda la escena enmutable: esa la posee el store interno de
 * `@pascal-app/core` y cambia en cada edición. Acá vive solo el documento que
 * se cargó y se va a guardar, más los metadatos.
 *
 * Tras guardar no se reemplaza `esquemaJson` por el que devuelve el backend:
 * el PATCH eco devuelve el documento entero y guardarlo dispararía un render
 * por cada guardado. Los metadatos sí se refrescan.
 */
export const useProjectStore = create<ProjectState>((set, get) => ({
  proyecto: null,
  documento: null,
  versiones: [],
  cargando: false,
  guardando: false,
  error: null,

  cargar: async (id) => {
    set({ cargando: true, error: null });
    try {
      const proyecto = await apiObtenerProyecto(id);
      const documento = leerDocumento(proyecto.esquemaJson);
      // `origen` viene del backend: dice de qué tabla salió `esquemaJson`. No
      // lo consulta el front porque no hay dos endpoints, sino una decisión que
      // el servidor toma mejor que el cliente.
      set({ proyecto, documento, versiones: [], cargando: false });
      return documento;
    } catch (e) {
      const mensaje =
        e instanceof Error ? e.message : "No se pudo cargar el proyecto";
      set({ error: mensaje, cargando: false, proyecto: null, documento: null });
      return null;
    }
  },

  /**
   * Encola en vez de descartar.
   *
   * Antes: si había un PATCH en vuelo, el siguiente se tiraba y el documento
   * se perdía sin error visible — el autosave del paquete dispara cada segundo,
   * así que bastaba con que el anterior tardara más de eso para que la última
   * edición no llegara nunca al backend.
   *
   * Ahora solo se conserva **el último** documento encolado: los intermedios
   * están obsoletos para cuando vuelve el PATCH, y mandarlos todos sería
   * writes inútiles contra una columna que se sobreescribe entera.
   */
  guardar: async (documento, opciones) => {
    if (guardandoAhora) {
      pendiente = { documento, keepalive: opciones?.keepalive ?? false };
      return;
    }

    guardandoAhora = true;
    set({ guardando: true });

    try {
      while (true) {
        const { proyecto } = get();
        if (!proyecto) throw new Error("No hay un proyecto abierto");

        const enviado = pendiente?.documento ?? documento;
        const keepalive = pendiente?.keepalive ?? opciones?.keepalive;
        pendiente = null;

        const actualizado = await apiGuardarProyecto(
          proyecto.id,
          { esquemaJson: enviado as unknown as Record<string, unknown> },
          { keepalive }
        );

        set({
          proyecto: {
            ...actualizado,
            // Se conserva la referencia previa: ver nota del store.
            esquemaJson: proyecto.esquemaJson,
          },
        });

        // Salir de inmediato si no se encoló nada durante este write.
        if (!pendiente) break;
      }

      set({ guardando: false, error: null });
    } catch (e) {
      set({
        guardando: false,
        error: e instanceof Error ? e.message : "No se pudo guardar",
      });
    } finally {
      guardandoAhora = false;
    }

    // Un keepalive encolado mientras corría el write normal ya no se manda con
    // la página cerrándose, así que se descarta explícitamente: reenviarlo
    // igual sería una petición que el navegador cancela igual.
    pendiente = null;
  },

  /**
   * Guardado manual: consolida.
   *
   * Es el único camino que crea una fila en `version` y actualiza
   * `proyecto.esquema_json`. El autosave de arriba escribe en el documento
   * vivo, así que lo editado desde el último guardado manual solo vive ahí.
   *
   * Se espera a que termine cualquier write en vuelo: consolidar mientras hay
   * un PATCH a medias dejaría el proyecto con una versión anterior a la última
   * edición, que es justo lo que el usuario cree haber guardado.
   */
  guardarVersion: async (nombre) => {
    const proyecto = get().proyecto;
    if (!proyecto) {
      set({ error: "No hay un proyecto abierto" });
      return false;
    }
    if (!proyecto.puedeEditar) {
      set({ error: "Tu permiso en este proyecto es de solo lectura." });
      return false;
    }

    set({ guardando: true });
    try {
      while (guardandoAhora) {
        await new Promise((r) => setTimeout(r, 120));
      }
      await apiGuardarVersion(proyecto.id, nombre);
      await get().cargarVersiones();
      set({ guardando: false, error: null });
      return true;
    } catch (e) {
      set({
        guardando: false,
        error: e instanceof Error ? e.message : "No se pudo guardar la versión",
      });
      return false;
    }
  },

  cargarVersiones: async () => {
    const proyecto = get().proyecto;
    if (!proyecto) return;
    try {
      set({ versiones: await apiListarVersiones(proyecto.id) });
    } catch {
      // El historial es informativo: si no se puede listar, el editor sigue.
    }
  },

  limpiar: () => {
    pendiente = null;
    set({
      proyecto: null,
      documento: null,
      versiones: [],
      error: null,
      guardando: false,
    });
  },
}));
