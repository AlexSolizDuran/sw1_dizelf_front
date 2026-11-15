"use client";

import { useEffect, useRef, useState } from "react";
import { apiObtenerTipoCambio } from "@/lib/presupuesto/api";
import type { TipoCambioActual } from "@/types/presupuesto";

interface Resultado {
  /** Cotización sugerida, o `null` si todavía no llegó o no hay. */
  tasa: TipoCambioActual | null;
  cargando: boolean;
  /** La fuente no respondió: el usuario tiene que escribir la tasa. */
  sinDato: boolean;
}

/**
 * Cotización de referencia para precargar el campo de tipo de cambio.
 *
 * Es una SUGERENCIA editable: si la fuente no responde el campo queda vacío y
 * el usuario escribe la suya. Nunca se bloquea el presupuesto por esto, y
 * tampoco se usa una tasa vieja como respaldo.
 */
export function useTipoCambio(activo: boolean): Resultado {
  const [tasa, setTasa] = useState<TipoCambioActual | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinDato, setSinDato] = useState(false);
  const pedido = useRef(false);

  useEffect(() => {
    if (!activo || pedido.current) return;
    pedido.current = true;
    setCargando(true);

    let vigente = true;
    apiObtenerTipoCambio()
      .then((valor) => {
        if (vigente) setTasa(valor);
      })
      .catch(() => {
        if (vigente) setSinDato(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [activo]);

  return { tasa, cargando, sinDato };
}
