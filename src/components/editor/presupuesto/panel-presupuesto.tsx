"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScene } from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { AlertTriangle, Calculator, X } from "lucide-react";
import { useCatalogoMateriales } from "@/hooks/use-catalogo-materiales";
import { usePresupuestos } from "@/hooks/use-presupuestos";
import { useTipoCambio } from "@/hooks/use-tipo-cambio";
import { nombreDePiso } from "@/lib/editor/level-selection";
import { indexarCatalogo } from "@/lib/presupuesto/catalogo";
import { numeroDesdeTexto } from "@/lib/presupuesto/formato";
import { borradorDe, medirYSugerir, type LineaBorrador } from "@/lib/presupuesto/lineas";
import type { AlcanceMedicion, MedicionNivel } from "@/lib/presupuesto/medicion";
import { RECETA_VERSION } from "@/lib/presupuesto/recetas";
import type { Moneda } from "@/types/presupuesto";
import { BorradorPresupuesto } from "./borrador-presupuesto";
import { DetallePresupuesto } from "./detalle-presupuesto";
import { ListaPresupuestos } from "./lista-presupuestos";
import s from "./presupuesto.module.css";

interface Props {
  proyectoId: string;
  nombreProyecto: string;
  /** Con `false` (LECTOR) el panel se abre en modo consulta. */
  puedeEditar: boolean;
  /** Rol del usuario: borrar exige `administrar`, que es del CREADOR. */
  miRol: string;
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Presupuesto de materiales del proyecto.
 *
 * El panel hace tres cosas y ninguna inventa un precio:
 *
 * 1. Mide el plano (muros, aberturas, losas) y propone cantidades con una
 *    receta de consumo explícita.
 * 2. Manda las cantidades al backend, que resuelve los precios en las tiendas
 *    y congela cada línea con su fuente y su fecha.
 * 3. Muestra el snapshot, con exportación a CSV y a PDF.
 *
 * Lo que no tiene precio se queda PENDIENTE y fuera del total: no se rellena con
 * un número inventado ni se descarta la línea.
 */
export function PanelPresupuesto({
  proyectoId,
  nombreProyecto,
  puedeEditar,
  miRol,
  abierto,
  onCerrar,
}: Props) {
  const presupuestos = usePresupuestos(proyectoId);
  const catalogo = useCatalogoMateriales(abierto);
  const cotizacion = useTipoCambio(abierto);
  const nivelId = useViewer((st) => st.selection.levelId);

  const [moneda, setMoneda] = useState<Moneda>("BOB");
  const [nombre, setNombre] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([]);
  const [medicion, setMedicion] = useState<MedicionNivel | null>(null);
  // Por defecto se mide la planta que el usuario está viendo: es lo que espera
  // al abrir el presupuesto desde una planta concreta. Sumar todo el proyecto
  // es una decisión explícita.
  const [alcance, setAlcance] = useState<AlcanceMedicion>("nivel");
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const { cargar } = presupuestos;
  const cargado = useRef(false);

  // La tasa llega del backend y se propone una sola vez: si el usuario ya
  // escribió la suya (o la cambió), volver a abrir el panel no se la pisa.
  useEffect(() => {
    if (cotizacion.tasa && !tipoCambio.trim()) {
      setTipoCambio(numeroDesdeTexto(cotizacion.tasa.tasa)?.toString() ?? "");
    }
  }, [cotizacion.tasa, tipoCambio]);

  // El historial se pide cada vez que se abre (puede haber presupuestos de
  // otro colaborador), no al montar: el panel vive en el editor y no tiene por
  // qué consultar la API si nadie lo usa.
  useEffect(() => {
    if (!abierto) {
      cargado.current = false;
      return;
    }
    if (cargado.current) return;
    cargado.current = true;
    void cargar();
  }, [abierto, cargar]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, onCerrar]);

  const medirDelPlano = useCallback(() => {
    const { nodes } = useScene.getState();
    const objetivo = alcance === "proyecto" ? null : nivelId;
    const nivel = objetivo ? nodes[objetivo] : undefined;
    const nombreNivel =
      alcance === "proyecto"
        ? "Todo el proyecto"
        : objetivo
          ? nombreDePiso(nivel)
          : "Escena completa";

    const resultado = medirYSugerir(
      nodes,
      objetivo ?? null,
      nombreNivel,
      catalogo.materiales
    );
    setMedicion(resultado.medicion);

    // Se mezcla con lo que ya había: las cantidades de las líneas sugeridas se
    // actualizan y las que agregó el usuario a mano se respetan. Borrar todo
    // cada vez que alguien vuelve a medir sería perder su trabajo.
    setLineas((previas) => {
      const porClave = new Map(resultado.lineas.map((l) => [l.claveMaterial, l]));
      const conservadas = previas
        .filter((linea) => !porClave.has(linea.claveMaterial))
        .map((linea) => linea);

      const actualizadas = resultado.lineas.map((nueva) => {
        const previa = previas.find((l) => l.claveMaterial === nueva.claveMaterial);
        return previa
          ? { ...nueva, id: previa.id, precioManualBs: previa.precioManualBs }
          : nueva;
      });

      return [...actualizadas, ...conservadas];
    });

    if (!nombre.trim()) {
      setNombre(
        alcance === "proyecto"
          ? "Presupuesto completo"
          : `Presupuesto ${nombreNivel}`
      );
    }
  }, [alcance, catalogo.materiales, nivelId, nombre]);

  const cambiarCantidad = useCallback((id: string, cantidad: number) => {
    setLineas((previas) =>
      previas.map((linea) => (linea.id === id ? { ...linea, cantidad } : linea))
    );
  }, []);

