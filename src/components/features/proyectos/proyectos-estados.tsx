"use client";

import React from "react";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProyectosEstadosProps {
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onCrear: () => void;
  vacio: boolean;
}

/** Estados carga / error / vacío (factor Fiabilidad). */
export function ProyectosEstados({
  isLoading,
  error,
  onRetry,
  onCrear,
  vacio,
}: ProyectosEstadosProps) {
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        aria-label="Cargando proyectos"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-[#EDE6DD] overflow-hidden animate-pulse"
          >
            <div className="h-40 bg-[#F2ECE3]" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-2/3 bg-[#F2ECE3] rounded" />
              <div className="h-3 w-1/3 bg-[#F2ECE3] rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 flex flex-col items-center text-center p-12 bg-white rounded-2xl border border-[#EDE6DD] max-w-xl mx-auto">
        <h2 className="text-base font-bold text-[#2B2A28]">
          No pudimos cargar tus proyectos
        </h2>
        <p className="mt-2 text-xs text-[#7A6D63] max-w-sm">{error}</p>
        <div className="mt-6">
          <Button onClick={onRetry} variant="outline" size="sm">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (vacio) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-[#EDE6DD] max-w-xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#F5ECE8] border border-[#E9DDD5] flex items-center justify-center text-[#8C432A] mb-5">
          <FolderKanban className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#2B2A28]">
          No tienes proyectos aún
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#7A6D63] max-w-sm">
          Creá tu primer plano para abrir el editor 2D/3D.
        </p>
        <div className="mt-6">
          <Button onClick={onCrear} size="sm">
            Crear mi primer proyecto
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
