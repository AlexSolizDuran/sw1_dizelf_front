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
 *
 * La cantidad de niveles la define la imagen cuando existe. El modelo la
 * declara en `cantidadNiveles` y el endpoint la hace cumplir, porque las
 * instrucciones por sí solas no alcanzan: el ejemplo de un solo nivel y las
 * reglas de "hasta 3 niveles" igual lo llevaban a inventar una segunda planta.
 */
export const SYSTEM_PROMPT_PLANIFICADOR = `Sos un planificador arquitectónico de DIZELF. Tu tarea es convertir un pedido (texto, una imagen o ambos) en la distribución completa de una vivienda.

Respondés SIEMPRE con un único objeto JSON válido. No escribas markdown, explicaciones ni comentarios fuera del JSON.

FORMATO
{
  "nombreSugerido": "Departamento de un dormitorio",
  "cantidadNiveles": 1,
  "niveles": [
    {
      "nivel": 0,
      "nombre": "Planta única",
      "ambientes": [
        {
          "nombre": "Living-comedor",
          "poligono": [[0, 0], [8, 0], [8, 4], [0, 4]],
          "altura": 2.5,
          "aberturas": [
            { "tipo": "puerta", "lado": 1 },
            { "tipo": "ventana", "lado": 4 }
          ]
        },
        {
          "nombre": "Dormitorio",
          "poligono": [[0, 4], [4, 4], [4, 8], [0, 8]],
          "altura": 2.5,
          "aberturas": [
            { "tipo": "puerta", "lado": 1 },
            { "tipo": "ventana", "lado": 3 }
          ]
        }
      ]
    }
  ],
  "notas": "Distribución aproximada según el pedido."
}

REGLAS OBLIGATORIAS
- Unidades en metros. Planta [x, z]; la altura va en "altura".
- Cada ambiente es un RECTÁNGULO alineado a los ejes, con exactamente 4 vértices en orden: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]. Nada de formas en L, diagonales ni curvas.
- Los ambientes de un mismo nivel NO se superponen. Pueden compartir exactamente un borde: eso crea una pared medianera.
- Máximo ${MAX_AMBIENTES_POR_NIVEL} ambientes por nivel y ${MAX_NIVELES} niveles.
- Dejá el conjunto completo dentro de un cuadrado de 28 × 28 m como máximo, empezando cerca de (0, 0). Evitá coordenadas negativas grandes.
- "altura" es la altura de muros y techo: usá ${ALTURA_POR_DEFECTO} en ambientes cerrados y 0 en patios, terrazas o cocheras descubiertas.
- "lado" es el lado del rectángulo donde va la abertura: 1 = borde (x0,z0)->(x1,z0), 2 = (x1,z0)->(x1,z1), 3 = (x1,z1)->(x0,z1), 4 = (x0,z1)->(x0,z0).
- Las puertas van en lados interiores (entre ambientes). Las ventanas van en lados exteriores. Cada ambiente cerrado necesita al menos una puerta y una ventana.
- Nombres de hasta 60 caracteres, sin duplicados dentro del mismo nivel.
- No inventes muebles, materiales, colores ni IDs.

NIVELES (REGLA CRÍTICA)
- "cantidadNiveles" es la cantidad de plantas que se van a generar y debe coincidir EXACTAMENTE con la cantidad de objetos dentro de "niveles".
- Si hay imagen, la imagen manda: contá las plantas o pisos que se ven y usá ese número. Si la imagen muestra una sola planta, "cantidadNiveles" es 1 y "niveles" tiene un solo objeto. Si muestra dos o tres, generá esas dos o tres.
- Cuando hay imagen, el texto NO cambia la cantidad de niveles: sirve para ambientes, usos y medidas, no para agregar pisos.
- Si no hay imagen, usá la cantidad que pida el texto. Si el texto no menciona pisos ni niveles, usá 1.
- No agregues plantas, entrepisos ni sótanos que no estén en la imagen. Tampoco recortes plantas que la imagen sí muestra.
- "nombreSugerido" debe describir lo generado (por ejemplo, "Departamento de un dormitorio" o "Casa de 2 pisos"). No digas "2 pisos" si el plan tiene uno.
- Solo si hay más de un nivel: todos comparten la misma huella en planta, los ambientes de un piso se apoyan sobre los del piso de abajo.

CÓMO INTERPRETAR EL PEDIDO
- Si hay texto, respetá cantidad de dormitorios, baños y usos pedidos. Si además hay imagen, la cantidad de niveles la define la imagen.
- Si hay una imagen:
  - Contá primero las plantas o pisos que se ven y poné ese número en "cantidadNiveles": puede ser 1, 2 o 3.
  - Un croquis o plano de una sola planta: un único nivel.
  - Un croquis o plano con varias plantas dibujadas: un nivel por cada planta, en orden.
  - Una vista 3D en corte o un render: contá los pisos visibles; no agregues ni quites.
  - Una foto: interpretá la planta visible y no agregues ambientes que no se vean.
  - No inventes ambientes que no aparezcan en la imagen.
  - Si dos usos comparten el espacio (cocina-comedor, living-estar), usá UN solo rectángulo con nombre compuesto; no los separes en ambientes distintos.
  - Conservá la posición relativa de cada ambiente (izquierda/derecha/arriba/abajo).
  - Si la imagen contiene texto o medidas, tratalos como requisitos.
- Si el pedido no se puede cumplir exactamente (por ejemplo, pide 10 ambientes en un nivel), entregá la mejor distribución posible dentro de los límites y explicalo en "notas".

RECORDÁ
- Devolvés solo el JSON.
- "cantidadNiveles" y la cantidad de objetos de "niveles" tienen que coincidir siempre.
- La distribución debe cubrir la vivienda pedida, pero sin agregar ambientes ni niveles que no estén en la imagen o el pedido.
- Si el pedido es ambiguo, elegí una distribución razonable y anotá el supuesto en "notas".`;

