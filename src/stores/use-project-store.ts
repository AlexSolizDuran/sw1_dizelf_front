"use client";

import { create } from "zustand";
import { apiGuardarProyecto, apiObtenerProyecto } from "@/lib/projects";
import {
  leerDocumento,
  type DocumentoProyecto,
  type Proyecto,
} from "@/types/proyecto";

interface ProjectState {
  proyecto: Proyecto | null;
  documento: DocumentoProyecto | null;
  cargando: boolean;
  guardando: boolean;
  error: string | null;

  cargar: (id: string) => Promise<DocumentoProyecto | null>;
  guardar: (
    documento: DocumentoProyecto,
    opciones?: { keepalive?: boolean }
  ) => Promise<void>;
  limpiar: () => void;
}

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
  cargando: false,
  guardando: false,
  error: null,

  cargar: async (id) => {
    set({ cargando: true, error: null });
    try {
      const proyecto = await apiObtenerProyecto(id);
      const documento = leerDocumento(proyecto.esquemaJson);
      set({ proyecto, documento, cargando: false });
      return documento;
    } catch (e) {
      const mensaje =
        e instanceof Error ? e.message : "No se pudo cargar el proyecto";
      set({ error: mensaje, cargando: false, proyecto: null, documento: null });
      return null;
    }
  },

  guardar: async (documento, opciones) => {
    // Un guardado que llega mientras el anterior sigue en vuelo se solapa con
    // otro. El editor ya serializa con su propio debounce de 1s, así que sólo
    // hace falta no apilar escrituras si el usuario edita justo al salir.
    if (get().guardando && !opciones?.keepalive) return;
    set({ guardando: true });
    try {
      const { proyecto } = get();
      if (!proyecto) throw new Error("No hay un proyecto abierto");

      const actualizado = await apiGuardarProyecto(
        proyecto.id,
        { esquemaJson: documento as unknown as Record<string, unknown> },
        opciones
      );

      set({
        guardando: false,
        proyecto: {
          ...actualizado,
          // Se conserva la referencia previa: ver nota del store.
          esquemaJson: proyecto.esquemaJson,
        },
      });
    } catch (e) {
      set({
        guardando: false,
        error: e instanceof Error ? e.message : "No se pudo guardar",
      });
    }
  },

  limpiar: () =>
    set({ proyecto: null, documento: null, error: null, guardando: false }),
}));
