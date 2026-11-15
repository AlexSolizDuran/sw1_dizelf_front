/**
 * Materiales que el panel puede presupuestar.
 *
 * LA LISTA NO VIVE ACÁ
 * --------------------
 * Viene del backend (`GET /presupuestos/catalogo`), que es el mismo catálogo
 * con el que el servidor resuelve los precios en las tiendas. Tener una copia
 * en el frontend se desincronizaba en silencio: una clave agregada solo acá
 * producía un presupuesto cuya línea salía PENDIENTE sin que nadie supiera por
 * qué.
 *
 * Lo que sí vive acá es la forma en la que el panel piensa los materiales
 * (`MaterialCatalogo`) y el índice por clave.
 */

export interface MaterialCatalogo {
  clave: string;
  nombre: string;
  categoria: string;
  /** Unidad de compra: bolsa, pza, barra, m2, m3, gal, kg. */
  unidad: string;
  /** El backend resuelve el precio contra una tienda. */
  precioWeb: boolean;
  /** Por qué está acá, o qué ojo hay que tener al usarlo. */
  nota?: string;
  /**
   * Foto para la tarjeta del material: la del producto en la tienda que lo
   * cotiza (`https://…`, hotlinkeada, la elige el backend) o la ilustración del
   * `public/materiales` para los que se cotizan a mano. `null` = sin foto.
   */
  imagen: string | null;
}

/** Índice por clave: el panel busca material en cada clic del selector. */
export function indexarCatalogo(
  materiales: MaterialCatalogo[]
): Map<string, MaterialCatalogo> {
  return new Map(materiales.map((material) => [material.clave, material]));
}
