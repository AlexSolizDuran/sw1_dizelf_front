import type { NextRequest } from "next/server";
import { guardiaIA } from "@/lib/ia/server/guard";
import { chatConCadena } from "@/lib/ia/server/fallback";
import {
  calcularConsumo,
  registrarConsumoDiferido,
} from "@/lib/ia/server/consumo";
import { ErrorProveedor, sanitizarMensaje } from "@/lib/ia/server/errors";
import { normalizarTools } from "@/lib/ia/server/tools";
import { esProveedorIA, modeloPorDefecto } from "@/lib/ia/config";
import type { IAChatMessage, IAProvider } from "@/lib/ia/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function normalizarMensajes(valor: unknown): IAChatMessage[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const mensajes: IAChatMessage[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) return null;
    const crudo = item as Record<string, unknown>;
    const role = crudo.role;
    if (
      role !== "system" &&
      role !== "user" &&
      role !== "assistant" &&
      role !== "tool"
    ) {
      return null;
    }
    if (typeof crudo.content !== "string") return null;
    mensajes.push({
      role,
      content: crudo.content,
      ...(typeof crudo.name === "string" ? { name: crudo.name } : {}),
      ...(typeof crudo.tool_call_id === "string"
        ? { tool_call_id: crudo.tool_call_id }
        : {}),
      ...(Array.isArray(crudo.tool_calls)
        ? { tool_calls: crudo.tool_calls as IAChatMessage["tool_calls"] }
        : {}),
    });
  }
  return mensajes;
}

export async function POST(request: NextRequest) {
  const guardia = await guardiaIA(request, "chat");
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
  const provider: IAProvider = esProveedorIA(crudo.provider)
    ? crudo.provider
    : "hf-space";
  const model =
    typeof crudo.model === "string" && crudo.model.trim() !== ""
      ? crudo.model.trim()
      : modeloPorDefecto(provider);
  const messages = normalizarMensajes(crudo.messages);
  if (!messages) {
    return Response.json(
      { error: "Falta el campo 'messages' o tiene un formato inválido." },
      { status: 400 }
    );
  }
  const toolsNormalizadas = normalizarTools(crudo.tools);
  const tools = toolsNormalizadas.tools;

  // Respaldo semántico: el cliente puede pedir que se saltee el proveedor que
  // viene fallando con los mismos argumentos. La cadena igual conserva al
  // menos un tramo.
  const evitarProveedor = esProveedorIA(crudo.evitarProveedor)
    ? crudo.evitarProveedor
    : undefined;

  if (toolsNormalizadas.itemsBooleanos.length > 0) {
    console.warn(
      `[api/ia:chat] esquema viejo en el cliente (${toolsNormalizadas.itemsBooleanos.length} "items" booleanos: ${toolsNormalizadas.itemsBooleanos
        .slice(0, 3)
        .join(", ")}). Se normalizó en el servidor.`
    );
  }
  if (tools.length > 0) {
    console.info(
      `[api/ia:chat] tools=${tools.length}/${toolsNormalizadas.recibidas} chars=${toolsNormalizadas.caracteres} nombres=${tools
        .map((tool) => tool.function.name)
        .join(",")}`
    );
  }

  try {
    const resultado = await chatConCadena({
      provider,
      model,
      messages,
      tools,
      ...(evitarProveedor ? { evitarProveedor } : {}),
      httpReferer:
        request.headers.get("origin") ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000",
    });

    const consumo = calcularConsumo({
      respuesta: resultado.respuesta,
      mensajes: messages,
      tools,
    });
    registrarConsumoDiferido(request, {
      origen: "escena",
      proveedor: resultado.proveedorUsado,
      modelo: resultado.modeloUsado,
      ...consumo,
    });

    return Response.json({
      content: resultado.respuesta.content,
      toolCalls: resultado.respuesta.toolCalls,
      model: resultado.respuesta.model,
      proveedorUsado: resultado.proveedorUsado,
      modeloUsado: resultado.modeloUsado,
      fallbacks: resultado.fallbacks,
      finishReason: resultado.respuesta.finishReason,
      usage: resultado.respuesta.usage,
    });
  } catch (error: unknown) {
    const mensaje = sanitizarMensaje(
      error instanceof Error ? error.message : String(error)
    );
    console.error(
      `[api/ia:chat] usuario=${guardia.usuario.usuarioId}: ${mensaje}`
    );
    if (error instanceof ErrorProveedor && error.status === 429) {
      return Response.json({ error: mensaje }, { status: 429 });
    }
    return Response.json({ error: mensaje }, { status: 502 });
  }
}
