/**
 * Tipos del presupuesto de materiales.
 *
 * Los montos y las cantidades viajan como STRING decimal ("9404.96"), no como
 * number: así los manda el backend. Se formatean para mostrar, pero nunca se
 * usan para sumar totales: el total lo calcula el servidor con `Decimal`.
 */

/**
 * Cotización sugerida para el campo de tipo de cambio.
 *
 * Es una referencia del mercado, no un dato del presupuesto: el usuario la
 * edita y el presupuesto guarda la tasa que él confirmó.
 */
export interface TipoCambioActual {
  /** Decimal con 4 decimales. */
  tasa: string;
  compra: string | null;
  venta: string | null;
  /** "paralelo.bo (mediana P2P)". */
  fuente: string;
  fuenteUrl: string;
  /** ISO de la medición publicada por la fuente. */
  capturadoEn: string;
}

/** De dónde salió el precio de una línea. */
export type TipoFuentePrecio = "web" | "manual" | "pendiente";

export interface FuentePrecio {
  tipo: TipoFuentePrecio;
  /** Tienda de la que salió el precio: `constructorbolivia` o `morales`. */
  proveedor: string | null;
  url: string | null;
  sku: string | null;
  unidadExterna: string | null;
  disponible: boolean | null;
  /** ISO de cuándo se leyó el precio (congelado con el presupuesto). */
  capturadoEn: string;
  motivo?: string;
}

export interface LineaPresupuesto {
  id: number;
  orden: number;
  categoria: string;
  claveMaterial: string;
  descripcion: string;
  unidad: string;
  /** Decimal con 3 decimales. */
  cantidad: string;
  /** `null` si la línea está pendiente. */
  precioUnitarioBs: string | null;
  subtotalBs: string | null;
  /** `true` si no se pudo resolver el precio y nadie escribió uno. */
  pendiente: boolean;
  /** `CALCULADO` (precio de tienda) o `MANUAL` (lo escribió el usuario). */
  origen: string;
  fuente: FuentePrecio | null;
  nota: string | null;
}

export interface Presupuesto {
  id: string;
  proyectoId: string;
  creadorId: number;
  nombre: string;
  monedaBase: string;
  /** Decimal con 4 decimales, congelado al crear el presupuesto. */
  tipoCambioUsd: string;
  tipoCambioFuente: string;
  recetaVersion: string;
  documentoHash: string;
  totalMaterialesBs: string;
  /** Derivado con el tipo de cambio congelado, no con la tasa de hoy. */
  totalMaterialesUsd: string;
  lineasPendientes: number;
  fecha: string;
  lineas: LineaPresupuesto[];
}

export interface PresupuestoLista {
  id: string;
  nombre: string;
  fecha: string;
  totalMaterialesBs: string;
  totalMaterialesUsd: string;
  lineasPendientes: number;
  /** El plano cambió desde que se generó: hay que regenerarlo. */
  desactualizado: boolean;
}

/**
 * Línea que se manda al backend.
 *
 * No lleva precio de tienda: el servidor lo resuelve. `precioManualBs` es una
 * corrección deliberada del usuario y, si viene, gana sobre el de la tienda.
 */
export interface LineaEntrada {
  claveMaterial: string;
  categoria: string;
  descripcion: string;
  unidad: string;
  /** Hasta 3 decimales. */
  cantidad: number;
  precioManualBs?: number;
}

export interface CrearPresupuestoInput {
  nombre: string;
  /** Versión de las recetas con las que se midió el plano. */
  recetaVersion: string;
  /** Obligatorio: el usuario decide la tasa, no el sistema. */
  tipoCambioUsd: number;
  lineas: LineaEntrada[];
}

/** Moneda con la que se muestran los montos. */
export type Moneda = "BOB" | "USD";
