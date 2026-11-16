"use client";

import { create } from "zustand";

interface UiProyectosState {
  crearAbierto: boolean;
  gestionarId: string | null;
  abrirCrear: () => void;
  cerrarCrear: () => void;
  abrirGestionar: (id: string) => void;
  cerrarGestionar: () => void;
}

export const useUiProyectosStore = create<UiProyectosState>((set) => ({
  crearAbierto: false,
  gestionarId: null,
  abrirCrear: () => set({ crearAbierto: true }),
  cerrarCrear: () => set({ crearAbierto: false }),
  abrirGestionar: (id: string) => set({ gestionarId: id }),
  cerrarGestionar: () => set({ gestionarId: null }),
}));
