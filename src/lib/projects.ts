import { apiClient } from "@/lib/api";
import type {
  ActualizarProyectoInput,
  AgregarColaboradorInput,
  Colaborador,
  CrearProyectoInput,
  Proyecto,
  ProyectosPaginados,
  Version,
} from "@/types/proyecto";

/**
 * Endpoints de proyecto. Cada uno declara la capacidad que exige
 * (`@RequiereCapacidad`): `leer` para ver, `editar` para escribir el documento
 * vivo, `invitar` y `administrar` para lo que solo hace el creador.
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

export async function apiListarColaboradores(
  id: string
): Promise<Colaborador[]> {
  return apiClient<Colaborador[]>(`/proyectos/${id}/colaboradores`);
}

/**
 * Agrega un colaborador con permiso.
 *
 * `EDITOR` escribe en el plano, `LECTOR` solo mira. El backend valida contra
 * el catálogo de `permiso`, así que el front no tiene la lista: manda lo que el
 * usuario eligió y es la base la que acepta o rechaza.
 */
export async function apiAgregarColaborador(
  id: string,
  input: AgregarColaboradorInput
): Promise<Colaborador> {
  return apiClient<Colaborador>(`/proyectos/${id}/colaboradores`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Guardado manual: consolida.
 *
 * A diferencia del autosave, este es el único camino que crea una fila en
 * `version` y actualiza `proyecto.esquema_json`. Lo que se editó entre dos
 * guardados manuales vive solo en el documento vivo.
 */
export async function apiGuardarVersion(
  id: string,
  nombre?: string
): Promise<Version> {
  return apiClient<Version>(`/proyectos/${id}/versiones`, {
    method: "POST",
    body: JSON.stringify(nombre ? { nombre } : {}),
  });
}

/** Historial de guardados, del más nuevo al más viejo. */
export async function apiListarVersiones(id: string): Promise<Version[]> {
  return apiClient<Version[]>(`/proyectos/${id}/versiones`);
}

/**
 * Restaura una versión. Escribe su contenido en el documento vivo y consolida
 * el proyecto, así que el historial no se pierde: queda un guardado nuevo.
 *
 * Devuelve el proyecto actualizado porque el servidor lo reescribe: si la
 * restauración cambiaba la escena, el que está en pantalla dejaría de
 * corresponderse con lo guardado y habría que recargar.
 */
export async function apiRestaurarVersion(
  id: string,
  versionId: number
): Promise<Proyecto> {
  return apiClient<Proyecto>(
    `/proyectos/${id}/versiones/${versionId}/restaurar`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/**
 * Quita un colaborador. Solo el creador.
 *
 * `usuarioId` va en el path y no en un cuerpo: el backend lo toma de ahí.
 */
export async function apiQuitarColaborador(
  id: string,
  usuarioId: number
): Promise<{ message: string }> {
  return apiClient<{ message: string }>(
    `/proyectos/${id}/colaboradores/${usuarioId}`,
    { method: "DELETE" }
  );
}
