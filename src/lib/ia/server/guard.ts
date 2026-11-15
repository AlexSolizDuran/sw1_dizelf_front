import type { NextRequest } from "next/server";
import { consumirLimite, respuestaLimite } from "./limit";
import {
  leerSesion,
  respuestaErrorSesion,
  type SesionUsuario,
} from "./session";

export type ResultadoGuardia =
  | { ok: true; usuario: SesionUsuario }
  | { ok: false; respuesta: Response };

/**
 * Orden obligatorio: sesión → límite → proveedor.
 *
 * Una petición anónima nunca consume cupo ni llega al adaptador.
 */
export async function guardiaIA(
  request: NextRequest,
  ruta: string,
  opciones: { consumirLimite?: boolean } = {}
): Promise<ResultadoGuardia> {
  let usuario: SesionUsuario;
  try {
    usuario = await leerSesion(request);
  } catch (error: unknown) {
    return { ok: false, respuesta: respuestaErrorSesion(error) };
  }

  console.info(`[api/ia:${ruta}] usuario=${usuario.usuarioId}`);

  if (opciones.consumirLimite === false) {
    return { ok: true, usuario };
  }

  const limite = consumirLimite(`usuario:${usuario.usuarioId}`);
  if (!limite.permitido) {
    console.warn(
      `[api/ia:${ruta}] límite usuario=${usuario.usuarioId} motivo=${limite.motivo}`
    );
    return { ok: false, respuesta: respuestaLimite(limite) };
  }

  return { ok: true, usuario };
}
