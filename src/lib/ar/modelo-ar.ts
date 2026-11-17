"use client";

import { apiClient } from "@/lib/api";
import type { MetaModeloAr, UrlModeloAr } from "@/types/ar";

/** Tope de subida, igual al del backend (413 si se pasa). */
export const LIMITE_MODELO_BYTES = 25 * 1024 * 1024;

/** A partir de acá se avisa que el modelo puede costar en móvil (§5 del plan). */
export const AVISO_MODELO_BYTES = 8 * 1024 * 1024;

/**
 * Pide al backend una URL prefirmada para subir el GLB.
 *
 * La petición va por el proxy same-origin (cookie httpOnly), pero los bytes no:
 * el proxy de Vercel corta los cuerpos grandes y un GLB de 15 MB no pasa.
 */
export function apiUrlSubidaModelo(proyectoId: string): Promise<UrlModeloAr> {
  return apiClient<UrlModeloAr>(`/proyectos/${proyectoId}/modelo/url`, {
    method: "POST",
  });
}

/**
 * Confirma la subida. El backend mide el objeto con `HeadObject` y decide la
 * versión; `bytes` es solo informativo y se manda si el servidor lo pide.
 */
export function apiConfirmarModelo(
  proyectoId: string,
  clave: string,
  bytes: number
): Promise<MetaModeloAr> {
  return apiClient<MetaModeloAr>(`/proyectos/${proyectoId}/modelo`, {
    method: "POST",
    body: JSON.stringify({ clave, bytes }),
  });
}

/** Metadatos del GLB vigente. */
export function apiMetaModelo(proyectoId: string): Promise<MetaModeloAr> {
  return apiClient<MetaModeloAr>(`/proyectos/${proyectoId}/modelo/meta`);
}

/**
 * Sube el GLB a la URL prefirmada del bucket.
 *
 * Va con `XMLHttpRequest` y no con `fetch` por una razón concreta: `fetch` no
 * informa progreso de subida y en un archivo de 20 MB el usuario necesita ver
 * que algo está pasando. No usa `apiClient` porque la URL es de otro host, no
 * lleva cookie de sesión y su `Content-Type` fijo rompería el PUT.
 */
export function subirGlbConProgreso(
  url: string,
  glb: Blob,
  alProgresar: (fraccion: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const peticion = new XMLHttpRequest();
    peticion.open("PUT", url);
    peticion.setRequestHeader("Content-Type", "model/gltf-binary");
    // 25 MB por 3G pueden tardar: el corte es por inactividad, no por tamaño.
    peticion.timeout = 180_000;

    peticion.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) {
        alProgresar(evento.loaded / evento.total);
      }
    };

    peticion.onload = () => {
      if (peticion.status >= 200 && peticion.status < 300) {
        alProgresar(1);
        resolve();
        return;
      }
      reject(
        new Error(
          `El almacenamiento rechazó la subida (${peticion.status}). Volvé a intentar.`
        )
      );
    };

    peticion.onerror = () =>
      reject(
        new Error(
          "No se pudo conectar con el almacenamiento del modelo. Revisá tu conexión."
        )
      );

    peticion.ontimeout = () =>
      reject(new Error("La subida tardó demasiado y se canceló."));

    peticion.send(glb);
  });
}
