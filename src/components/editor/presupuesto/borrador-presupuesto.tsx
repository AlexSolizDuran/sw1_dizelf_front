"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";
import type { MaterialCatalogo } from "@/lib/presupuesto/catalogo";
import {
  formatearCantidad,
  formatearFecha,
  numeroDesdeTexto,
} from "@/lib/presupuesto/formato";
import type { LineaBorrador } from "@/lib/presupuesto/lineas";
import type { AlcanceMedicion, MedicionNivel } from "@/lib/presupuesto/medicion";
import { RECETA_VERSION } from "@/lib/presupuesto/recetas";
import type { TipoCambioActual } from "@/types/presupuesto";
import { ModalMateriales } from "./modal-materiales";
import s from "./presupuesto.module.css";
import { TarjetaMaterial } from "./tarjeta-material";

interface Props {
  nombre: string;
  onNombre: (valor: string) => void;
  tipoCambio: string;
  onTipoCambio: (valor: string) => void;
  lineas: LineaBorrador[];
  /** Catálogo del backend: sin él no se puede agregar ningún material. */
  materiales: MaterialCatalogo[];
  catalogoCargando: boolean;
  catalogoError: string | null;
  onRecargarCatalogo: () => void;
  /** Cotización sugerida y editable, con su fuente. */
  tasaFuente: TipoCambioActual | null;
  tasaSinDato: boolean;
  medicion: MedicionNivel | null;
  alcance: AlcanceMedicion;
  onAlcance: (valor: AlcanceMedicion) => void;
  puedeEditar: boolean;
  guardando: boolean;
  error: string | null;
  aviso: string | null;
  onMedir: () => void;
  onCantidad: (id: string, cantidad: number) => void;
  onPrecio: (id: string, precio: number | undefined) => void;
  onQuitar: (id: string) => void;
  onAgregar: (clave: string) => void;
  onGenerar: () => void;
}

/**
 * Línea ya elegida: la misma tarjeta del selector, con los campos para ajustar
 * la cantidad y, si hace falta, corregir el precio.
 *
 * La cantidad se escribe libre y se interpreta al salir, así que un "1.500"
 * sigue siendo mil quinientos y no corta el tipeo a mitad de palabra.
 */