  const cambiarPrecio = useCallback((id: string, precio: number | undefined) => {
    setLineas((previas) =>
      previas.map((linea) =>
        linea.id === id ? { ...linea, precioManualBs: precio } : linea
      )
    );
  }, []);

  const quitarLinea = useCallback((id: string) => {
    setLineas((previas) => previas.filter((linea) => linea.id !== id));
  }, []);

  const agregarLinea = useCallback(
    (clave: string) => {
      const material = indexarCatalogo(catalogo.materiales).get(clave);
      if (!material) return;
      setLineas((previas) => {
        if (previas.some((linea) => linea.claveMaterial === clave)) return previas;
        return [...previas, borradorDe(material, 1)];
      });
    },
    [catalogo.materiales]
  );

  const generar = useCallback(async () => {
    const tasa = numeroDesdeTexto(tipoCambio);
    if (!nombre.trim() || nombre.trim().length < 3) return;
    if (tasa === null || tasa <= 0) return;

    await presupuestos.crear({
      nombre: nombre.trim(),
      recetaVersion: RECETA_VERSION,
      tipoCambioUsd: tasa,
      lineas: lineas.map(({ material: _material, supuesto: _supuesto, id: _id, ...resto }) => resto),
    });
  }, [nombre, tipoCambio, lineas, presupuestos]);

  const renombrar = useCallback(async () => {
    if (!presupuestos.detalle) return;
    const entrada = window.prompt(
      "Nuevo nombre del presupuesto:",
      presupuestos.detalle.nombre
    );
    if (entrada === null) return;
    const limpio = entrada.trim();
    if (limpio.length < 3) return;
    await presupuestos.renombrar(presupuestos.detalle.id, limpio);
  }, [presupuestos]);

  const eliminar = useCallback(
    async (presupuestoId: string, nombrePresupuesto: string) => {
      const ok = window.confirm(
        `Eliminar «${nombrePresupuesto}». No se puede deshacer y no afecta al plano.`
      );
      if (!ok) return;
      await presupuestos.eliminar(presupuestoId);
    },
    [presupuestos]
  );

  const puedeBorrar = miRol === "CREADOR";

  if (!abierto) return null;

  return (
    <div className={s.backdrop} role="presentation">
      <section
        aria-label="Presupuesto de materiales"
        aria-modal="true"
        className={s.panel}
        role="dialog"
      >
        <header className={s.header}>
          <span className={s.headerIcono}>
            <Calculator className="h-4 w-4" />
          </span>
          <div className={s.headerTexto}>
            <h1 className={s.tituloPanel}>Presupuesto de materiales</h1>
            <p className={s.subtitulo}>
              {nombreProyecto} · precio en Bs y USD
            </p>
          </div>

          <div className={s.seg}>
            <button
              data-active={moneda === "BOB"}
              onClick={() => setMoneda("BOB")}
              type="button"
            >
              Bs
            </button>
            <button
              data-active={moneda === "USD"}
              onClick={() => setMoneda("USD")}
              type="button"
            >
              USD
            </button>
          </div>

          <button
            aria-label="Cerrar el presupuesto"
            className={s.botonIcono}
            onClick={onCerrar}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={s.cuerpo}>
          {presupuestos.detalle ? (
            <DetallePresupuesto
              aviso={presupuestos.aviso}
              error={errorExport ?? presupuestos.error}
              guardando={presupuestos.guardando}
              moneda={moneda}
              nombreProyecto={nombreProyecto}
              onEliminar={() =>
                void eliminar(
                  presupuestos.detalle!.id,
                  presupuestos.detalle!.nombre
                )
              }
              onError={setErrorExport}
              onRenombrar={() => void renombrar()}
              onVolver={presupuestos.cerrarDetalle}
              presupuesto={presupuestos.detalle}
              puedeBorrar={puedeBorrar}
              puedeRenombrar={puedeEditar}
            />
          ) : (
            <>
              {!puedeEditar && (
                <p className={s.avisoPendiente}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Solo lectura: podés ver el historial, pero no generar ni
                  borrar presupuestos.
                </p>
              )}

              {puedeEditar && (
                <BorradorPresupuesto
                  alcance={alcance}
                  aviso={presupuestos.aviso}
                  error={presupuestos.error}
                  catalogoCargando={catalogo.cargando}
                  catalogoError={catalogo.error}
                  guardando={presupuestos.guardando}
                  lineas={lineas}
                  materiales={catalogo.materiales}
                  medicion={medicion}
                  nombre={nombre}
                  onAgregar={agregarLinea}
                  onCantidad={cambiarCantidad}
                  onGenerar={() => void generar()}
                  onAlcance={setAlcance}
                  onMedir={medirDelPlano}
                  onNombre={setNombre}
                  onPrecio={cambiarPrecio}
                  onQuitar={quitarLinea}
                  onRecargarCatalogo={() => void catalogo.recargar()}
                  onTipoCambio={setTipoCambio}
                  puedeEditar={puedeEditar}
                  tasaFuente={cotizacion.tasa}
                  tasaSinDato={cotizacion.sinDato}
                  tipoCambio={tipoCambio}
                />
              )}

              <ListaPresupuestos
                cargando={presupuestos.cargando}
                guardando={presupuestos.guardando}
                lista={presupuestos.lista}
                moneda={moneda}
                onAbrir={(id) => void presupuestos.abrir(id)}
                onEliminar={(id, nombreLista) => void eliminar(id, nombreLista)}
                onRecargar={() => void presupuestos.cargar()}
                puedeBorrar={puedeBorrar}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
