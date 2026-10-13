"use client";

import { create } from "zustand";
import { UserProfile, LoginDto, RegisterDto } from "@/types/auth";
import { apiGetPerfil, apiLogin, apiLogout, apiRegister } from "@/lib/auth";

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  login: (credentials: LoginDto) => Promise<void>;
  register: (data: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  checkSession: async () => {
    set({ isLoading: true });
    try {
      const perfil = await apiGetPerfil();
      if (perfil && perfil.usuarioId) {
        set({
          user: perfil,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
        return;
      }
      set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
    }
  },

  login: async (credentials: LoginDto) => {
    set({ isLoading: true });
    try {
      const resp = await apiLogin(credentials);
      // El backend fija la cookie HttpOnly y retorna usuario en el body
      set({
        user: resp.usuario,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (data: RegisterDto) => {
    set({ isLoading: true });
    try {
      const resp = await apiRegister(data);
      set({
        user: resp.usuario,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await apiLogout();
    } catch {
      // Ignorar si falla la red, siempre limpiar estado local
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
