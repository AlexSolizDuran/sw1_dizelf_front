#!/usr/bin/env node
/**
 * Evalúa el retrieval contra el servidor de desarrollo.
 *
 * Uso:
 *   npm run dev            (en otra terminal)
 *   node scripts/evaluar-conocimiento.mjs
 *
 * Variables:
 *   API_URL   (default http://localhost:3000)
 *
 * No es un test automático: imprime el top-3 de cada consulta y cuántas veces
 * la tarjeta esperada entró en el top-3. Sirve para detectar tarjetas flojas.
 */

const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const CASOS = [
  ["baño de 2,8 m2 sin ventana", "hum-bano-superficie"],
  ["ancho de pasillo de 0,85 m", "circ-pasillo-ancho"],
  ["puerta de 0,70 m en un dormitorio", "circ-puerta-ancho"],
  ["escalera con contrahuella de 0,20", "circ-escalera"],
  ["rampa de acceso con pendiente fuerte", "circ-rampa"],
  ["baño sin ventilación al exterior", "hum-ventilacion"],
  ["distancia entre frentes de cocina", "hum-cocina"],
  ["pendiente del piso del baño", "hum-pendiente"],
  ["dormitorio de 8 m2", "dorm-superficie"],
  ["circulación alrededor de la cama", "dorm-cama-circulacion"],
  ["profundidad del placard", "dorm-guardado"],
  ["estar de 12 m2 con sofá", "estar-superficie"],
  ["ventana de dormitorio 1/8", "dorm-iluminacion"],
  ["altura libre de 2,30 m", "env-altura-libre"],
  ["alto de dintel de puerta", "env-aberturas-alturas"],
  ["superficie vidriada insuficiente", "env-iluminacion-natural"],
  ["alero de 40 cm", "env-aleros"],
  ["aislación de muro exterior", "env-aislamiento"],
  ["luz de losa de 7 m", "est-luz-losa"],
  ["columnas que no coinciden entre plantas", "est-continuidad"],
  ["junta de dilatación cada 30 m", "est-juntas"],
  ["ventilación cruzada en el living", "sus-ventilacion-cruzada"],
  ["orientación de los dormitorios", "sus-orientacion"],
  ["sombreado de la fachada oeste", "sus-sombreado"],
  ["inercia térmica del muro", "sus-inercia"],
  ["captación de agua de lluvia", "sus-agua-lluvia"],
];

async function consultar(consulta) {
  const respuesta = await fetch(`${API_URL}/api/ia/conocimiento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consulta, limite: 3 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return respuesta.json();
}

async function main() {
  console.log(`API: ${API_URL}\n`);
  let aciertos = 0;
  let fallos = 0;
  const origen = { vectorial: 0, lexico: 0 };

  for (const [consulta, esperada] of CASOS) {
    try {
      const datos = await consultar(consulta);
      const ids = datos.tarjetas.map((tarjeta) => tarjeta.id);
      const posicion = ids.indexOf(esperada);
      origen[datos.origen === "lexico" ? "lexico" : "vectorial"] += 1;

      if (posicion >= 0) {
        aciertos += 1;
        console.log(`ok    ${consulta}`);
        console.log(`      ${ids.join(" · ")}`);
      } else {
        fallos += 1;
        console.log(`FALLA ${consulta}`);
        console.log(`      esperada: ${esperada}`);
        console.log(`      obtenidas: ${ids.join(" · ") || "(vacío)"}${datos.origen === "lexico" ? " [léxico]" : ""}`);
      }
    } catch (error) {
      fallos += 1;
      console.log(`ERROR ${consulta}: ${error.message}`);
    }
  }

  const total = CASOS.length;
  console.log(
    `\nRecall@3: ${aciertos}/${total} (${((aciertos / total) * 100).toFixed(0)}%) · fallos ${fallos}`
  );
  console.log(`Origen: ${origen.vectorial} vectorial · ${origen.lexico} léxico`);
}

main().catch((error) => {
  console.error(`\nNo se pudo evaluar: ${error.message}`);
  console.error("¿Está corriendo `npm run dev`?");
  process.exitCode = 1;
});
