/**
 * Estado del GLB publicado del proyecto.
 *
 * `version` es un contador que sube en cada publicación y sirve de ETag lógico:
 * si el APK tiene la v3 y el backend dice v4, su copia quedó vieja.
 */
export interface MetaModeloAr {
  hay: boolean;
  version: number;
  bytes: number;
  actualizado: string | null;
}

/** Respuesta con la URL prefirmada donde el navegador sube el GLB. */
export interface UrlModeloAr {
  url: string;
  clave: string;
  expiraEnSegundos: number;
}
