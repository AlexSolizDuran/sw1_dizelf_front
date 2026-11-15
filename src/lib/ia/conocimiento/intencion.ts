import type { ModoIA } from "../types";

/**
 * Decide si el turno necesita conocimiento y cuántas tarjetas.
 *
 * La intención manda, el modo solo define las tools disponibles: en Build se
 * puede preguntar, y una acción pura no debe pagar el costo del retrieval.
 */

export interface DecisionConocimiento {
  usar: boolean;
  limite: number;
  motivo: "plan" | "solo-lectura" | "consulta" | "mixta" | "accion";
}

const PEDIDO_DE_ACCION =
  /\b(añad|agreg|crea|crear|constru|haz|hac[eé]|hacer|pon|poner|coloc|instal|abre|abrir|genera|generar|borr|elimin|mueve|mover|pinta|pintar|duplic|actualiza|actualizar|cambia|cambiar|cambiá|quiero que|necesito que)/i;

const COMIENZO_DE_PREGUNTA =
  /^\s*(¿\s*)?(qué|que|cuál|cual|cuáles|cuales|cuánt|cuant|cómo|como|dónde|donde|por qué|porque|quién|quien|hay|está|esta|están|estan|tenés|tienes|podés|puedes|sirve|conviene|debería|deberia|es)\b/i;

function esPregunta(texto: string): boolean {
  return COMIENZO_DE_PREGUNTA.test(texto) || /\?\s*$/.test(texto);
}

function pideAccion(texto: string): boolean {
  return PEDIDO_DE_ACCION.test(texto);
}

export function decidirConocimiento({
  modo,
  puedeEditar,
  texto,
}: {
  modo: ModoIA;
  puedeEditar: boolean;
  texto: string;
}): DecisionConocimiento {
  if (!puedeEditar) return { usar: true, limite: 3, motivo: "solo-lectura" };
  if (modo === "plan") return { usar: true, limite: 3, motivo: "plan" };

  const pregunta = esPregunta(texto);
  const accion = pideAccion(texto);

  if (accion && !pregunta) return { usar: false, limite: 0, motivo: "accion" };
  if (accion && pregunta) return { usar: true, limite: 2, motivo: "mixta" };
  return { usar: true, limite: 3, motivo: "consulta" };
}
