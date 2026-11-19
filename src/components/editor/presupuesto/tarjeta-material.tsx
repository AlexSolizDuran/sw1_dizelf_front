"use client";

import { useState, type ReactNode } from "react";
import { Package } from "lucide-react";
import type { MaterialCatalogo } from "@/lib/presupuesto/catalogo";
import s from "./presupuesto.module.css";

interface Props {
  material: MaterialCatalogo;
  /**
   * `catalogo` es la tarjeta del buscador de materiales; `linea` es la misma
   * tarjeta ya elegida, con los campos para editarla. La imagen y los datos son
   * los mismos en los dos lugares: una sola pieza para reconocer el material de
   * un vistazo, no dos listas que se ven distintas.
   */
  variante: "catalogo" | "linea";
  /** Controles de la línea (cantidad, precio, quitar) o el botón de agregar. */
  children?: ReactNode;
  /** Supuesto con el que la receta calculó la cantidad, si vino medida. */
  supuesto?: string;
}

/**
 * Foto del material.
 *
 * Las de tienda apuntan al CDN del proveedor (la URL la sirve el backend, es la
 * del producto que cotiza) y las manuales al `public/materiales` del front. Si
 * la tienda cambia el archivo, la imagen queda roja y rota: en ese caso se cae
 * al ícono, nunca a la foto de otro producto.
 */
function Miniatura({ material }: { material: MaterialCatalogo }) {
  const [rota, setRota] = useState(false);

  if (!material.imagen || rota) {
    return (
      <span aria-hidden className={s.miniatura} data-vacia="true">
        <Package className="h-4 w-4" />
      </span>
    );
  }

  return (
    <img
      alt=""
      className={s.miniatura}
      decoding="async"
      height={64}
      loading="lazy"
      onError={() => setRota(true)}
      src={material.imagen}
      width={64}
    />
  );
}

/** Una tarjeta de material: foto, nombre, de dónde sale el precio y la nota. */
export function TarjetaMaterial({
  material,
  variante,
  children,
  supuesto,
}: Props) {
  // En la línea ya elegida manda el supuesto con el que se calculó; en el
  // catálogo, la nota del producto.
  const nota = variante === "linea" ? supuesto ?? material.nota : material.nota;

  return (
    <article className={s.tarjeta} data-variante={variante}>
      <Miniatura material={material} />

      <div className={s.tarjetaTexto}>
        <h3 className={s.tarjetaNombre}>{material.nombre}</h3>
        <p className={s.tarjetaMeta}>
          {material.unidad} · {material.precioWeb ? "tienda" : "manual"}
        </p>
        {nota && (
          <p className={s.tarjetaNota} title={nota}>
            {nota}
          </p>
        )}
      </div>

      {children && <div className={s.tarjetaAcciones}>{children}</div>}
    </article>
  );
}
