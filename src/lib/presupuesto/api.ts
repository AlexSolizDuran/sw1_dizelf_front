import { apiClient } from "@/lib/api";
import type {
  CrearPresupuestoInput,
  Presupuesto,
  PresupuestoLista,
  TipoCambioActual,
} from "@/types/presupuesto";

/**
 * Endpoints de presupuesto.
 *
 * Todos cuelgan de `/proyectos/:id/presupuestos`, así que el guard del backend
 * resuelve la membresía con el mismo `:id` del proyecto. Las capacidades son
 * `leer` para consultar, `editar` para crear y renombrar, y `administrar` para
 * borrar.
 */

export async function apiListarPresupuestos(
  proyectoId: string
): Promise<PresupuestoLista[]> {
  return apiClient<PresupuestoLista[]>(`/proyectos/${proyectoId}/presupuestos`);
}

/**
 * Genera un presupuesto. El servidor resuelve los precios contra las tiendas,
 * así que tarda lo que tarden esas consultas (una sola vez por material
 * distinto). `apiClient` ya corta a los 15 s.
 */
export async function apiCrearPresupuesto(
  proyectoId: string,
  input: CrearPresupuestoInput
): Promise<Presupuesto> {
  return apiClient<Presupuesto>(`/proyectos/${proyectoId}/presupuestos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiObtenerPresupuesto(
  proyectoId: string,
  presupuestoId: string
): Promise<Presupuesto> {
  return apiClient<Presupuesto>(
    `/proyectos/${proyectoId}/presupuestos/${presupuestoId}`
  );
}

/** Solo cambia la etiqueta: el contenido es un snapshot congelado. */
export async function apiRenombrarPresupuesto(
  proyectoId: string,
  presupuestoId: string,
  nombre: string
): Promise<Presupuesto> {
  return apiClient<Presupuesto>(
    `/proyectos/${proyectoId}/presupuestos/${presupuestoId}`,
    { method: "PATCH", body: JSON.stringify({ nombre }) }
  );
}

/**
 * Catálogo de materiales, servido por el backend.
 *
 * Es la única fuente de verdad: el selector del panel y el motor de precios del
 * servidor leen la misma lista, así que no puede haber una clave que el front
 * conozca y el back no sepa resolver.
 */
export interface MaterialCatalogoDto {
  clave: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precioAutomatico: boolean;
  nota: string | null;
  /** URL absoluta de la tienda, o ruta de `public/` para los manuales. */
  imagen: string | null;
}

export async function apiObtenerCatalogo(): Promise<MaterialCatalogoDto[]> {
  return apiClient<MaterialCatalogoDto[]>("/presupuestos/catalogo");
}

/**
 * Cotización sugerida del dólar. Es una referencia editable, no un dato del
 * presupuesto: el servidor responde 503 si la fuente no contesta.
 */
export async function apiObtenerTipoCambio(): Promise<TipoCambioActual> {
  return apiClient<TipoCambioActual>("/presupuestos/tipo-cambio");
}

export async function apiEliminarPresupuesto(
  proyectoId: string,
  presupuestoId: string
): Promise<{ message: string }> {
  return apiClient<{ message: string }>(
    `/proyectos/${proyectoId}/presupuestos/${presupuestoId}`,
    { method: "DELETE" }
  );
}
