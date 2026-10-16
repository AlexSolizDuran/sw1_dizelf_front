import type { SceneGraph } from "@pascal-app/editor";

/**
 * Rol efectivo frente a un proyecto.
 *
 * `CREADOR` no es un permiso del catálogo: es la propiedad del proyecto,
 * reconocida por `proyecto.creador_id`. Los colaboradores tienen `EDITOR`
 * (escribe en el plano) o `LECTOR` (solo mira).
 *
 * Es `string` y no una unión cerrada a propósito: el backend devuelve el
 * `nombre` crudo de la tabla `permiso`, así que un permiso nuevo llega bien
 * sin cambiar este tipo ni desplegar.
 */
export type RolProyecto = string;

export type OrigenDocumento = "COLABORATIVO" | "PROYECTO";

export interface Proyecto {
  id: string;
  nombre: string;
  /**
   * El documento que se está mostrando. Viene de `documento_colaborativo` si
   * existe y de `proyecto.esquema_json` si no; `origen` dice de cuál.
   */
  esquemaJson: Record<string, unknown>;
  creadorId: number;
  miRol: RolProyecto;
  totalColaboradores: number;
  origen: OrigenDocumento;
  /**
   * Derivado del permiso por el backend. Con `false` el editor entra en
   * `readOnly`: el LECTOR ve la sesión pero no escribe.
   */
  puedeEditar: boolean;
}

/** La lista no incluye `esquemaJson`: son páginas de hasta 50 proyectos. */
export type ProyectoLista = Omit<Proyecto, "esquemaJson" | "origen">;

export interface ProyectosPaginados {
  datos: ProyectoLista[];
  total: number;
  pagina: number;
  limite: number;
}

export interface Colaborador {
  id: number;
  proyectoId: string;
  usuarioId: number;
  username: string;
  gmail: string;
  /** Nombre del permiso en la tabla, no un enum del front. */
  permiso: string;
  puedeEditar: boolean;
}

/** Una fila del historial de guardados manuales. */
export interface Version {
  id: number;
  fecha: string;
  nombre: string | null;
}

export type VistaEditor = "2d" | "3d";

/**
 * Documento persistido en `Proyecto.esquemaJson`.
 *
 * Va envuelto y no crudo por dos razones:
 *
 * 1. El DTO del backend valida `esquemaJson` con `@IsObject()`, que rechaza
 *    arrays y `null`. Un objeto plano es obligatorio.
 * 2. `version` permite migrar el formato más adelante sin adivinar. Sumado a
 *    `vista`, el blob tiene lugar para crecer (manifiesto para IA, cámara,
 *    historial) sin cambiar el contrato de la columna.
 */
export interface DocumentoProyecto {
  version: 1;
  scene: SceneGraph;
  vista: VistaEditor;
}

export interface CrearProyectoInput {
  nombre: string;
}

export interface ActualizarProyectoInput {
  nombre?: string;
  esquemaJson?: Record<string, unknown>;
}

export interface AgregarColaboradorInput {
  identificador: string;
  /**
   * `EDITOR` o `LECTOR`. El backend valida contra el catálogo. Opcional: si se
   * omite, el invitado entra como LECTOR (permiso por defecto del backend).
   */
  rol?: "EDITOR" | "LECTOR";
}

/**
 * Lee un `esquemaJson` sin asumir la forma.
 *
 * Acepta el documento envuelto y, por tolerancia, un `SceneGraph` crudo de
 * escenas guardadas antes de que existiera el envoltorio: en ese caso el blob
 * se interpreta entero como la escena y se normaliza al formato actual.
 */
export function leerDocumento(
  bruto: Record<string, unknown> | null | undefined
): DocumentoProyecto | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  if (Object.keys(bruto).length === 0) return null;

  if ("version" in bruto && "scene" in bruto) {
    const escena = bruto.scene as SceneGraph | undefined;
    if (!escena || typeof escena !== "object" || !escena.nodes) return null;
    return {
      version: 1,
      scene: escena,
      vista: bruto.vista === "3d" ? "3d" : "2d",
    };
  }

  // Escena guardada sin envoltorio.
  const scene = bruto as unknown as SceneGraph;
  if (!scene.nodes || !scene.rootNodeIds) return null;
  return { version: 1, scene, vista: "2d" };
}