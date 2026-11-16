import { createDefaultDocument } from "@/lib/editor/default-scene";
import type { DocumentoProyecto } from "@/types/proyecto";

/**
 * Creación asistida por IA (prompt, voz o imagen).
 *
 * El backend todavía no expone un endpoint que genere una escena, así que el
 * proyecto se crea con el documento por defecto (`{ version, scene, vista }`) y
 * la petición queda guardada como marcador dentro del propio documento.
 *
 * POR QUÉ UN DOCUMENTO VÁLIDO Y NO UN OBJETO SUELTO
 * -------------------------------------------------
 * El editor y el gateway de sincronización esperan un `DocumentoProyecto`.
 * Guardar `{ estado: "pendiente-ia" }` hacía que `leerDocumento()` devolviera
 * `null` y el proyecto abriera sin escena; peor aún, el `sync:inicial` podía
 * pisar el terreno por defecto. Con el documento por defecto el plano abre
 * normal y el marcador (`ia`) se conserva para cuando se conecte la generación.
 */
export type ModoAsistido = "prompt" | "voz" | "imagen";

export interface EntradaAsistida {
  modo: ModoAsistido;
  prompt: string;
  imagenNombre?: string;
}

/** Marcador efímero: no lo interpreta el editor, solo queda registrado. */
export interface MarcadorIA {
  modo: ModoAsistido;
  prompt: string;
  imagenNombre?: string;
  estado: "pendiente-ia";
}

export type DocumentoAsistidoIA = DocumentoProyecto & { ia: MarcadorIA };

export function construirDocumentoAsistidoIA(
  entrada: EntradaAsistida
): DocumentoAsistidoIA {
  return {
    ...createDefaultDocument(),
    ia: {
      modo: entrada.modo,
      prompt: entrada.prompt,
      ...(entrada.imagenNombre ? { imagenNombre: entrada.imagenNombre } : {}),
      estado: "pendiente-ia",
    },
  };
}
