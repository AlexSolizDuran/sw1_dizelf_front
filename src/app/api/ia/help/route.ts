import type { NextRequest } from "next/server";
import { guardiaIA } from "@/lib/ia/server/guard";
import { chatConCadena } from "@/lib/ia/server/fallback";
import {
  calcularConsumo,
  registrarConsumoDiferido,
} from "@/lib/ia/server/consumo";
import { ErrorProveedor, sanitizarMensaje } from "@/lib/ia/server/errors";
import { buildHelpSystemPrompt, esPregunta, parseHelpJson, type HelpProjectItem } from "@/lib/ia/helpPrompt";
import { searchHelp } from "@/lib/ayuda/knowledge";
import { IA_DEFAULT_PROVIDER, modeloPorDefecto } from "@/lib/ia/config";
import type { IAChatMessage } from "@/lib/ia/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MENSAJES = 12;
const MAX_CARACTERES = 2000;
const MAX_PROYECTOS = 60;

function normalizarMensajes(valor: unknown): IAChatMessage[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const mensajes: IAChatMessage[] = [];
  for (const item of valor.slice(-MAX_MENSAJES)) {
    if (typeof item !== "object" || item === null) return null;
    const crudo = item as Record<string, unknown>;
    if (crudo.role !== "user" && crudo.role !== "assistant") return null;
    if (typeof crudo.content !== "string") return null;
    const contenido = crudo.content.trim().slice(0, MAX_CARACTERES);
    if (contenido === "") continue;
    mensajes.push({ role: crudo.role, content: contenido });
  }
  return mensajes.length > 0 ? mensajes : null;
}

function normalizarProyectos(valor: unknown): HelpProjectItem[] {
  if (!Array.isArray(valor)) return [];
  const proyectos: HelpProjectItem[] = [];
  for (const item of valor.slice(0, MAX_PROYECTOS)) {
    if (typeof item !== "object" || item === null) continue;
    const crudo = item as Record<string, unknown>;
    const id =
      typeof crudo.proyectoId === "string"
        ? crudo.proyectoId.trim()
        : typeof crudo.proyectoId === "number"
          ? String(crudo.proyectoId)
          : "";
    if (id === "" || typeof crudo.nombre !== "string") continue;
    const nombre = crudo.nombre.trim().slice(0, 120);
    if (nombre === "") continue;
    proyectos.push({
      proyectoId: id,
      nombre,
      ...(typeof crudo.miRol === "string" ? { miRol: crudo.miRol.slice(0, 20) } : {}),
    });
  }
  return proyectos;
}

/**
 * Chat de ayuda: explica la aplicación y ejecuta solo acciones de gestión
 * (crear/abrir proyecto, ir a Mis Proyectos, invitar colaborador).
 *
 * No recibe ni devuelve contexto de la escena, y no usa `agentLoop` ni las
 * herramientas del editor. La lista de herramientas vive en `HelpToolName`;
 * cualquier nombre fuera de esa lista se degrada a `explicar`.
 */
export async function POST(request: NextRequest) {
  const guardia = await guardiaIA(request, "help");
  if (!guardia.ok) return guardia.respuesta;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const crudo = (typeof body === "object" && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  const messages = normalizarMensajes(crudo.messages);
  if (!messages) {
    return Response.json(
      { error: "Falta el campo 'messages' o tiene un formato inválido." },
      { status: 400 }
    );
  }

  const proyectos = normalizarProyectos(crudo.projects);
  const pagina =
    typeof crudo.pagina === "string" ? crudo.pagina.trim().slice(0, 200) : "/proyectos";

  const systemPrompt = buildHelpSystemPrompt(proyectos, pagina);
  const mensajesConSistema: IAChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  try {
    const resultado = await chatConCadena({
      provider: IA_DEFAULT_PROVIDER,
      model: modeloPorDefecto(IA_DEFAULT_PROVIDER),
      messages: mensajesConSistema,
      tools: [],
      httpReferer:
        request.headers.get("origin") ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000",
    });

    const consumo = calcularConsumo({
      respuesta: resultado.respuesta,
      mensajes: mensajesConSistema,
      tools: [],
    });
    registrarConsumoDiferido(request, {
      origen: "ayuda",
      proveedor: resultado.proveedorUsado,
      modelo: resultado.modeloUsado,
      ...consumo,
    });

    const parsed = parseHelpJson(resultado.respuesta.content);

    /**
     * Defensa en el servidor: una pregunta nunca ejecuta una acción. El modelo
     * chico a veces confunde "¿cómo creo un proyecto?" con una orden; en ese
     * caso se degrada a explicación con la base local.
     */
    const ultimoUsuario =
      [...messages].reverse().find((mensaje) => mensaje.role === "user")?.content ?? "";
    let respuesta = parsed;
    if (esPregunta(ultimoUsuario) && parsed.tool !== "explicar") {
      const local = searchHelp(ultimoUsuario, 3);
      respuesta = {
        tool: "explicar",
        args: {},
        text: local[0]?.respuesta ?? parsed.text,
        projectId: null,
        helpIds: local.map((entrada) => entrada.id),
      };
    }

    return Response.json({
      ...respuesta,
      proveedorUsado: resultado.proveedorUsado,
      modeloUsado: resultado.modeloUsado,
      fallbacks: resultado.fallbacks,
      usage: resultado.respuesta.usage,
    });
  } catch (error: unknown) {
    const mensaje = sanitizarMensaje(
      error instanceof Error ? error.message : String(error)
    );
    console.error(
      `[api/ia:help] usuario=${guardia.usuario.usuarioId}: ${mensaje}`
    );
    if (error instanceof ErrorProveedor && error.status === 429) {
      return Response.json({ error: mensaje }, { status: 429 });
    }
    return Response.json({ error: mensaje }, { status: 502 });
  }
}
