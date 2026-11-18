"use client";

import { create } from "zustand";

export type ModoAperturaCrear = "normal" | "prompt" | "imagen" | "voz";

interface UiProyectosState {
  crearAbierto: boolean;
  crearModo: ModoAperturaCrear;
  gestionarId: string | null;
  abrirCrear: (modo?: ModoAperturaCrear) => void;
  cerrarCrear: () => void;
  abrirGestionar: (id: string) => void;
  cerrarGestionar: () => void;
}

/**
 * Estado de los modales del dashboard.
 *
 * `crearModo` le dice al modal con qué intención se abrió: prompt precargado,
 * selector de imagen o foco en el dictado. No cambia el formulario, solo el
 * foco inicial.
 */
export const useUiProyectosStore = create<UiProyectosState>((set) => ({
  crearAbierto: false,
  crearModo: "normal",
  gestionarId: null,
  abrirCrear: (modo = "normal") =>
    set({ crearAbierto: true, crearModo: modo }),
  cerrarCrear: () => set({ crearAbierto: false, crearModo: "normal" }),
  abrirGestionar: (id: string) => set({ gestionarId: id }),
  cerrarGestionar: () => set({ gestionarId: null }),
}));