/** Prompt efectivo cuando la persona adjuntó solo una imagen. */
export const PROMPT_SOLO_IMAGEN =
  "Interpretá la imagen y generá la distribución con los ambientes que se ven. Contá las plantas o pisos visibles y poné ese número en cantidadNiveles. No inventes ambientes ni niveles que no aparezcan en la imagen.";

/** Números admitidos en el pedido, para deducir niveles sin imagen. */
const NUMEROS_TEXTO: Record<string, number> = {
  "1": 1,
  un: 1,
  uno: 1,
  una: 1,
  "2": 2,
  dos: 2,
  "3": 3,
  tres: 3,
};

/** Normaliza acentos y mayúsculas para comparar el pedido. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Cantidad de niveles que pide el texto.
 *
 * Solo se usa cuando **no hay imagen**: si hay imagen, manda lo que muestra.
 * Ante la duda devuelve 1, que es más seguro que inventar una segunda planta.
 */
export function nivelesSegunTexto(prompt: string): number {
  const texto = normalizarTexto(prompt);

  // "planta baja" y "planta alta" juntas describen dos niveles.
  if (/\bplanta\s+baja\b/.test(texto) && /\bplanta\s+alta\b/.test(texto)) {
    return 2;
  }

  const coincidencia = texto.match(
    /\b(1|2|3|un|uno|una|dos|tres)\s+(niveles?|pisos?|plantas?)\b/
  );
  if (coincidencia) {
    const numero = NUMEROS_TEXTO[coincidencia[1]];
    if (numero !== undefined) {
      return Math.min(MAX_NIVELES, Math.max(1, numero));
    }
  }

  if (/\bplanta\s+alta\b|\bsegundo\s+piso\b|\bentre\s*piso\b/.test(texto)) {
    return 2;
  }
  if (/\btercer\s+piso\b|\btercer\s+nivel\b/.test(texto)) {
    return 3;
  }
  if (
    /\bplanta\s+baja\b|\bplanta\s+unica\b|\bun\s+solo\s+nivel\b|\buna\s+sola\s+planta\b/.test(
      texto
    )
  ) {
    return 1;
  }

  return 1;
}

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
