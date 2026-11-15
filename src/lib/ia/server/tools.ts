import { normalizarEsquema } from "../tools/schema";
import type { IAToolDef } from "../types";

/**
 * Normaliza las tools que llegan desde el navegador antes de reenviarlas.
 *
 * El agente corre en el cliente, así que el esquema viaja en el cuerpo del POST.
 * Una pestaña con un bundle viejo puede mandar `items: false` en una tupla y
 * romper el generador de parser de llama.cpp (HTTP 400 en `start/items`).
 * Repetir la normalización acá hace que el proveedor reciba siempre la misma
 * forma canónica, sin depender de lo que tenga cacheado el navegador.
 *
 * La validación de argumentos sigue ocurriendo en Zod al ejecutar la tool.
 */
export interface ToolsDeSolicitud {
  tools: IAToolDef[];
  /** Tools que llegaron en el cuerpo. */
  recibidas: number;
  /** Entradas descartadas por no tener forma de tool. */
  descartadas: number;
  /** Tamaño serializado de lo que se reenvía, en caracteres. */
  caracteres: number;
  /** Rutas donde apareció un `items` booleano en el esquema original. */
  itemsBooleanos: string[];
}

function buscarItemsBooleanos(valor: unknown, ruta = "$"): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((hijo, indice) =>
      buscarItemsBooleanos(hijo, `${ruta}[${indice}]`)
    );
  }
  if (typeof valor !== "object" || valor === null) return [];

  const encontrados: string[] = [];
  for (const [clave, hijo] of Object.entries(valor)) {
    if (clave === "items" && typeof hijo === "boolean") {
      encontrados.push(`${ruta}.items`);
    }
    encontrados.push(...buscarItemsBooleanos(hijo, `${ruta}.${clave}`));
  }
  return encontrados;
}

/**
 * Convierte el esquema normalizado al contrato que espera el proxy. Si el
 * navegador manda algo que no es un esquema de objeto, se cae a un objeto
 * vacío en vez de reenviar basura al proveedor.
 */
function comoEsquemaObjeto(
  valor: unknown
): IAToolDef["function"]["parameters"] {
  const normalizado = normalizarEsquema(valor ?? {});
  if (
    typeof normalizado === "object" &&
    normalizado !== null &&
    (normalizado as Record<string, unknown>).type === "object" &&
    typeof (normalizado as Record<string, unknown>).properties === "object"
  ) {
    return normalizado as IAToolDef["function"]["parameters"];
  }
  return { type: "object", properties: {} };
}

export function normalizarTools(valor: unknown): ToolsDeSolicitud {  const entradas = Array.isArray(valor) ? valor : [];
  const tools: IAToolDef[] = [];
  const itemsBooleanos: string[] = [];
  let descartadas = 0;

  for (const entrada of entradas) {
    if (typeof entrada !== "object" || entrada === null) {
      descartadas += 1;
      continue;
    }

    const fn = (entrada as Record<string, unknown>).function;
    if (typeof fn !== "object" || fn === null) {
      descartadas += 1;
      continue;
    }

    const crudo = fn as Record<string, unknown>;
    const nombre = crudo.name;
    if (typeof nombre !== "string" || nombre.trim() === "") {
      descartadas += 1;
      continue;
    }

    const parametros = crudo.parameters;
    if (parametros !== undefined) {
      itemsBooleanos.push(...buscarItemsBooleanos(parametros, `$.${nombre}`));
    }

    tools.push({
      type: "function",
      function: {
        name: nombre,
        description:
          typeof crudo.description === "string" ? crudo.description : "",
        parameters: comoEsquemaObjeto(parametros),
      },
    });
  }

  return {
    tools,
    recibidas: entradas.length,
    descartadas,
    caracteres: JSON.stringify(tools).length,
    itemsBooleanos,
  };
}
