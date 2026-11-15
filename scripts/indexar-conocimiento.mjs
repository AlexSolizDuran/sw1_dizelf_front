#!/usr/bin/env node
/**
 * Indexa las tarjetas de conocimiento contra el Space de embeddings.
 *
 * Uso:
 *   node scripts/indexar-conocimiento.mjs
 *
 * Variables:
 *   EMBEDDINGS_URL   (default https://alexsolizduran-ia-marranque.hf.space)
 *   EMBEDDINGS_TOKEN (opcional, se manda como X-API-Key)
 *
 * Genera src/lib/ia/conocimiento/vectores.json. Si el hash del contenido no
 * coincide con el de las tarjetas, la app usa búsqueda léxica hasta reindexar.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RUTA_TARJETAS = fileURLToPath(
  new URL("../src/lib/ia/conocimiento/tarjetas.json", import.meta.url)
);
const RUTA_SALIDA = fileURLToPath(
  new URL("../src/lib/ia/conocimiento/vectores.json", import.meta.url)
);

const URL_BASE = (process.env.EMBEDDINGS_URL ?? "https://alexsolizduran-ia-marranque.hf.space")
  .trim()
  .replace(/\/+$/, "");
const TOKEN = process.env.EMBEDDINGS_TOKEN?.trim() ?? "";
const LOTE = 32;
const DECIMALES = 5;

/** Misma implementación que src/lib/ia/conocimiento/tarjetas.ts. */
function hashContenido(texto) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function textoDeTarjeta(tarjeta) {
  return [
    tarjeta.titulo,
    tarjeta.temas.join(" "),
    tarjeta.texto,
    ...(tarjeta.datos ?? []).map((dato) => `${dato.etiqueta} ${dato.valor} ${dato.unidad}`),
  ].join("\n");
}

function redondear(vector) {
  return vector.map((valor) => Number(valor.toFixed(DECIMALES)));
}

async function vectorizar(textos) {
  const respuesta = await fetch(`${URL_BASE}/api/vectorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { "X-API-Key": TOKEN } : {}),
    },
    body: JSON.stringify({ texts: textos }),
    signal: AbortSignal.timeout(60000),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`El servicio respondió ${respuesta.status}. ${detalle.slice(0, 300)}`);
  }

  const datos = await respuesta.json();
  if (!Array.isArray(datos.embeddings) || datos.embeddings.length !== textos.length) {
    throw new Error("Respuesta inesperada del servicio de embeddings.");
  }
  return datos;
}

async function main() {
  const crudo = JSON.parse(await readFile(RUTA_TARJETAS, "utf8"));
  if (!Array.isArray(crudo) || crudo.length === 0) {
    throw new Error("tarjetas.json está vacío o no es una lista.");
  }

  const vistos = new Set();
  for (const tarjeta of crudo) {
    if (!tarjeta.id || vistos.has(tarjeta.id)) {
      throw new Error(`Id faltante o repetido: ${tarjeta.id}`);
    }
    vistos.add(tarjeta.id);
  }

  const hash = hashContenido(JSON.stringify(crudo));
  console.log(`Tarjetas: ${crudo.length} · hash ${hash}`);
  console.log(`Servicio: ${URL_BASE}`);

  const vectores = {};
  let modelo = "";
  let revision = "";
  let dimensions = 0;

  for (let inicio = 0; inicio < crudo.length; inicio += LOTE) {
    const bloque = crudo.slice(inicio, inicio + LOTE);
    process.stdout.write(
      `Vectorizando ${inicio + 1}-${inicio + bloque.length} de ${crudo.length}… `
    );
    const datos = await vectorizar(bloque.map(textoDeTarjeta));
    modelo = datos.model ?? modelo;
    revision = datos.revision ?? revision;
    dimensions = datos.dimensions ?? dimensions;

    bloque.forEach((tarjeta, indice) => {
      const vector = datos.embeddings[indice];
      if (dimensions && vector.length !== dimensions) {
        throw new Error(
          `Dimensión inconsistente en ${tarjeta.id}: ${vector.length} vs ${dimensions}.`
        );
      }
      vectores[tarjeta.id] = redondear(vector);
    });
    console.log("ok");
  }

  const salida = { modelo, revision, dimensions, hash, vectores };
  await writeFile(RUTA_SALIDA, `${JSON.stringify(salida)}\n`, "utf8");

  const faltantes = crudo.filter((tarjeta) => !vectores[tarjeta.id]);
  console.log(
    `Listo: ${Object.keys(vectores).length}/${crudo.length} vectores · ${dimensions} dims`
  );
  console.log(`Modelo: ${modelo} @ ${revision}`);
  console.log(`Archivo: ${RUTA_SALIDA}`);
  if (faltantes.length > 0) {
    console.warn(`Faltan ${faltantes.length} tarjetas: ${faltantes.map((t) => t.id).join(", ")}`);
  }
}

main().catch((error) => {
  console.error("\nError:", error.message);
  process.exitCode = 1;
});
