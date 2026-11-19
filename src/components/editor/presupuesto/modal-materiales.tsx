"use client";

import { useEffect } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import type { MaterialCatalogo } from "@/lib/presupuesto/catalogo";
import s from "./presupuesto.module.css";
import { TarjetaMaterial } from "./tarjeta-material";

interface Props {
  abierto: boolean;
  materiales: MaterialCatalogo[];
  cargando: boolean;
  error: string | null;
  onRecargar: () => void;
  /** Claves que ya están en el borrador: se marcan y no se pueden repetir. */
  agregadas: Set<string>;
  onAgregar: (clave: string) => void;
  onCerrar: () => void;
}

/**
 * Selector de materiales del presupuesto.
 *
 * Reemplaza al `<select>`: cada material muestra su foto, su unidad de compra y
 * la nota de qué cuidar, que es justo lo que hace falta para elegirlo bien
 * (¿el precio es por pieza o por millar? ¿la cerámica viene por caja?). El modal
 * no se cierra al agregar, para sumar varios de una vez.
 */
export function ModalMateriales({
  abierto,
  materiales,
  cargando,
  error,
  onRecargar,
  agregadas,
  onAgregar,
  onCerrar,
}: Props) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // El panel escucha Escape en `window` (fase de burbuja) y cerraría todo
      // el presupuesto. Cortar la propagación en la captura del documento evita
      // que la tecla vuelva a subir al panel: primero cierra el modal.
      e.stopPropagation();
      onCerrar();
    };
    document.addEventListener("keydown", alTeclear, true);
    return () => document.removeEventListener("keydown", alTeclear, true);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const conPrecio = materiales.filter((m) => m.precioWeb);
  const aMano = materiales.filter((m) => !m.precioWeb);

  const grupo = (titulo: string, lista: MaterialCatalogo[]) =>
    lista.length > 0 && (
      <section className={s.grupo}>
        <header className={s.grupoHead}>
          <h3 className={s.grupoTitulo}>{titulo}</h3>
        </header>
        <div className={s.grilla}>
          {lista.map((material) => {
            const yaEsta = agregadas.has(material.clave);
            return (
              <TarjetaMaterial
                key={material.clave}
                material={material}
                variante="catalogo"
              >
                <button
                  className={s.botonSecundario}
                  disabled={yaEsta}
                  onClick={() => onAgregar(material.clave)}
                  type="button"
                >
                  {yaEsta ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Agregado
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Agregar
                    </>
                  )}
                </button>
              </TarjetaMaterial>
            );
          })}
        </div>
      </section>
    );

  return (
    <div
      className={s.modalBackdrop}
      onClick={onCerrar}
      role="presentation"
    >
      <section
        aria-label="Agregar un material"
        aria-modal="true"
        className={s.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className={s.modalHead}>
          <div className={s.headerTexto}>
            <h2 className={s.tituloPanel}>Agregar material</h2>
          </div>
          <button
            aria-label="Cerrar el selector de materiales"
            className={s.botonIcono}
            onClick={onCerrar}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={s.modalCuerpo}>
          {cargando && materiales.length === 0 && (
            <p className={s.hint}>
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Cargando materiales…
            </p>
          )}

          {error && materiales.length === 0 && (
            <p className={s.hint} role="alert">
              No se pudo cargar.{" "}
              <button className={s.enlace} onClick={onRecargar} type="button">
                Reintentar
              </button>
            </p>
          )}

          {grupo("Precio de tienda", conPrecio)}
          {grupo("Precio manual", aMano)}
        </div>
      </section>
    </div>
  );
}
