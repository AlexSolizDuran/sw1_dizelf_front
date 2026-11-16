"use client";

import { create } from "zustand";
import {
  apiActualizarProyecto,
  apiCrearProyecto,
  apiEliminarProyecto,
  apiListarProyectos,
} from "@/lib/projects";
import type { CrearProyectoInput, ProyectoLista } from "@/types/proyecto";

interface ProyectosState {
  proyectos: ProyectoLista[];
  total: number;
  pagina: number;
  limite: number;
  isLoading: boolean;
  error: string | null;
  cargar: (pagina?: number, limite?: number) => Promise<void>;
  crear: (data: CrearProyectoInput) => Promise<string>;
  renombrar: (id: string, nombre: string) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

/**
 * Estado del dashboard de proyectos.
 *
 * La fuente de verdad de la capa HTTP es `@/lib/projects` (proxy same-origin,
 * timeout y contrato actual del backend); este store solo guarda la página
 * visible y evita que la página maneje loading/error a mano.
 */
export const useProyectosStore = create<ProyectosState>((set, get) => ({
  proyectos: [],
  total: 0,
  pagina: 1,
  limite: 12,
  isLoading: false,
  error: null,

  cargar: async (pagina, limite) => {
    const p = pagina ?? get().pagina;
    const l = limite ?? get().limite;
    set({ isLoading: true, error: null });
    try {
      const res = await apiListarProyectos(p, l);
      set({
        proyectos: res.datos ?? [],
        total: res.total,
        pagina: res.pagina,
        limite: res.limite,
        isLoading: false,
      });
    } catch (e) {
      set({
        isLoading: false,
        error:
          e instanceof Error ? e.message : "No se pudieron cargar los proyectos.",
      });
    }
  },

  crear: async (data) => {
    const creado = await apiCrearProyecto(data);
    await get().cargar(1, get().limite);
    return creado.id;
  },

  renombrar: async (id, nombre) => {
    const actualizado = await apiActualizarProyecto(id, { nombre });
    set((s) => ({
      proyectos: s.proyectos.map((p) =>
        p.id === id ? { ...p, nombre: actualizado.nombre } : p
      ),
    }));
  },

  eliminar: async (id) => {
    await apiEliminarProyecto(id);
    set((s) => ({
      proyectos: s.proyectos.filter((p) => p.id !== id),
      total: Math.max(0, s.total - 1),
    }));
  },
}));
