import { apiClient } from "@/lib/api";
import type {
  ActualizarProyectoInput,
  Colaborador,
  CrearProyectoInput,
  Proyecto,
  ProyectosPaginados,
} from "@/types/proyecto";

/**
 * Endpoints de proyecto. El backend no usa prefijo global y exige el rol
 * CREADOR o INVITADO en cada uno (`ProyectoRolGuard`).
 */

export async function apiListarProyectos(
  pagina = 1,
  limite = 20
): Promise<ProyectosPaginados> {
  return apiClient<ProyectosPaginados>("/proyectos", {
    params: { pagina: String(pagina), limite: String(limite) },
  });
}

export async function apiCrearProyecto(
  input: CrearProyectoInput
): Promise<Proyecto> {
  return apiClient<Proyecto>("/proyectos", {
    method: "POST",
    body: JSON.stringify({ nombre: input.nombre }),
  });
}

export async function apiObtenerProyecto(id: string): Promise<Proyecto> {
  return apiClient<Proyecto>(`/proyectos/${id}`);
}

/**
 * Guarda el documento del proyecto.
 *
 * `keepalive` lo usa el paquete editor en el flush de salida: sin él, el
 * navegador cancela el fetch al descargar la página y se pierde la última
 * edición. `apiClient` lo propaga porque hace `...rest` hacia `fetch`.
 */
export async function apiGuardarProyecto(
  id: string,
  input: ActualizarProyectoInput,
  opciones: { keepalive?: boolean } = {}
): Promise<Proyecto> {
  return apiClient<Proyecto>(`/proyectos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    keepalive: opciones.keepalive,
  });
}

export async function apiEliminarProyecto(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/proyectos/${id}`, { method: "DELETE" });
}

export async function apiListarColaboradores(id: string): Promise<Colaborador[]> {
  return apiClient<Colaborador[]>(`/proyectos/${id}/colaboradores`);
}
