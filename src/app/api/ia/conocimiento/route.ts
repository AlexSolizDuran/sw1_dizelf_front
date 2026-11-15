import type { NextRequest } from "next/server";
import { aFuente } from "@/lib/ia/conocimiento/contexto";
import { recuperar } from "@/lib/ia/conocimiento/recuperar";
import { HASH_TARJETAS, TARJETAS } from "@/lib/ia/conocimiento/tarjetas";
import vectores from "@/lib/ia/conocimiento/vectores.json";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CuerpoConocimiento {
  consulta: string;
  limite?: number;
}

function leerCuerpo(valor: unknown): CuerpoConocimiento | null {
  if (typeof valor !== "object" || valor === null) return null;
  const crudo = valor as Record<string, unknown>;
  if (typeof crudo.consulta !== "string") return null;
  const consulta = crudo.consulta.trim();
  if (consulta.length === 0 || consulta.length > 1200) return null;
  const limite =
    typeof crudo.limite === "number" && Number.isFinite(crudo.limite)
      ? Math.min(5, Math.max(1, Math.round(crudo.limite)))
      : 3;
  return { consulta, limite };
}

/** Metadatos del índice: sirve para confirmar que no quedó desactualizado. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      tarjetas: TARJETAS.length,
      indexado: vectores.hash === HASH_TARJETAS,
      modelo: vectores.modelo,
      revision: vectores.revision,
      dimensions: vectores.dimensions,
      hash: HASH_TARJETAS,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return Response.json(
      { error: { code: "BAD_JSON", message: "El cuerpo no es JSON válido." } },
      { status: 400 }
    );
  }

  const cuerpo = leerCuerpo(crudo);
  if (!cuerpo) {
    return Response.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Pasá { consulta: string, limite?: 1-5 }.",
        },
      },
      { status: 400 }
    );
  }

  const resultado = await recuperar(cuerpo.consulta, cuerpo.limite ?? 3);

  return Response.json(
    {
      origen: resultado.origen,
      tarjetas: resultado.tarjetas.map(aFuente),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
