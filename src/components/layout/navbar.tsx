"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Settings, LogOut, User as UserIcon, Plus } from "lucide-react";
import { useAuthStore } from "@/stores/use-auth-store";

export function Navbar() {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized, checkSession, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isInitialized) {
      checkSession();
    }
  }, [isInitialized, checkSession]);

  // Cerrar dropdown si se hace click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    router.push("/login");
  };

  const handleNewDesign = () => {
    if (!isAuthenticated) {
      router.push("/login");
    } else {
      router.push("/proyectos");
    }
  };

  const getInitials = () => {
    if (!user) return "U";
    if (user.persona?.nombre) {
      const p1 = user.persona.nombre[0] || "";
      const p2 = user.persona.apellido?.[0] || "";
      return (p1 + p2).toUpperCase();
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  return (
    <header className="w-full bg-[#FAF7F2] border-b border-[#EFEAE2] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logotipo DIZELF */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-wider text-[#6A3825] group-hover:opacity-90 transition-opacity">
            DIZELF
          </span>
        </Link>

        {/* Enlaces de Navegación Centrales */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#5B4E44]">
          <Link href="/proyectos" className="hover:text-[#8C432A] transition-colors">
            Projects
          </Link>
          <Link href="#assets" className="hover:text-[#8C432A] transition-colors">
            Assets
          </Link>
          <Link href="#library" className="hover:text-[#8C432A] transition-colors">
            Library
          </Link>
          <Link href="#community" className="hover:text-[#8C432A] transition-colors">
            Community
          </Link>
        </nav>

        {/* Acciones y Perfil / Login */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Iconos de Campana y Ajustes */}
          <button
            type="button"
            className="p-2 text-[#7C6E64] hover:text-[#2B2A28] hover:bg-[#F2ECE3] rounded-full transition-colors"
            aria-label="Notificaciones"
          >
            <Bell className="w-5 h-5" />
          </button>

          <button
            type="button"
            className="p-2 text-[#7C6E64] hover:text-[#2B2A28] hover:bg-[#F2ECE3] rounded-full transition-colors"
            aria-label="Configuración"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Botón New Design */}
          <button
            type="button"
            onClick={handleNewDesign}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-[#8C432A] hover:bg-[#783721] active:bg-[#682F1B] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Design</span>
          </button>

          {/* Menú de Usuario / Sesión (HU 3: Logout) */}
          {isAuthenticated && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-9 h-9 rounded-full bg-[#E5DFD6] hover:bg-[#DCD4C9] border border-[#D5CCC0] flex items-center justify-center text-xs font-bold text-[#5A4B40] transition-colors focus:outline-none focus:ring-2 focus:ring-[#8C432A]/30"
                aria-label="Abrir menú de usuario"
              >
                {getInitials()}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#EAE3DA] py-2 z-50 animate-in fade-in-50 zoom-in-95">
                  <div className="px-4 py-3 border-b border-[#F0EAE1]">
                    <p className="text-xs text-[#8A7C73]">Conectado como</p>
                    <p className="text-sm font-semibold text-[#2B2A28] truncate">
                      {user.persona?.nombre
                        ? `${user.persona.nombre} ${user.persona.apellido}`
                        : user.username}
                    </p>
                    <p className="text-xs text-[#8C432A] font-mono truncate">
                      @{user.username}
                    </p>
                    {user.persona?.gmail && (
                      <p className="text-[11px] text-[#7A6D63] truncate mt-0.5">
                        {user.persona.gmail}
                      </p>
                    )}
                  </div>

                  <div className="py-1">
                    <Link
                      href="/proyectos"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-[#4A3E36] hover:bg-[#FAF7F2] transition-colors"
                    >
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>Mis Proyectos</span>
                    </Link>
                  </div>

                  {/* Opción Visible para Cerrar Sesión (Criterio de Aceptación HU 3) */}
                  <div className="pt-1 border-t border-[#F0EAE1]">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors font-medium text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-semibold text-[#5B4E44] hover:text-[#8C432A] transition-colors"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#8C432A] hover:bg-[#783721] rounded-md transition-colors"
              >
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
