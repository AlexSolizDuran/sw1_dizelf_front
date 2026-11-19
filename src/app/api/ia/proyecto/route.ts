import type { NextRequest } from "next/server";
import { guardiaIA } from "@/lib/ia/server/guard";
import { registrarConsumoDiferido } from "@/lib/ia/server/consumo";
import { ErrorProveedor, sanitizarMensaje } from "@/lib/ia/server/errors";
import {
  describirIssues,
  extraerJson,
  planProyectoSchema,
  type PlanProyecto,
} from "@/lib/ia/proyecto/esquema";
import {
  ajustarCantidadNiveles,
  normalizarPlan,
} from "@/lib/ia/proyecto/geometria";
import {
  cadenaDePerfiles,
  esPerfilProyecto,
  modeloDePerfil,
  perfilPorDefecto,
  type PerfilProyecto,
} from "@/lib/ia/proyecto/modelos";
import {
  llamarPlanificador,
  type RespuestaPlan,
} from "@/lib/ia/proyecto/openrouter";
import { nivelesSegunTexto, promptEfectivo } from "@/lib/ia/proyecto/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PROMPT = 4_000;
const MAX_IMAGEN_BYTES = 2_500_000;
const TIPOS_IMAGEN = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function errorJson(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status });
}

function esArchivo(valor: FormDataEntryValue | null): valor is File {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as File).arrayBuffer === "function" &&
    typeof (valor as File).size === "number"
  );
}

type Interpretacion =
  | { ok: true; plan: PlanProyecto; avisos: string[] }
  | { ok: false; problemas: string[] };

interface ContextoPlan {
  /** Con imagen, la cantidad de niveles la define lo que muestra. */
  hayImagen: boolean;
  /** Sin imagen, la cantidad pedida en el texto (1 si no se menciona). */
  nivelesTexto: number;
}

/**
 * Convierte la respuesta del modelo en un plan confiable.
 *
 * La cantidad de niveles no se acepta como venga: el modelo la declara en
 * `cantidadNiveles` (contando la imagen) y acá se exige que `niveles` tenga
 * exactamente esa cantidad. Si sobran se recortan; si faltan se pide una
 * reparación. Así una foto de una sola planta no termina con dos pisos.
 */
function interpretar(texto: string, contexto: ContextoPlan): Interpretacion {
  const crudo = extraerJson(texto);
  if (crudo === null) {
    return {
      ok: false,
      problemas: ["La respuesta no contiene un objeto JSON válido."],
    };
  }

  const validado = planProyectoSchema.safeParse(crudo);
  if (!validado.success) {
    return {
      ok: false,
      problemas: describirIssues(validado.error.issues),
    };
  }

  const normalizado = normalizarPlan(validado.data);
  if (!normalizado.ok) {
    return { ok: false, problemas: normalizado.problemas };
  }

  const esperado = contexto.hayImagen
    ? validado.data.cantidadNiveles
    : contexto.nivelesTexto;

  if (esperado === undefined) {
    return {
      ok: false,
      problemas: [
        "Falta 'cantidadNiveles'. Contá las plantas que se ven en la imagen y poné ese número (1, 2 o 3).",
      ],
    };
  }

  const ajuste = ajustarCantidadNiveles(
    normalizado.plan,
    esperado,
    contexto.hayImagen
  );
  if (!ajuste.ok) return ajuste;

  return {
    ok: true,
    plan: ajuste.plan,
    avisos: ajuste.aviso
      ? [...normalizado.avisos, ajuste.aviso]
      : normalizado.avisos,
  };
}

interface ConsumoLlamada {
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
}

function anotarConsumo(
  registro: ConsumoLlamada[],
  respuesta: RespuestaPlan
): void {
  registro.push({
    modelo: respuesta.modelo,
    tokensEntrada: respuesta.tokensEntrada,
    tokensSalida: respuesta.tokensSalida,
  });
}

function statusDeError(motivo: ErrorProveedor["motivo"]): number {
  if (motivo === "429") return 429;
  return 502;
}

