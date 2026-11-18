import type { NextRequest } from "next/server";
import { guardiaIA } from "@/lib/ia/server/guard";
import {
  perfilesDisponibles,
  perfilPorDefecto,
  preciosOpenRouter,
} from "@/lib/ia/proyecto/modelos";

export const runtime = "nodejs";

/**
 * Perfiles de modelo disponibles para generar proyectos.
 *
 * Devuelve el perfil, el modelo configurado y (si OpenRouter responde) los
 * precios actuales. El navegador solo usa `id`; nunca manda un ID de modelo.
 */
export async function GET(request: NextRequest) {
  const guardia = await guardiaIA(request, "proyecto-modelos", {
    consumirLimite: false,
  });
  if (!guardia.ok) return guardia.respuesta;

  const precios = await preciosOpenRouter();
  return Response.json({
    proveedor: "openrouter",
    defecto: perfilPorDefecto(),
    perfiles: perfilesDisponibles(precios),
  });
}
