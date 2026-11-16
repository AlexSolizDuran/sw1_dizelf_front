import React from "react";
import { ProyectoLista } from "@/types/proyecto";
import { ProyectoCard } from "./proyecto-card";

interface ProyectosGridProps {
  proyectos: ProyectoLista[];
}

/** Grilla Recent Projects del modelo Dashboard (1/2/3/4 columnas). */
export function ProyectosGrid({ proyectos }: ProyectosGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {proyectos.map((p) => (
        <ProyectoCard key={p.id} proyecto={p} />
      ))}
    </div>
  );
}
