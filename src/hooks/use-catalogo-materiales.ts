"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiObtenerCatalogo, type MaterialCatalogoDto } from "@/lib/presupuesto/api";
import type { MaterialCatalogo } from "@/lib/presupuesto/catalogo";

interface Resultado {
  materiales: MaterialCatalogo[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

/**
 * Catálogo de materiales del panel, pedido al backend.
 *
 * `activo` es que el panel está abierto: el catálogo no se pide al montar el
 * editor, solo cuando alguien va a presupuestar. Se pide una vez y se recuerda
 * mientras el panel siga montado; si falla, se puede reintentar sin cerrarlo.
 */
export function useCatalogoMateriales(activo: boolean): Resultado {
  const [materiales, setMateriales] = useState<MaterialCatalogo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const cargar = useCallback(async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setCargando(true);
    setError(null);
    try {
      const catalogo = await apiObtenerCatalogo();
      setMateriales(catalogo.map(aMaterial));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el catálogo de materiales."
      );
    } finally {
      enVuelo.current = false;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo && materiales.length === 0 && !error) void cargar();
  }, [activo, materiales.length, error, cargar]);

  return { materiales, cargando, error, recargar: cargar };
}

function aMaterial(dto: MaterialCatalogoDto): MaterialCatalogo {
  return {
    clave: dto.clave,
    nombre: dto.nombre,
    categoria: dto.categoria,
    unidad: dto.unidad,
    precioWeb: dto.precioAutomatico,
    nota: dto.nota ?? undefined,
    imagen: dto.imagen,
  };
}
