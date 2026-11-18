"use client";

import type { PlanProyecto } from "./esquema";

/**
 * Puente cliente → editor para la generación asistida.
 *
 * El modal pide el plan, crea el proyecto y deja el plan en `sessionStorage`.
 * El runner del editor lo consume y lo borra **antes** de ejecutar las tools,
 * así una recarga a mitad de la generación no duplica la casa.
 */

export const CLAVE_PLAN = (proyectoId: string) =>
  `dizelf:ia:proyecto:${proyectoId}`;

export interface PerfilProyectoInfo {
  id: string;
  nombre: string;
  descripcion: string;
  modelo: string;
  soportaImagen: boolean;
  precioEntradaUsdMillon: number | null;
  precioSalidaUsdMillon: number | null;
}

export interface PerfilesProyectoRespuesta {
  proveedor: string;
  defecto: string;
  perfiles: PerfilProyectoInfo[];
}

export interface PlanGenerado {
  plan: PlanProyecto;
  perfil: string;
  modelo: string;
  proveedor: string;
  avisos: string[];
  tokens: { entrada: number; salida: number };
}

export interface PlanEnEspera {
  plan: PlanProyecto;
  prompt: string;
  perfil: string;
  modelo: string;
}

export class ErrorPlan extends Error {
  readonly problemas: string[];
  readonly status: number;

  constructor(mensaje: string, status: number, problemas: string[] = []) {
    super(mensaje);
    this.name = "ErrorPlan";
    this.status = status;
    this.problemas = problemas;
  }
}

interface RespuestaError {
  error?: string;
  problemas?: string[];
}

export async function cargarPerfilesProyecto(): Promise<PerfilesProyectoRespuesta> {
  const res = await fetch("/api/ia/proyecto/modelos", {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error("No se pudieron cargar los perfiles de IA.");
  }
  return (await res.json()) as PerfilesProyectoRespuesta;
}

export async function solicitarPlanProyecto(input: {
  prompt: string;
  perfil: string;
  imagen: File | null;
}): Promise<PlanGenerado> {
  const formulario = new FormData();
  formulario.append("prompt", input.prompt);
  formulario.append("perfil", input.perfil);
  if (input.imagen !== null) {
    formulario.append("imagen", input.imagen, input.imagen.name);
  }

  const res = await fetch("/api/ia/proyecto", {
    method: "POST",
    body: formulario,
    credentials: "same-origin",
  });

  const datos = (await res.json().catch(() => null)) as
    | (PlanGenerado & RespuestaError)
    | (RespuestaError & { plan?: undefined })
    | null;

  if (!res.ok || datos === null || datos.plan === undefined) {
    const mensaje =
      datos && typeof datos.error === "string"
        ? datos.error
        : "No se pudo generar el diseño. Intentá de nuevo.";
    throw new ErrorPlan(
      mensaje,
      res.status,
      Array.isArray(datos?.problemas) ? datos.problemas : []
    );
  }

  return datos as PlanGenerado;
}

export function guardarPlanEnEspera(
  proyectoId: string,
  datos: PlanEnEspera
): void {
  try {
    sessionStorage.setItem(CLAVE_PLAN(proyectoId), JSON.stringify(datos));
  } catch {
    // Sin sessionStorage el editor abre con la escena por defecto.
  }
}

/** Lee y borra el plan. Nunca devuelve el mismo plan dos veces. */
export function tomarPlanEnEspera(proyectoId: string): PlanEnEspera | null {
  const clave = CLAVE_PLAN(proyectoId);
  let crudo: string | null = null;
  try {
    crudo = sessionStorage.getItem(clave);
    sessionStorage.removeItem(clave);
  } catch {
    return null;
  }
  if (!crudo) return null;

  try {
    const datos = JSON.parse(crudo) as PlanEnEspera;
    if (!datos || !datos.plan || !Array.isArray(datos.plan.niveles)) return null;
    return datos;
  } catch {
    return null;
  }
}

const LADO_MAXIMO_PX = 1_600;
const PESO_SIN_COMPRIMIR = 1_500_000;
const LADO_SIN_COMPRIMIR = 2_000;

function cargarImagen(archivo: File): Promise<{
  ancho: number;
  alto: number;
  fuente: CanvasImageSource;
  liberar: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(archivo).then((bitmap) => ({
      ancho: bitmap.width,
      alto: bitmap.height,
      fuente: bitmap,
      liberar: () => bitmap.close(),
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      resolve({
        ancho: imagen.naturalWidth,
        alto: imagen.naturalHeight,
        fuente: imagen,
        liberar: () => URL.revokeObjectURL(url),
      });
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    imagen.src = url;
  });
}

/**
 * Comprime la imagen antes de subirla.
 *
 * Una foto de celular de 8 MB cuesta tokens y tiempo. Con 1.600 px de lado
 * alcanza para leer un croquis y la entrada ronda 1.000–2.000 tokens.
 */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  let cargada: Awaited<ReturnType<typeof cargarImagen>>;
  try {
    cargada = await cargarImagen(archivo);
  } catch {
    return archivo;
  }

  const mayor = Math.max(cargada.ancho, cargada.alto);
  if (archivo.size <= PESO_SIN_COMPRIMIR && mayor <= LADO_SIN_COMPRIMIR) {
    cargada.liberar();
    return archivo;
  }

  const escala = Math.min(1, LADO_MAXIMO_PX / mayor);
  const ancho = Math.max(1, Math.round(cargada.ancho * escala));
  const alto = Math.max(1, Math.round(cargada.alto * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const contexto = canvas.getContext("2d");
  if (contexto === null) {
    cargada.liberar();
    return archivo;
  }

  contexto.drawImage(cargada.fuente, 0, 0, ancho, alto);
  cargada.liberar();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((salida) => resolve(salida), "image/jpeg", 0.82);
  });
  if (blob === null) return archivo;

  const nombre = archivo.name.replace(/\.[^.]+$/, "") || "imagen";
  return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
}
