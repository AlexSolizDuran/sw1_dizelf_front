"use client";

import { AlertTriangle, ArrowLeft, Download, ExternalLink, FileText, Loader2, Pencil, Printer, Trash2 } from "lucide-react";
import { descargarCsv, imprimirPresupuesto } from "@/lib/presupuesto/exportar";
import {
  convertirMonto,
  formatearCantidad,
  formatearFecha,
  formatearMoneda,
} from "@/lib/presupuesto/formato";
import type { Moneda, Presupuesto } from "@/types/presupuesto";
import s from "./presupuesto.module.css";

interface Props {
  presupuesto: Presupuesto;
  nombreProyecto: string;
  moneda: Moneda;
  puedeRenombrar: boolean;
  puedeBorrar: boolean;
  guardando: boolean;
  error: string | null;
  aviso: string | null;
  onVolver: () => void;
  onRenombrar: () => void;
  onEliminar: () => void;
  onError: (mensaje: string) => void;
}

/**
 * Presupuesto ya generado: es un snapshot, no un formulario.
 *
 * Todo lo que se muestra acá está congelado en la base: precios, fuente y la
 * tasa con la que se calculó el total en dólares. Si el plano o los precios
 * cambiaron, se genera otro presupuesto; este no se edita (salvo el nombre).
 */
export function DetallePresupuesto({
  presupuesto,
  nombreProyecto,
  moneda,
  puedeRenombrar,
  puedeBorrar,
  guardando,
  error,
  aviso,
  onVolver,
  onRenombrar,
  onEliminar,
  onError,
}: Props) {
  const exportarPdf = () => {
    const ok = imprimirPresupuesto(presupuesto, nombreProyecto);
    if (!ok) {
      onError(
        "El navegador bloqueó la ventana de impresión. Habilitá las ventanas emergentes para guardar el PDF."
      );
    }
  };

  return (
    <div className={s.detalle}>
      <div className={s.detalleHead}>
        <button className={s.botonSecundario} onClick={onVolver} type="button">
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </button>

        <div className={s.detalleTitulo}>
          <h2 className={s.titulo}>{presupuesto.nombre}</h2>
          <p className={s.subtitulo}>
            {formatearFecha(presupuesto.fecha)} · Bs{" "}
            {presupuesto.tipoCambioUsd}/USD
          </p>
        </div>

        <div className={s.acciones}>
          <button
            className={s.botonSecundario}
            onClick={() => descargarCsv(presupuesto)}
            title="Descargar CSV para Excel"
            type="button"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            className={s.botonSecundario}
            onClick={exportarPdf}
            title="Abrir la vista de impresión (Guardar como PDF)"
            type="button"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </button>
          {puedeRenombrar && (
            <button
              aria-label="Renombrar el presupuesto"
              className={s.botonIcono}
              disabled={guardando}
              onClick={onRenombrar}
              title="Renombrar"
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {puedeBorrar && (
            <button
              aria-label="Eliminar el presupuesto"
              className={`${s.botonIcono} ${s.botonPeligro}`}
              disabled={guardando}
              onClick={onEliminar}
              title="Eliminar"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className={s.error} role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {aviso && <p className={s.avisoOk}>{aviso}</p>}

      <div className={s.totales}>
        <div className={s.totalBloque}>
          <span className={s.etiqueta}>Total en bolivianos</span>
          <strong className={s.totalValor}>
            {formatearMoneda(presupuesto.totalMaterialesBs, "BOB")}
          </strong>
        </div>
        <div className={s.totalBloque}>
          <span className={s.etiqueta}>Total en dólares</span>
          <strong className={s.totalValor}>
            {formatearMoneda(presupuesto.totalMaterialesUsd, "USD")}
          </strong>
        </div>
        <div className={s.totalBloque}>
          <span className={s.etiqueta}>Líneas</span>
          <strong className={s.totalValor}>{presupuesto.lineas.length}</strong>
        </div>
        <div className={s.totalBloque}>
          <span className={s.etiqueta}>Pendientes</span>
          <strong
            className={s.totalValor}
            data-alerta={presupuesto.lineasPendientes > 0}
          >
            {presupuesto.lineasPendientes}
          </strong>
        </div>
      </div>

      <div className={s.tablaWrap}>
        <table className={s.tabla}>
          <thead>
            <tr>
              <th>Material</th>
              <th className={s.celdaNum}>Cantidad</th>
              <th className={s.celdaNum}>P. unitario</th>
              <th className={s.celdaNum}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {presupuesto.lineas.map((linea) => (
              <tr
                className={s.fila}
                data-pendiente={linea.pendiente}
                key={linea.id}
              >
                <td className={s.celdaMaterial}>
                  <span className={s.materialNombre}>{linea.descripcion}</span>
                  <span className={s.materialMeta}>
                    {linea.categoria} · {linea.origen === "MANUAL" ? "precio a mano" : "precio de tienda"}
                  </span>
                  {linea.fuente?.tipo === "web" && linea.fuente.proveedor && (
                    <span className={s.fuente}>
                      {linea.fuente.url ? (
                        <a
                          className={s.fuenteLink}
                          href={linea.fuente.url}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {linea.fuente.proveedor}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        linea.fuente.proveedor
                      )}
                      {linea.fuente.sku ? ` · SKU ${linea.fuente.sku}` : ""}
                      {" · "}
                      {formatearFecha(linea.fuente.capturadoEn)}
                    </span>
                  )}
                  {linea.pendiente && linea.nota && (
                    <span className={s.pendienteNota}>{linea.nota}</span>
                  )}
                </td>
                <td className={s.celdaNum}>
                  {formatearCantidad(linea.cantidad)}{" "}
                  <span className={s.unidad}>{linea.unidad}</span>
                </td>
                <td className={s.celdaNum}>
                  {formatearMoneda(
                    convertirMonto(
                      linea.precioUnitarioBs,
                      moneda,
                      presupuesto.tipoCambioUsd
                    ),
                    moneda
                  )}
                </td>
                <td className={s.celdaNum} data-pendiente={linea.pendiente}>
                  {linea.pendiente
                    ? "pendiente"
                    : formatearMoneda(
                        convertirMonto(
                          linea.subtotalBs,
                          moneda,
                          presupuesto.tipoCambioUsd
                        ),
                        moneda
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {presupuesto.lineasPendientes > 0 && (
        <p className={s.avisoPendiente}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {presupuesto.lineasPendientes}{" "}
          {presupuesto.lineasPendientes === 1
            ? "línea fuera del total"
            : "líneas fuera del total"}{" "}
          por falta de precio. Generá otro con el precio escrito a mano.
        </p>
      )}

      <p className={s.hint}>
        <FileText className="mr-1 inline h-3 w-3 align-[-1px]" />
        Solo materiales. Cantidades estimadas; precios de tienda a la fecha
        indicada. CSV y PDF en bolivianos.
        {guardando && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
      </p>
    </div>
  );
}
