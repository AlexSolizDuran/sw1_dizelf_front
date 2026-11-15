/**
 * Reglas que acompañan al bloque de conocimiento.
 *
 * Solo se agregan cuando hay tarjetas: si no se recuperó nada, no tiene
 * sentido ocupar contexto con instrucciones sobre algo que no está.
 */
export const REGLAS_CONOCIMIENTO = [
  "El bloque CONOCIMIENTO son referencias generales de diseño, no normativa de la jurisdicción del usuario. No inventes artículos, códigos, jurisdicciones ni fechas.",
  "Copiá las cifras exactamente como figuran en las tarjetas; no las redondees ni las conviertas a otra unidad.",
  "Cuando des un mínimo o una recomendación, aclarás que es una referencia general y que conviene verificar la normativa local.",
  "El diagnóstico del plano ya está calculado. No recalcules superficies, áreas ni alturas: usá los valores que aparecen en los hechos.",
  "Si las tarjetas no cubren la pregunta, decí que no tenés esa fuente cargada en lugar de completar con conocimiento general.",
  "Máximo 3 a 5 sugerencias, ordenadas por impacto. Cada una con qué cambiar, por qué y cómo, citando el id de la tarjeta entre corchetes.",
  "No presentes una recomendación de diseño como obligación legal.",
];