function LineaTarjeta({
  linea,
  puedeEditar,
  onCantidad,
  onPrecio,
  onQuitar,
}: {
  linea: LineaBorrador;
  puedeEditar: boolean;
  onCantidad: (id: string, cantidad: number) => void;
  onPrecio: (id: string, precio: number | undefined) => void;
  onQuitar: (id: string) => void;
}) {
  const [cantidad, setCantidad] = useState(String(linea.cantidad));
  const [precio, setPrecio] = useState(
    linea.precioManualBs === undefined ? "" : String(linea.precioManualBs)
  );

  // Si la cantidad cambia por fuera (medir otra vez), el input la sigue.
  useEffect(() => {
    setCantidad(String(linea.cantidad));
  }, [linea.cantidad]);

  const confirmarCantidad = () => {
    const numero = numeroDesdeTexto(cantidad);
    if (numero !== null && numero > 0) onCantidad(linea.id, numero);
    else setCantidad(String(linea.cantidad));
  };

  const confirmarPrecio = () => {
    const numero = numeroDesdeTexto(precio);
    if (!precio.trim()) onPrecio(linea.id, undefined);
    else if (numero !== null && numero > 0) onPrecio(linea.id, numero);
    else
      setPrecio(linea.precioManualBs === undefined ? "" : String(linea.precioManualBs));
  };

  return (
    <li>
      <TarjetaMaterial
        material={linea.material}
        supuesto={linea.supuesto}
        variante="linea"
      >
        <label className={s.campoLinea}>
          <span className={s.etiqueta}>Cantidad</span>
          <span className={s.campoFila}>
            <input
              aria-label={`Cantidad de ${linea.material.nombre}`}
              className={s.inputNum}
              disabled={!puedeEditar}
              inputMode="decimal"
              onBlur={confirmarCantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              value={cantidad}
            />
            <span className={s.unidad}>{linea.unidad}</span>
          </span>
        </label>

        <label className={s.campoLinea}>
          <span className={s.etiqueta}>Precio unitario (Bs)</span>
          <span className={s.campoFila}>
            <input
              aria-label={`Precio unitario en bolivianos de ${linea.material.nombre}`}
              className={s.inputNum}
              disabled={!puedeEditar}
              inputMode="decimal"
              onBlur={confirmarPrecio}
              onChange={(e) => setPrecio(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={linea.material.precioWeb ? "de tienda" : "obligatorio"}
              value={precio}
            />
          </span>
        </label>

        <button
          aria-label={`Quitar ${linea.material.nombre}`}
          className={s.botonIcono}
          disabled={!puedeEditar}
          onClick={() => onQuitar(linea.id)}
          title="Quitar la línea"
          type="button"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </TarjetaMaterial>
    </li>
  );
}

/**
 * Borrador del presupuesto: nombre, tipo de cambio y líneas con su cantidad.
 *
 * Los precios NO se ven acá porque todavía no existen: los resuelve el backend
 * al generar. El campo de precio por línea es una corrección opcional del
 * usuario (una cotización local, un descuento) y, si se escribe, gana.
 */
export function BorradorPresupuesto({
  nombre,
  onNombre,
  tipoCambio,
  onTipoCambio,
  lineas,
  materiales,
  catalogoCargando,
  catalogoError,
  onRecargarCatalogo,
  tasaFuente,
  tasaSinDato,
  medicion,
  alcance,
  onAlcance,
  puedeEditar,
  guardando,
  error,
  aviso,
  onMedir,
  onCantidad,
  onPrecio,
  onQuitar,
  onAgregar,
  onGenerar,
}: Props) {
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const agregadas = useMemo(
    () => new Set(lineas.map((linea) => linea.claveMaterial)),
    [lineas]
  );

  const sinPrecio = useMemo(
    () => lineas.filter((l) => !l.material.precioWeb && l.precioManualBs === undefined),
    [lineas]
  );

  const listo =
    puedeEditar &&
    nombre.trim().length >= 3 &&
    (numeroDesdeTexto(tipoCambio) ?? 0) > 0 &&
    lineas.length > 0 &&
    lineas.every((l) => l.cantidad > 0);

  const abrirSelector = useCallback(() => setSelectorAbierto(true), []);
  const cerrarSelector = useCallback(() => setSelectorAbierto(false), []);

  return (
    <div className={s.borrador}>
      <div className={s.campos}>
        <label className={s.campo}>
          <span className={s.etiqueta}>Nombre</span>
          <input
            className={s.input}
            disabled={!puedeEditar}
            maxLength={120}
            onChange={(e) => onNombre(e.target.value)}
            placeholder="Presupuesto de materiales"
            value={nombre}
          />
        </label>

        <label className={s.campo} data-ancho="corto">
          <span className={s.etiqueta}>Tipo de cambio (Bs por USD)</span>
          <input
            className={s.input}
            disabled={!puedeEditar}
            inputMode="decimal"
            onChange={(e) => onTipoCambio(e.target.value)}
            placeholder="Ej. 6,96"
            value={tipoCambio}
          />
        </label>
      </div>

      <p className={s.hint}>
        {tasaFuente ? (
          <>
            Sugerida por {tasaFuente.fuente} ({formatearFecha(tasaFuente.capturadoEn)}):{" "}
            <a
              className={s.enlace}
              href={tasaFuente.fuenteUrl}
              rel="noreferrer"
              target="_blank"
            >
              {tasaFuente.tasa} Bs/USD
            </a>
          </>
        ) : tasaSinDato ? (
          "Sin cotización del día: escribí la tasa a mano."
        ) : (
          "Consultando la cotización del día…"
        )}
      </p>

      <div className={s.medicion}>
        <div className={s.medicionHead}>
          <button
            className={s.botonSecundario}
            disabled={!puedeEditar || guardando || materiales.length === 0}
            onClick={onMedir}
            title={
              materiales.length === 0
                ? "El catálogo de materiales todavía no cargó"
                : "Mide muros, aberturas y losas"
            }
            type="button"
          >
            <Ruler className="h-3.5 w-3.5" />
            Medir del plano
          </button>

          <div className={s.seg} role="group" aria-label="Qué medir">
            <button
              aria-pressed={alcance === "nivel"}
              data-active={alcance === "nivel"}
              disabled={!puedeEditar}
              onClick={() => onAlcance("nivel")}
              title="Solo el nivel que estás viendo en el plano"
              type="button"
            >
              Nivel
            </button>
            <button
              aria-pressed={alcance === "proyecto"}
              data-active={alcance === "proyecto"}
              disabled={!puedeEditar}
              onClick={() => onAlcance("proyecto")}
              title="Suma todos los niveles del proyecto"
              type="button"
            >
              Todo
            </button>
          </div>

          <span className={s.techLabel}>
            {medicion ? medicion.nivelNombre : "sin medir"}
          </span>
        </div>

        {medicion && (
          <>
            <dl className={s.metricas}>
              {[
                ["Muro neto", `${formatearCantidad(medicion.areaMuroNetaM2)} m²`],
                ["Muro bruto", `${formatearCantidad(medicion.areaMuroBrutaM2)} m²`],
                ["Aberturas", `${formatearCantidad(medicion.areaAberturasM2)} m²`],
                ["Piso", `${formatearCantidad(medicion.areaPisoM2)} m²`],
                ["Puertas", String(medicion.puertas)],
                ["Ventanas", String(medicion.ventanas)],
              ].map(([titulo, valor]) => (
                <div className={s.metrica} key={titulo}>
                  <dt>{titulo}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>

            <p className={s.hint}>
              {medicion.muros} muros · {formatearCantidad(medicion.largoMuroM)} m de
              eje · cantidades estimadas (receta {RECETA_VERSION}).
              {medicion.usoAltoPorDefecto && " Altura asumida: 2,70 m."}
              {medicion.aberturasSinMedidas > 0 &&
                ` ${medicion.aberturasSinMedidas} aberturas sin medidas no descontadas.`}
            </p>
          </>
        )}
      </div>

      <div className={s.lineasHead}>
        <span className={s.etiqueta}>
          Materiales del presupuesto · {lineas.length}
        </span>
        <button
          className={s.botonSecundario}
          disabled={!puedeEditar}
          onClick={abrirSelector}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar material
        </button>
      </div>

      {lineas.length === 0 ? (
        <p className={s.vacio}>
          Sin materiales todavía. Medí el plano o agregalos desde el catálogo.
        </p>
      ) : (
        <ul className={s.lineas}>
          {lineas.map((linea) => (
            <LineaTarjeta
              key={linea.id}
              linea={linea}
              onCantidad={onCantidad}
              onPrecio={onPrecio}
              onQuitar={onQuitar}
              puedeEditar={puedeEditar}
            />
          ))}
        </ul>
      )}

      <ModalMateriales
        abierto={selectorAbierto}
        agregadas={agregadas}
        cargando={catalogoCargando}
        error={catalogoError}
        materiales={materiales}
        onAgregar={onAgregar}
        onCerrar={cerrarSelector}
        onRecargar={onRecargarCatalogo}
      />

      {catalogoError && materiales.length > 0 && (
        <p className={s.hint} role="alert">
          El catálogo se cargó con errores: faltan materiales.{" "}
          <button className={s.enlace} onClick={onRecargarCatalogo} type="button">
            Reintentar
          </button>
        </p>
      )}

      {error && (
        <p className={s.error} role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {aviso && <p className={s.avisoOk}>{aviso}</p>}

      <div className={s.pieAcciones}>
        <p className={s.hint}>
          Los precios se congelan al generar. Lo que no tenga precio queda
          pendiente.
        </p>
        <button
          className={s.botonPrimario}
          disabled={!listo || guardando}
          onClick={onGenerar}
          type="button"
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {guardando ? "Consultando tiendas…" : "Generar presupuesto"}
        </button>
      </div>

      {sinPrecio.length > 0 && (
        <p className={s.hint}>
          {sinPrecio.length}{" "}
          {sinPrecio.length === 1
            ? "línea sin precio de tienda"
            : "líneas sin precio de tienda"}
          : completá el precio unitario.
        </p>
      )}
    </div>
  );
}
