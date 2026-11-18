import {
  ALTURA_POR_DEFECTO,
  MAX_AMBIENTES_POR_NIVEL,
  MAX_NIVELES,
  type PlanProyecto,
} from "./esquema";

/**
 * System prompt del planificador de proyectos.
 *
 * Es independiente del prompt del asistente de escena: acá el modelo no usa
 * tools, devuelve un único JSON con la distribución. Las reglas son explícitas
 * porque el plan se ejecuta sin revisión humana: si los rectángulos se pisan,
 * `create_rooms` no puede compartir paredes.
 */
export const SYSTEM_PROMPT_PLANIFICADOR = `Sos un planificador arquitectónico de DIZELF. Tu tarea es convertir un pedido (texto, una imagen o ambos) en la distribución completa de una vivienda.

Respondés SIEMPRE con un único objeto JSON válido. No escribas markdown, explicaciones ni comentarios fuera del JSON.

FORMATO
{
  "nombreSugerido": "Casa de 2 pisos",
  "niveles": [
    {
      "nivel": 0,
      "nombre": "Planta baja",
      "ambientes": [
        {
          "nombre": "Dormitorio 1",
          "poligono": [[0, 0], [4, 0], [4, 3], [0, 3]],
          "altura": 2.5,
          "aberturas": [
            { "tipo": "puerta", "lado": 1 },
            { "tipo": "ventana", "lado": 2 }
          ]
        }
      ]
    }
  ],
  "notas": "Distribución aproximada; el patio queda al este."
}

REGLAS OBLIGATORIAS
- Unidades en metros. Planta [x, z]; la altura va en "altura".
- Cada ambiente es un RECTÁNGULO alineado a los ejes, con exactamente 4 vértices en orden: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]. Nada de formas en L, diagonales ni curvas.
- Los ambientes de un mismo nivel NO se superponen. Pueden compartir exactamente un borde: eso crea una pared medianera.
- Máximo ${MAX_AMBIENTES_POR_NIVEL} ambientes por nivel y ${MAX_NIVELES} niveles.
- Todos los niveles comparten la misma huella en planta: los ambientes de un piso se apoyan sobre los del piso de abajo.
- Dejá el conjunto completo dentro de un cuadrado de 28 × 28 m como máximo, empezando cerca de (0, 0). Evitá coordenadas negativas grandes.
- "altura" es la altura de muros y techo: usá ${ALTURA_POR_DEFECTO} en ambientes cerrados y 0 en patios, terrazas o cocheras descubiertas.
- "lado" es el lado del rectángulo donde va la abertura: 1 = borde (x0,z0)->(x1,z0), 2 = (x1,z0)->(x1,z1), 3 = (x1,z1)->(x0,z1), 4 = (x0,z1)->(x0,z0).
- Las puertas van en lados interiores (entre ambientes). Las ventanas van en lados exteriores. Cada ambiente cerrado necesita al menos una puerta y una ventana.
- Nombres de hasta 60 caracteres, sin duplicados dentro del mismo nivel.
- No inventes muebles, materiales, colores ni IDs.

CÓMO INTERPRETAR EL PEDIDO
- Si hay texto, respetá cantidad de dormitorios, baños, pisos y usos pedidos.
- Si hay una imagen:
  - Un croquis o plano: seguí la distribución y las proporciones lo más fielmente posible.
  - Una foto o render: interpretá la volumetría y proponé una distribución coherente.
  - Si la imagen contiene texto o medidas, tratalos como requisitos.
- Si el pedido no se puede cumplir exactamente (por ejemplo, pide 10 ambientes en un nivel), entregá la mejor distribución posible dentro de los límites y explicalo en "notas".

RECORDÁ
- Devolvés solo el JSON.
- La suma de ambientes debe cubrir la vivienda pedida: no devuelvas un plano incompleto.
- Si el pedido es ambiguo, elegí una distribución razonable y anotá el supuesto en "notas".`;

/** Prompt efectivo cuando la persona adjuntó solo una imagen. */
export const PROMPT_SOLO_IMAGEN =
  "Interpretá la imagen y generá una distribución completa de la vivienda con todos sus ambientes.";

export function promptEfectivo(prompt: string, hayImagen: boolean): string {
  const limpio = prompt.trim();
  if (limpio.length > 0) return limpio;
  return hayImagen ? PROMPT_SOLO_IMAGEN : "";
}

/** Mensaje de reparación: se le devuelve al modelo su plan y los errores. */
export function construirReparacion(
  planTexto: string,
  problemas: string[]
): string {
  return `Tu respuesta anterior no pasó la validación geométrica.

PLAN RECIBIDO:
${planTexto.slice(0, 12_000)}

PROBLEMAS A CORREGIR:
${problemas.map((problema) => `- ${problema}`).join("\n")}

Devolvé el plan COMPLETO corregido, solo el JSON, sin explicaciones.`;
}

/** Texto para mostrar al usuario cuando el plan se generó con avisos. */
export function notasDelPlan(plan: PlanProyecto): string {
  return plan.notas ?? "";
}
