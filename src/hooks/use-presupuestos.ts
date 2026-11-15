"use client";

import { useCallback, useState } from "react";
import {
  apiCrearPresupuesto,
  apiEliminarPresupuesto,
  apiListarPresupuestos,
  apiObtenerPresupuesto,
  apiRenombrarPresupuesto,
} from "@/lib/presupuesto/api";
import type {
  CrearPresupuestoInput,
  Presupuesto,
  PresupuestoLista,
} from "@/types/presupuesto";

interface Estado {
  lista: PresupuestoLista[];
  detalle: Presupuesto | null;
  /** Cargando el historial. */
  cargando: boolean;
  /** Petición en curso que escribe (crear, renombrar, borrar). */
  guardando: boolean;
  error: string | null;
  aviso: string | null;
}

const INICIAL: Estado = {
  lista: [],
  detalle: null,
  cargando: false,
  guardando: false,
  error: null,
  aviso: null,
};

function mensaje(e: unknown, porDefecto: string): string {
  return e instanceof Error && e.message ? e.message : porDefecto;
}

/**
 * Estado del presupuesto de un proyecto.
 *
 * El historial y el detalle viven en el panel, no en el store global: el
 * presupuesto se consulta cuando se abre el panel y no lo necesita nadie más.
 * Cada acción devuelve el resultado (o `null` si falló) y deja el mensaje en
 * `error`, para que el componente no repita try/catch por todos lados.
 */
export function usePresupuestos(proyectoId: string) {
  const [estado, setEstado] = useState<Estado>(INICIAL);

  const parche = useCallback((cambios: Partial<Estado>) => {
    setEstado((prev) => ({ ...prev, ...cambios }));
  }, []);

  const cargar = useCallback(async () => {
    parche({ cargando: true, error: null });
    try {
      const lista = await apiListarPresupuestos(proyectoId);
      setEstado((prev) => ({ ...prev, lista, cargando: false }));
    } catch (e) {
      parche({
        cargando: false,
        error: mensaje(e, "No se pudo cargar el historial de presupuestos."),
      });
    }
  }, [proyectoId, parche]);

  const abrir = useCallback(
    async (presupuestoId: string): Promise<Presupuesto | null> => {
      parche({ error: null });
      try {
        const detalle = await apiObtenerPresupuesto(proyectoId, presupuestoId);
        parche({ detalle });
        return detalle;
      } catch (e) {
        parche({
          error: mensaje(e, "No se pudo abrir el presupuesto."),
        });
        return null;
      }
    },
    [proyectoId, parche]
  );

  const crear = useCallback(
    async (input: CrearPresupuestoInput): Promise<Presupuesto | null> => {
      parche({ guardando: true, error: null, aviso: null });
      try {
        const detalle = await apiCrearPresupuesto(proyectoId, input);
        // La lista se recarga desde el servidor: el `desactualizado` de las
        // filas viejas depende del hash del documento, que el front no calcula.
        const lista = await apiListarPresupuestos(proyectoId);
        setEstado((prev) => ({
          ...prev,
          guardando: false,
          detalle,
          lista,
          aviso: "Presupuesto generado.",
        }));
        return detalle;
      } catch (e) {
        parche({
          guardando: false,
          error: mensaje(e, "No se pudo generar el presupuesto."),
        });
        return null;
      }
    },
    [proyectoId, parche]
  );

  const renombrar = useCallback(
    async (presupuestoId: string, nombre: string): Promise<boolean> => {
      parche({ guardando: true, error: null });
      try {
        const detalle = await apiRenombrarPresupuesto(
          proyectoId,
          presupuestoId,
          nombre
        );
        setEstado((prev) => ({
          ...prev,
          guardando: false,
          detalle,
          lista: prev.lista.map((p) =>
            p.id === detalle.id ? { ...p, nombre: detalle.nombre } : p
          ),
          aviso: "Nombre actualizado.",
        }));
        return true;
      } catch (e) {
        parche({
          guardando: false,
          error: mensaje(e, "No se pudo renombrar el presupuesto."),
        });
        return false;
      }
    },
    [proyectoId, parche]
  );

  const eliminar = useCallback(
    async (presupuestoId: string): Promise<boolean> => {
      parche({ guardando: true, error: null });
      try {
        await apiEliminarPresupuesto(proyectoId, presupuestoId);
        setEstado((prev) => ({
          ...prev,
          guardando: false,
          detalle: prev.detalle?.id === presupuestoId ? null : prev.detalle,
          lista: prev.lista.filter((p) => p.id !== presupuestoId),
          aviso: "Presupuesto eliminado.",
        }));
        return true;
      } catch (e) {
        parche({
          guardando: false,
          error: mensaje(e, "No se pudo eliminar el presupuesto."),
        });
        return false;
      }
    },
    [proyectoId, parche]
  );

  const cerrarDetalle = useCallback(() => parche({ detalle: null }), [parche]);
  const limpiarMensajes = useCallback(
    () => parche({ error: null, aviso: null }),
    [parche]
  );

  return {
    ...estado,
    cargar,
    abrir,
    crear,
    renombrar,
    eliminar,
    cerrarDetalle,
    limpiarMensajes,
  };
}
