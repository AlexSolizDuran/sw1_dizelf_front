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

export const RECETA_VERSION = "0.2.0";

export interface Coeficiente {
  /** Qué se mide para obtener la cantidad. */
  base: "m2_muro_neto" | "m2_piso" | "m2_techo" | "puertas" | "ventanas";
  /** Cuántas unidades de compra por unidad de medida. */
  factor: number;
  /** Se redondea hacia arriba: no se compra media bolsa ni medio ladrillo. */
  redondear: boolean;
  /** Supuesto de obra, tal como se le muestra al usuario. */
  supuesto: string;
}

/**
 * Receta de pintura.
 *
 * No es un coeficiente más porque la cantidad se calcula por color: cada
 * balde cubre solo la superficie pintada con ese color, no el muro entero.
 * El rendimiento es el que declara el catálogo del backend (8–10 m² por mano
 * por galón); se usa el punto medio para no quedarse corto ni inflar el
 * pedido.
 */
export const RECETA_PINTURA = {
  manos: 2,
  rendimientoM2PorGalon: 9,
  supuesto: "2 manos · 9 m²/galón",
} as const;

/**
 * Clave de catálogo → coeficiente.
 *
 * Lo que NO está acá se agrega a mano: el acero depende del cálculo
 * estructural, no del área.
 */
export const COEFICIENTES: Record<string, Coeficiente> = {
  ladrillo_6h: {
    base: "m2_muro_neto",
    factor: 24,
    redondear: true,
    supuesto: "24 pzas/m² (bloque 24×15×10, junta 1,5 cm).",
  },
  cemento_ip30_50kg: {
    base: "m2_muro_neto",
    factor: 0.45,
    redondear: true,
    supuesto: "0,45 bolsas/m² de mortero (1:4).",
  },
  cerradura_externa: {
    base: "puertas",
    factor: 1,
    redondear: true,
    supuesto: "1 por puerta.",
  },
  puerta_interior: {
    base: "puertas",
    factor: 1,
    redondear: true,
    supuesto: "1 por puerta.",
  },
  ventana_corrediza: {
    base: "ventanas",
    factor: 1,
    redondear: true,
    supuesto: "1 por abertura.",
  },
  ceramica_piso: {
    base: "m2_piso",
    factor: 1.1,
    redondear: false,
    supuesto: "10 % de desperdicio.",
  },
  cielo_raso: {
    base: "m2_techo",
    factor: 1.05,
    redondear: false,
    supuesto: "5 % de desperdicio.",
  },
  porcelanato: {
    base: "m2_piso",
    factor: 1.1,
    redondear: false,
    supuesto: "10 % de desperdicio.",
  },
};
