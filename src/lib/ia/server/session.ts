import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Guardia de sesión del proxy de IA.
 *
 * El backend Nest sigue siendo la única fuente de identidad: se toma la cookie
 * `tokenAcceso` (o la legada `access_token`) y se consulta `GET /auth/perfil`.
 * La respuesta se cachea 60 s con clave `sha256(token)` para no sumar un round
 * trip por cada ronda de herramientas.
 */

export const COOKIE_SESION = "tokenAcceso";
const COOKIE_LEGADA = "access_token";
export const SESION_TIMEOUT_MS = 4000;
export const SESION_TTL_MS = 60_000;
const SESION_MAX_ENTRADAS = 500;

export interface SesionUsuario {
  usuarioId: number;
  nombre: string;
}

export type MotivoErrorSesion =
  | "sin-sesion"
  | "sesion-invalida"
  | "servicio-no-disponible";

export class ErrorSesion extends Error {
  readonly status: 401 | 503;

  constructor(
    readonly motivo: MotivoErrorSesion,
    mensaje: string
  ) {
    super(mensaje);
    this.name = "ErrorSesion";
    this.status = motivo === "servicio-no-disponible" ? 503 : 401;
  }
}

interface EntradaSesion {
  usuario: SesionUsuario;
  expiraEn: number;
}

const cache = new Map<string, EntradaSesion>();

function claveSesion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function baseUrlBackend(): string {
  const candidatas = [
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
  ]
    .map((valor) => valor?.trim())
    .filter(
      (valor): valor is string =>
        typeof valor === "string" && /^https?:\/\//i.test(valor)
    );
  return (candidatas[0] ?? "http://localhost:3001").replace(/\/+$/, "");
}

function leerToken(request: Pick<NextRequest, "cookies">): string | null {
  const seguro = request.cookies?.get?.(COOKIE_SESION)?.value?.trim();
  if (seguro) return seguro;
  const legado = request.cookies?.get?.(COOKIE_LEGADA)?.value?.trim();
  return legado ? legado : null;
}

function normalizarUsuario(datos: unknown): SesionUsuario | null {
  if (typeof datos !== "object" || datos === null) return null;
  const crudo = datos as Record<string, unknown>;
  const usuarioId = Number(crudo.id ?? crudo.usuarioId);
  if (!Number.isFinite(usuarioId)) return null;

  const persona =
    typeof crudo.persona === "object" && crudo.persona !== null
      ? (crudo.persona as Record<string, unknown>)
      : null;
  const nombre =
    [persona?.nombre, persona?.apellido]
      .filter(
        (parte): parte is string =>
          typeof parte === "string" && parte.trim() !== ""
      )
      .join(" ")
      .trim() ||
    (typeof crudo.username === "string" ? crudo.username.trim() : "") ||
    `Usuario ${usuarioId}`;

  return { usuarioId, nombre };
}

function guardarEnCache(clave: string, usuario: SesionUsuario): void {
  while (cache.size >= SESION_MAX_ENTRADAS && !cache.has(clave)) {
    const primera = cache.keys().next().value;
    if (primera === undefined) break;
    cache.delete(primera);
  }
  cache.set(clave, { usuario, expiraEn: Date.now() + SESION_TTL_MS });
}

export async function leerSesion(
  request: Pick<NextRequest, "cookies">
): Promise<SesionUsuario> {
  const token = leerToken(request);
  if (!token) {
    throw new ErrorSesion("sin-sesion", "Iniciá sesión para usar el asistente.");
  }

  const clave = claveSesion(token);
  const cacheada = cache.get(clave);
  if (cacheada && cacheada.expiraEn > Date.now()) return cacheada.usuario;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESION_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrlBackend()}/auth/perfil`, {
      method: "GET",
      headers: {
        cookie: `${COOKIE_SESION}=${token}`,
        accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new ErrorSesion(
      "servicio-no-disponible",
      "No se pudo validar la sesión con el backend. Intentá de nuevo en unos segundos."
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    cache.delete(clave);
    throw new ErrorSesion("sesion-invalida", "Tu sesión venció. Volvé a iniciar sesión.");
  }
  if (!res.ok) {
    throw new ErrorSesion(
      "servicio-no-disponible",
      "El servicio de autenticación no está disponible."
    );
  }

  let datos: unknown;
  try {
    datos = await res.json();
  } catch {
    throw new ErrorSesion(
      "servicio-no-disponible",
      "El servicio de autenticación devolvió una respuesta inválida."
    );
  }

  const usuario = normalizarUsuario(datos);
  if (!usuario) {
    throw new ErrorSesion(
      "servicio-no-disponible",
      "El servicio de autenticación devolvió una respuesta inválida."
    );
  }

  guardarEnCache(clave, usuario);
  return usuario;
}

export function respuestaErrorSesion(error: unknown): Response {
  if (error instanceof ErrorSesion) {
    return Response.json(
      { error: error.message, motivo: error.motivo },
      { status: error.status }
    );
  }
  return Response.json(
    { error: "No se pudo validar la sesión.", motivo: "servicio-no-disponible" },
    { status: 503 }
  );
}
