"use client";

import { AlertTriangle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { formatearFecha, formatearMoneda } from "@/lib/presupuesto/formato";
import type { Moneda, PresupuestoLista } from "@/types/presupuesto";
import s from "./presupuesto.module.css";

interface Props {
  lista: PresupuestoLista[];
  moneda: Moneda;
  cargando: boolean;
  guardando: boolean;
  puedeBorrar: boolean;
  onAbrir: (presupuestoId: string) => void;
  onEliminar: (presupuestoId: string, nombre: string) => void;
  onRecargar: () => void;
}

/**
 * Historial de presupuestos del proyecto, del más nuevo al más viejo.
 *
 * `desactualizado` lo calcula el backend comparando el hash del plano de
 * entonces con el de ahora: un presupuesto viejo de un plano que cambió no se
 * corrige solo, y hay que decirlo antes de que alguien lo mande a un cliente.
 */
export function ListaPresupuestos({
  lista,
  moneda,
  cargando,
  guardando,
  puedeBorrar,
  onAbrir,
  onEliminar,
  onRecargar,
}: Props) {
  return (
    <section className={s.historial}>
      <div className={s.historialHead}>
        <span className={s.techLabel}>Historial</span>
        <span className={s.contador}>{lista.length}</span>
        <button
          aria-label="Recargar el historial"
          className={s.botonIcono}
          disabled={cargando}
          onClick={onRecargar}
          title="Recargar"
          type="button"
        >
          {cargando ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </button>
      </div>

      {cargando && lista.length === 0 ? (
        <p className={s.vacio}>Cargando…</p>
      ) : lista.length === 0 ? (
        <p className={s.vacio}>
          Todavía no hay presupuestos. Generá el primero con las líneas de
          arriba.
        </p>
      ) : (
        <ul className={s.lista}>
          {lista.map((presupuesto) => (
            <li className={s.item} key={presupuesto.id}>
              <button
                className={s.itemBoton}
                onClick={() => onAbrir(presupuesto.id)}
                type="button"
              >
                <span className={s.itemNombre}>{presupuesto.nombre}</span>
                <span className={s.itemMeta}>
                  {formatearFecha(presupuesto.fecha)}
                </span>
              </button>

              <span className={s.itemTotal}>
                {formatearMoneda(
                  moneda === "BOB"
                    ? presupuesto.totalMaterialesBs
                    : presupuesto.totalMaterialesUsd,
                  moneda
                )}
              </span>

              {presupuesto.lineasPendientes > 0 && (
                <span
                  className={s.badgeAlerta}
                  title={`${presupuesto.lineasPendientes} líneas sin precio`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {presupuesto.lineasPendientes}
                </span>
              )}

              {presupuesto.desactualizado && (
                <span
                  className={s.badge}
                  title="El plano cambió desde que se generó este presupuesto"
                >
                  plano cambiado
                </span>
              )}

              {puedeBorrar && (
                <button
                  aria-label={`Eliminar ${presupuesto.nombre}`}
                  className={`${s.botonIcono} ${s.botonPeligro}`}
                  disabled={guardando}
                  onClick={() => onEliminar(presupuesto.id, presupuesto.nombre)}
                  title="Eliminar"
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
