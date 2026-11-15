/**
 * Recetas de consumo: de metros medidos en el plano a cantidad de material.
 *
 * ESTO NO ES UN PRECIO, ES UN COEFICIENTE
 * ---------------------------------------
 * El precio lo resuelve el backend en una tienda real. Acá solo se convierte
 * geometría en cantidad comprada, y todos los coeficientes de este archivo son
 * ESTIMACIONES de obra: se muestran al usuario en el panel (con `supuesto`) y
 * quedan en la descripción de la línea. Nunca se presentan como un dato de la
 * tienda ni del fabricante.
 *
 * Si un coeficiente cambia, cambia `RECETA_VERSION`: el número viaja en el
 * presupuesto para que un presupuesto viejo se pueda explicar con la receta con
 * la que se generó.
 */

export const RECETA_VERSION = "0.1.0";

export interface Coeficiente {
  /** Qué se mide para obtener la cantidad. */
  base: "m2_muro_neto" | "m2_piso" | "puertas" | "ventanas";
  /** Cuántas unidades de compra por unidad de medida. */
  factor: number;
  /** Se redondea hacia arriba: no se compra media bolsa ni medio ladrillo. */
  redondear: boolean;
  /** Supuesto de obra, tal como se le muestra al usuario. */
  supuesto: string;
}

/**
 * Clave de catálogo → coeficiente.
 *
 * Lo que NO está acá se agrega a mano: el acero depende del cálculo
 * estructural (no del área) y la pintura depende de las manos y del
 * rendimiento real, así que no se derivan de la escena.
 */
export const COEFICIENTES: Record<string, Coeficiente> = {
  ladrillo_6h: {
    base: "m2_muro_neto",
    factor: 24,
    redondear: true,
    supuesto:
      "24 piezas por m² de muro neto (bloque 24×15×10 con junta de 1,5 cm).",
  },
  cemento_ip30_50kg: {
    base: "m2_muro_neto",
    factor: 0.45,
    redondear: true,
    supuesto:
      "0,45 bolsas por m² de muro neto, para el mortero de asiento y junta (1:4).",
  },
  cerradura_externa: {
    base: "puertas",
    factor: 1,
    redondear: true,
    supuesto: "Una cerradura por puerta.",
  },
  puerta_interior: {
    base: "puertas",
    factor: 1,
    redondear: true,
    supuesto: "Una hoja por puerta dibujada.",
  },
  ventana_corrediza: {
    base: "ventanas",
    factor: 1,
    redondear: true,
    supuesto: "Una ventana por abertura dibujada.",
  },
  ceramica_piso: {
    base: "m2_piso",
    factor: 1.1,
    redondear: false,
    supuesto: "10 % de desperdicio sobre la superficie de piso.",
  },
  porcelanato: {
    base: "m2_piso",
    factor: 1.1,
    redondear: false,
    supuesto: "10 % de desperdicio sobre la superficie de piso.",
  },
};