export async function POST(request: NextRequest) {
  const guardia = await guardiaIA(request, "proyecto");
  if (!guardia.ok) return guardia.respuesta;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return errorJson(
      "La generación debe enviarse como multipart/form-data.",
      415
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_IMAGEN_BYTES + 256 * 1024
  ) {
    return errorJson(
      "La imagen es demasiado grande. Máximo 2,5 MB después de comprimirla.",
      413
    );
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return errorJson("No se pudo leer el formulario.", 400);
  }

  const prompt = String(formulario.get("prompt") ?? "").trim();
  if (prompt.length > MAX_PROMPT) {
    return errorJson(
      `El prompt no puede superar ${MAX_PROMPT} caracteres.`,
      400
    );
  }

  const archivo = formulario.get("imagen");
  const imagen = esArchivo(archivo) && archivo.size > 0 ? archivo : null;

  if (prompt.length === 0 && imagen === null) {
    return errorJson(
      "Escribí una descripción o adjuntá una imagen para generar el diseño.",
      400
    );
  }

  if (imagen !== null) {
    if (imagen.size > MAX_IMAGEN_BYTES) {
      return errorJson(
        "La imagen es demasiado grande. Máximo 2,5 MB después de comprimirla.",
        413
      );
    }
    if (!TIPOS_IMAGEN.has(imagen.type.toLowerCase())) {
      return errorJson(
        "La imagen debe ser JPEG, PNG o WebP.",
        415
      );
    }
  }

  const perfilCrudo = String(formulario.get("perfil") ?? "").trim();
  if (perfilCrudo !== "" && !esPerfilProyecto(perfilCrudo)) {
    return errorJson("El perfil de modelo no es válido.", 400);
  }
  const perfil: PerfilProyecto = esPerfilProyecto(perfilCrudo)
    ? perfilCrudo
    : perfilPorDefecto();

  const texto = promptEfectivo(prompt, imagen !== null);

  // La imagen define la cantidad de niveles; el texto solo se usa cuando no
  // hay imagen. Se calcula una vez y se reutiliza en primera y reparación.
  const contexto: ContextoPlan = {
    hayImagen: imagen !== null,
    nivelesTexto: nivelesSegunTexto(prompt),
  };

  let imagenDataUrl: string | undefined;
  if (imagen !== null) {
    try {
      const base64 = Buffer.from(await imagen.arrayBuffer()).toString("base64");
      imagenDataUrl = `data:${imagen.type.toLowerCase()};base64,${base64}`;
    } catch {
      return errorJson("No se pudo leer la imagen enviada.", 400);
    }
  }

  const consumos: ConsumoLlamada[] = [];
  let ultimoError: ErrorProveedor | null = null;
  let planValido: {
    plan: PlanProyecto;
    perfil: PerfilProyecto;
    modelo: string;
    avisos: string[];
  } | null = null;
  let planInvalido: { problemas: string[] } | null = null;

  for (const perfilCandidato of cadenaDePerfiles(perfil)) {
    const modelo = modeloDePerfil(perfilCandidato);

    let primera: RespuestaPlan;
    try {
      primera = await llamarPlanificador({ modelo, prompt: texto, imagenDataUrl });
    } catch (error: unknown) {
      if (!(error instanceof ErrorProveedor)) throw error;
      ultimoError = error;
      console.warn(
        `[api/ia:proyecto] perfil=${perfilCandidato} modelo=${modelo} motivo=${error.motivo}`
      );
      // Solo se baja de perfil ante problemas del proveedor. Un 4xx de
      // configuración (clave, modelo inexistente) no mejora con otro modelo.
      if (error.motivo === "429" || error.motivo === "5xx" || error.motivo === "timeout" || error.motivo === "red") {
        continue;
      }
      break;
    }
    anotarConsumo(consumos, primera);
    let modeloUsado = primera.modelo ?? modelo;

    let interpretado = interpretar(primera.texto, contexto);

    if (!interpretado.ok) {
      // Una única reparación con los errores concretos.
      try {
        const reparado = await llamarPlanificador({
          modelo,
          prompt: texto,
          imagenDataUrl,
          reparacion: {
            textoPrevio: primera.texto,
            problemas: interpretado.problemas,
          },
        });
        anotarConsumo(consumos, reparado);
        modeloUsado = reparado.modelo ?? modelo;
        interpretado = interpretar(reparado.texto, contexto);
        if (!interpretado.ok) {
          planInvalido = { problemas: interpretado.problemas };
          break;
        }
      } catch (error: unknown) {
        if (!(error instanceof ErrorProveedor)) throw error;
        ultimoError = error;
        if (
          error.motivo === "429" ||
          error.motivo === "5xx" ||
          error.motivo === "timeout" ||
          error.motivo === "red"
        ) {
          // El proveedor se cayó durante la reparación: probar el perfil más
          // barato en vez de devolver un 422 que no explica nada.
          continue;
        }
        planInvalido = {
          problemas: [
            `No se pudo reparar el plan: ${sanitizarMensaje(error.message)}`,
          ],
        };
        break;
      }
    }

    planValido = {
      plan: interpretado.plan,
      perfil: perfilCandidato,
      modelo: modeloUsado,
      avisos: interpretado.avisos,
    };
    break;
  }

  // El gasto ya ocurrió aunque la respuesta sea un error: se registra igual.
  for (const consumo of consumos) {
    registrarConsumoDiferido(request, {
      origen: "proyecto",
      proveedor: "openrouter",
      modelo: consumo.modelo,
      tokensEntrada: consumo.tokensEntrada,
      tokensSalida: consumo.tokensSalida,
    });
  }

  if (planValido === null) {
    if (planInvalido !== null) {
      return Response.json(
        {
          error:
            "El modelo no devolvió una distribución válida. Probá de nuevo o cambiá de perfil.",
          problemas: planInvalido.problemas.slice(0, 8),
        },
        { status: 422 }
      );
    }

    const mensaje = ultimoError
      ? sanitizarMensaje(ultimoError.message)
      : "No se pudo generar el plan.";
    const status = ultimoError ? statusDeError(ultimoError.motivo) : 502;

    return Response.json(
      {
        error:
          perfil === "gratuito"
            ? `El perfil gratuito no respondió. Probá de nuevo o elegí otro perfil. Detalle: ${mensaje}`
            : `No se pudo generar el plan. Detalle: ${mensaje}`,
        motivo: ultimoError?.motivo ?? "proveedor",
      },
      { status }
    );
  }

  return Response.json({
    plan: planValido.plan,
    perfil: planValido.perfil,
    modelo: planValido.modelo,
    proveedor: "openrouter",
    avisos: planValido.avisos,
    tokens: {
      entrada: consumos.reduce((total, item) => total + item.tokensEntrada, 0),
      salida: consumos.reduce((total, item) => total + item.tokensSalida, 0),
    },
  });
}
