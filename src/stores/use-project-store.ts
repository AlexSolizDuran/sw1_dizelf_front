"use client";

import { create } from "zustand";
import {
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

  /**
   * Guardado manual: consolida y crea la fila en `version`.
   *
   * Recibe el documento que el usuario está viendo. El documento vivo lo
   * persiste el gateway de sync; acá no se manda al autosave HTTP.
   */
  guardarVersion: (
    documento: DocumentoProyecto,
    nombre?: string
  ) => Promise<boolean>;
  cargarVersiones: () => Promise<void>;

  /**
   * Aplica en vivo un cambio de permiso del servidor.
   *
   * Actualiza solo los dos campos que cambian con el rol. Evita recargar el
   * proyecto entero: el documento vivo lo sigue gobernando el gateway.
   */
  actualizarPermiso: (rol: string, puedeEditar: boolean) => void;

  limpiar: () => void;
}

/**
 * Sube cada vez que se empieza a cargar o se limpia el store. Una respuesta de
 * `cargar` solo puede escribir si su generación sigue siendo la actual.
 */
let generacion = 0;

/**
 * Estado del proyecto abierto en el editor.
 *
 * El store NO guarda la escena enmutable: esa la posee el store interno de
 * `@pascal-app/core` y cambia en cada edición. Acá vive solo el documento que
 * se cargó, más los metadatos.
 *
 * El documento vivo lo persiste el gateway de sync por WebSocket; este store ya
 * no hace PATCH del documento. El único guardado HTTP que queda es el manual,
 * que manda la escena actual para consolidar una versión.
 */
export const useProjectStore = create<ProjectState>((set, get) => ({
  proyecto: null,
  documento: null,
  versiones: [],
  cargando: false,
  guardando: false,
  error: null,

  cargar: async (id) => {
    const miGeneracion = ++generacion;

    set({ cargando: true, error: null });
    try {
      const proyecto = await apiObtenerProyecto(id);

      // Si mientras esperaba se cargó otro proyecto (o se limpió), esta
      // respuesta ya no vale: no pisar el store.
      if (miGeneracion !== generacion) return null;

      const documento = leerDocumento(proyecto.esquemaJson);
      // `origen` viene del backend: dice de qué tabla salió `esquemaJson`. No
      // lo consulta el front porque no hay dos endpoints, sino una decisión que
      // el servidor toma mejor que el cliente.
      set({ proyecto, documento, versiones: [], cargando: false });
      return documento;
    } catch (e) {
      if (miGeneracion !== generacion) return null;

      const mensaje =
        e instanceof Error ? e.message : "No se pudo cargar el proyecto";
      set({ error: mensaje, cargando: false, proyecto: null, documento: null });
      return null;
    }
  },

  /**
   * Guardado manual: consolida.
   *
   * Es el único camino que crea una fila en `version` y actualiza
   * `proyecto.esquema_json`. Se manda la escena que el usuario está viendo para
   * que la versión no dependa de lo último que alcanzó a persistir el gateway.
   */
  guardarVersion: async (documento, nombre) => {
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
      await apiGuardarVersion(proyecto.id, documento, nombre);
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

  actualizarPermiso: (rol, puedeEditar) => {
    const proyecto = get().proyecto;
    if (!proyecto) return;

    // Si no cambió nada, no se escribe: esto llega por socket y puede repetirse
    // (dos pestañas del mismo usuario, reconexiones).
    if (proyecto.miRol === rol && proyecto.puedeEditar === puedeEditar) return;

    set({ proyecto: { ...proyecto, miRol: rol, puedeEditar } });
  },

  limpiar: () => {
    generacion += 1; // invalida respuestas de carga en vuelo

    set({
      proyecto: null,
      documento: null,
      versiones: [],
      cargando: false,
      error: null,
      guardando: false,
    });
  },
}));
