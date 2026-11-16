"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DraftingCompass,
  EllipsisVertical,
  FolderOpen,
  Settings2,
  Trash2,
} from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useProyectosStore } from "@/stores/use-proyectos-store";
import { useUiProyectosStore } from "@/stores/use-ui-proyectos-store";
import { ProyectoLista } from "@/types/proyecto";

interface ProyectoCardProps {
  proyecto: ProyectoLista;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "DZ";
}

/**
 * El backend devuelve el nombre crudo del permiso (`CREADOR`, `EDITOR`,
 * `LECTOR` o uno nuevo), así que se traduce solo lo conocido y el resto se
 * muestra tal cual.
 */
function etiquetaRol(rol: string): string {
  if (rol === "CREADOR") return "Creador";
  if (rol === "EDITOR") return "Editor";
  if (rol === "LECTOR") return "Lector";
  return rol;
}

/**
 * Card de proyecto según modelo Stitch "Dashboard":
 * portada (imagen o icono), nombre y menú de 3 puntos.
 */
export function ProyectoCard({ proyecto }: ProyectoCardProps) {
  const router = useRouter();
  const eliminar = useProyectosStore((s) => s.eliminar);
  const abrirGestionar = useUiProyectosStore((s) => s.abrirGestionar);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esCreador = proyecto.miRol === "CREADOR";

  const handleAbrir = () => {
    router.push(`/editor/${proyecto.id}`);
  };

  const handleEliminar = async () => {
    const confirmado = window.confirm(
      `¿Eliminar "${proyecto.nombre}"? Esta acción no se puede deshacer.`
    );
    if (!confirmado) return;
    setEliminando(true);
    setError(null);
    try {
      await eliminar(proyecto.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setEliminando(false);
    }
  };

  return (
    <article className="relative bg-white rounded-xl overflow-hidden group border border-[#EDE6DD] hover:border-[#DFCFC3] transition-colors">
      <button
        type="button"
        onClick={handleAbrir}
        aria-label={`Abrir ${proyecto.nombre}`}
        className="block w-full text-left"
      >
        <div className="h-40 bg-[#F5ECE8] border-b border-[#EDE6DD] flex items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center gap-2 text-[#8C432A]">
            <span className="w-12 h-12 rounded-2xl bg-white border border-[#E9DDD5] flex items-center justify-center font-extrabold text-sm">
              {iniciales(proyecto.nombre)}
            </span>
            <DraftingCompass className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </button>

      <div className="p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-[#2B2A28] truncate">
            {proyecto.nombre}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#7A6D63]">
            {etiquetaRol(proyecto.miRol)} · {proyecto.totalColaboradores}{" "}
            colaborador
            {proyecto.totalColaboradores === 1 ? "" : "es"}
          </p>
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label={`Opciones de ${proyecto.nombre}`}
          aria-expanded={menuAbierto}
          className="p-1.5 rounded-full text-[#7C6E64] hover:text-[#8C432A] hover:bg-[#F2ECE3] transition-colors shrink-0"
        >
          <EllipsisVertical className="w-5 h-5" />
        </button>
      </div>

      <DropdownMenu
        open={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        label={`Opciones de ${proyecto.nombre}`}
        options={[
          {
            label: "Abrir",
            icon: <FolderOpen className="w-3.5 h-3.5" />,
            onSelect: handleAbrir,
          },
          {
            label: "Gestionar",
            icon: <Settings2 className="w-3.5 h-3.5" />,
            onSelect: () => abrirGestionar(proyecto.id),
          },
          ...(esCreador
            ? [
                {
                  label: eliminando ? "Eliminando..." : "Eliminar",
                  icon: <Trash2 className="w-3.5 h-3.5" />,
                  danger: true,
                  onSelect: () => void handleEliminar(),
                },
              ]
            : []),
        ]}
      />
    </article>
  );
}
