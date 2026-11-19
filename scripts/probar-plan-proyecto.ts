/**
 * Pruebas del planificador de proyectos.
 *
 *   npx tsx scripts/probar-plan-proyecto.ts
 *   npx tsx --env-file=.env.local scripts/probar-plan-proyecto.ts --real
 *
 * Sin `--real` corre solo las pruebas de esquema y geometría (sin red). Con
 * `--real` además llama al modelo gratuito de OpenRouter y valida que el plan
 * devuelto pase por el mismo pipeline que usa el endpoint.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  describirIssues,
  extraerJson,
  planProyectoSchema,
} from "../src/lib/ia/proyecto/esquema";
import {
  ajustarCantidadNiveles,
  limitarANiveles,
  normalizarPlan,
} from "../src/lib/ia/proyecto/geometria";
import { llamarPlanificador } from "../src/lib/ia/proyecto/openrouter";
import {
  nivelesSegunTexto,
  promptEfectivo,
} from "../src/lib/ia/proyecto/prompt";

function planBase(ambientes: unknown[], niveles = 1) {
  return {
    nombreSugerido: "Casa de prueba",
    niveles: Array.from({ length: niveles }, (_, indice) => ({
      nivel: indice,
      nombre: `Nivel ${indice + 1}`,
      ambientes,
    })),
  };
}

function rect(nombre: string, x0: number, z0: number, x1: number, z1: number) {
  return {
    nombre,
    poligono: [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    altura: 2.5,
    aberturas: [
      { tipo: "puerta", lado: 1 },
      { tipo: "ventana", lado: 2 },
    ],
  };
}

function probarEsquema() {
  const valido = planProyectoSchema.safeParse(
    planBase([rect("Living", 0, 0, 5, 4), rect("Cocina", 5, 0, 9, 4)])
  );
  assert.equal(valido.success, true, "un plan rectangular válido debe pasar");

  const nueve = planProyectoSchema.safeParse(
    planBase(Array.from({ length: 9 }, (_, i) => rect(`A${i}`, i * 3, 0, i * 3 + 2, 2)))
  );
  assert.equal(nueve.success, false, "9 ambientes por nivel debe fallar");

  const cuatroNiveles = planProyectoSchema.safeParse(
    planBase([rect("Living", 0, 0, 5, 4)], 4)
  );
  assert.equal(cuatroNiveles.success, false, "4 niveles debe fallar");

  assert.equal(extraerJson("```json\n{\"a\":1}\n```") !== null, true);
  assert.equal(extraerJson("texto sin json"), null);
  assert.ok(describirIssues([]).length === 0);
}

function probarGeometria() {
  // Traslación: coordenadas negativas terminan en (0,0).
  const trasladado = normalizarPlan(
    planProyectoSchema.parse(
      planBase([rect("Living", -10, -8, -6, -4), rect("Cocina", -6, -8, -2, -4)])
    )
  );
  assert.equal(trasladado.ok, true);
  assert.deepEqual(trasladado.plan.niveles[0].ambientes[0].poligono[0], [0, 0]);

  // Solape: misma zona dos veces.
  const solapado = normalizarPlan(
    planProyectoSchema.parse(
      planBase([rect("Living", 0, 0, 5, 4), rect("Cocina", 2, 2, 6, 5)])
    )
  );
  assert.equal(solapado.ok, false);
  assert.ok(
    solapado.problemas.some((problema) => problema.includes("superponen")),
    "el solape debe informarse"
  );

  // Borde compartido: permitido.
  const compartido = normalizarPlan(
    planProyectoSchema.parse(
      planBase([rect("Living", 0, 0, 5, 4), rect("Cocina", 5, 0, 9, 4)])
    )
  );
  assert.equal(compartido.ok, true);

  // El modelo puede devolver el rectángulo empezando en otra esquina: la
  // puerta del lado 4 original debe quedar en el lado 1 canónico.
  const rotado = normalizarPlan(
    planProyectoSchema.parse(
      planBase([
        {
          nombre: "Living",
          poligono: [
            [5, 0],
            [5, 4],
            [0, 4],
            [0, 0],
          ],
          altura: 2.5,
          aberturas: [{ tipo: "puerta", lado: 4 }],
        },
      ])
    )
  );
  assert.equal(rotado.ok, true);
  assert.equal(
    rotado.plan.niveles[0]?.ambientes[0]?.aberturas?.[0]?.lado,
    1
  );

  // Envolvente mayor al terreno: se escala.
  const grande = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Galpón", 0, 0, 60, 40)]))
  );
  assert.equal(grande.ok, true);
  const puntos = grande.plan.niveles[0].ambientes[0].poligono;
  const ancho = Math.max(...puntos.map((p) => p[0]));
  const alto = Math.max(...puntos.map((p) => p[1]));
  assert.ok(ancho <= 28.05 && alto <= 28.05, `envolvente ${ancho}×${alto} debe entrar en 28 m`);
  assert.ok(grande.avisos.length > 0);

  // Ambiente demasiado chico.
  const chico = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Baño", 0, 0, 1, 1)]))
  );
  assert.equal(chico.ok, false);

  // Si la imagen muestra un solo nivel, una segunda planta inventada se
  // descarta y queda anotada.
  const dosNiveles = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Living", 0, 0, 5, 4)], 2))
  );
  assert.equal(dosNiveles.ok, true);
  const limitado = limitarANiveles(dosNiveles.plan, 1);
  assert.equal(limitado.descartados, 1);
  assert.equal(limitado.plan.niveles.length, 1);
  assert.ok(limitado.plan.notas?.includes("imagen"));

  // Si la imagen muestra dos niveles, se conservan los dos: no se recorta a 1.
  const dosIntactos = limitarANiveles(dosNiveles.plan, 2);
  assert.equal(dosIntactos.descartados, 0);
  assert.equal(dosIntactos.plan, dosNiveles.plan);

  // Tres niveles inventados sobre una imagen de dos: se conservan dos.
  const tresNiveles = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Living", 0, 0, 5, 4)], 3))
  );
  assert.equal(tresNiveles.ok, true);
  const dosDeTres = limitarANiveles(tresNiveles.plan, 2);
  assert.equal(dosDeTres.descartados, 1);
  assert.equal(dosDeTres.plan.niveles.length, 2);

  // Un plan de un solo nivel no se toca.
  const intacto = limitarANiveles(rotado.plan, 1);
  assert.equal(intacto.descartados, 0);
  assert.equal(intacto.plan, rotado.plan);
}

function probarAjusteNiveles() {
  const dosNiveles = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Living", 0, 0, 5, 4)], 2))
  );
  assert.equal(dosNiveles.ok, true);

  // La imagen muestra 1 y el plan trae 2: se recorta y se avisa.
  const recortado = ajustarCantidadNiveles(dosNiveles.plan, 1, true);
  assert.equal(recortado.ok, true);
  if (recortado.ok) {
    assert.equal(recortado.plan.niveles.length, 1);
    assert.equal(recortado.descartados, 1);
    assert.ok(recortado.aviso?.includes("descartaron"));
    assert.ok(recortado.plan.notas?.includes("imagen"));
  }

  // La imagen muestra 2 y el plan trae 2: no se toca.
  const intacto = ajustarCantidadNiveles(dosNiveles.plan, 2, true);
  assert.equal(intacto.ok, true);
  if (intacto.ok) {
    assert.equal(intacto.descartados, 0);
    assert.equal(intacto.plan, dosNiveles.plan);
  }

  // El plan declara 2 pero trae 1: hace falta reparación.
  const unNivel = normalizarPlan(
    planProyectoSchema.parse(planBase([rect("Living", 0, 0, 5, 4)], 1))
  );
  assert.equal(unNivel.ok, true);
  const faltante = ajustarCantidadNiveles(unNivel.plan, 2, true);
  assert.equal(faltante.ok, false);
  if (!faltante.ok) {
    assert.ok(faltante.problemas[0]?.includes("generó"));
  }

  // Sin imagen, el texto manda y la nota habla del pedido.
  const porTexto = ajustarCantidadNiveles(dosNiveles.plan, 1, false);
  assert.equal(porTexto.ok, true);
  if (porTexto.ok) {
    assert.ok(porTexto.plan.notas?.includes("pedido"));
  }
}

function probarNivelesSegunTexto() {
  assert.equal(nivelesSegunTexto("Casa de un piso"), 1);
  assert.equal(nivelesSegunTexto("Casa de dos pisos"), 2);
  assert.equal(nivelesSegunTexto("Departamento de 3 niveles"), 3);
  assert.equal(nivelesSegunTexto("Casa con tres plantas"), 3);
  assert.equal(nivelesSegunTexto("Planta baja y planta alta"), 2);
  assert.equal(nivelesSegunTexto("Casa con 3 dormitorios y 2 baños"), 1);
  assert.equal(nivelesSegunTexto(""), 1);
  assert.equal(nivelesSegunTexto("Casa de un solo nivel"), 1);
}

async function probarModeloReal() {
  const modeloGratuito =
    process.env.OPENROUTER_MODEL_PROYECTO_GRATIS?.trim() ||
    "nvidia/nemotron-3.5-super-vl:free";

  const prompt =
    "Casa de un piso para una familia de tres: dos dormitorios, un baño completo, cocina, living-comedor y un patio descubierto. Terreno de 12 por 10 metros.";

  console.log(`\n[real] modelo=${modeloGratuito}`);
  const respuesta = await llamarPlanificador({ modelo: modeloGratuito, prompt });
  console.log(
    `[real] tokens entrada=${respuesta.tokensEntrada} salida=${respuesta.tokensSalida}`
  );
  console.log("[real] respuesta:\n" + respuesta.texto.slice(0, 1_200));

  const plan = validarTextoDePlan(respuesta.texto, "[real]");
  assert.equal(
    plan.niveles.length,
    1,
    "un pedido de un piso no debe generar dos niveles"
  );
}

function validarTextoDePlan(texto: string, etiqueta: string) {
  const crudo = extraerJson(texto);
  assert.ok(crudo !== null, "el modelo debe devolver JSON");

  const validado = planProyectoSchema.safeParse(crudo);
  if (!validado.success) {
    console.error(describirIssues(validado.error.issues));
    assert.fail("el JSON del modelo no cumple el esquema del plan");
  }

  const normalizado = normalizarPlan(validado.data);
  if (!normalizado.ok) {
    console.error(normalizado.problemas);
    assert.fail("el plan del modelo no pasó la validación geométrica");
  }

  assert.ok(
    validado.data.cantidadNiveles !== undefined,
    "el modelo debe declarar cantidadNiveles"
  );
  assert.equal(
    normalizado.plan.niveles.length,
    validado.data.cantidadNiveles,
    "cantidadNiveles debe coincidir con la cantidad de niveles generados"
  );

  const ambientes = normalizado.plan.niveles.flatMap((nivel) => nivel.ambientes);
  console.log(
    `${etiqueta} OK: ${normalizado.plan.niveles.length} nivel(es), ${ambientes.length} ambiente(s)`
  );
  for (const ambiente of ambientes) {
    console.log(
      `  - ${ambiente.nombre}: ${JSON.stringify(ambiente.poligono)} (${ambiente.aberturas?.length ?? 0} aberturas)`
    );
  }
  if (normalizado.avisos.length > 0) {
    console.log(`${etiqueta} avisos:`, normalizado.avisos);
  }
  return normalizado.plan;
}

async function probarDosNiveles() {
  const modeloGratuito =
    process.env.OPENROUTER_MODEL_PROYECTO_GRATIS?.trim() ||
    "nvidia/nemotron-3.5-super-vl:free";

  const prompt =
    "Casa de dos pisos en un terreno de 10 por 9 metros. Planta baja: living-comedor, cocina, baño de visita y patio. Planta alta: tres dormitorios y dos baños.";

  console.log(`\n[dos-niveles] modelo=${modeloGratuito}`);
  const respuesta = await llamarPlanificador({ modelo: modeloGratuito, prompt });
  console.log(
    `[dos-niveles] tokens entrada=${respuesta.tokensEntrada} salida=${respuesta.tokensSalida}`
  );
  console.log("[dos-niveles] respuesta:\n" + respuesta.texto.slice(0, 1_500));

  const plan = validarTextoDePlan(respuesta.texto, "[dos-niveles]");
  assert.equal(
    plan.niveles.length,
    2,
    "un pedido de dos pisos debe generar dos niveles"
  );
}

function tipoDeImagen(ruta: string): string {
  const minuscula = ruta.toLowerCase();
  if (minuscula.endsWith(".png")) return "image/png";
  if (minuscula.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Prueba el camino "solo imagen": sin prompt, con el prompt por defecto. */
async function probarImagenReal(ruta: string) {
  const modeloGratuito =
    process.env.OPENROUTER_MODEL_PROYECTO_GRATIS?.trim() ||
    "nvidia/nemotron-3.5-super-vl:free";

  const archivo = await readFile(ruta);
  const tipo = tipoDeImagen(ruta);
  const imagenDataUrl = `data:${tipo};base64,${archivo.toString("base64")}`;

  console.log(`\n[imagen] modelo=${modeloGratuito} archivo=${ruta}`);
  const respuesta = await llamarPlanificador({
    modelo: modeloGratuito,
    prompt: promptEfectivo("", true),
    imagenDataUrl,
  });
  console.log(
    `[imagen] tokens entrada=${respuesta.tokensEntrada} salida=${respuesta.tokensSalida}`
  );
  console.log("[imagen] respuesta:\n" + respuesta.texto.slice(0, 1_000));

  // La cantidad de niveles la define la imagen: el plan debe declarar la misma
  // cantidad que generó (ya validado en `validarTextoDePlan`). No se fuerza 1.
  const plan = validarTextoDePlan(respuesta.texto, "[imagen]");
  console.log(
    `[imagen] el modelo detectó ${plan.niveles.length} nivel(es) en la imagen`
  );
}

async function main() {
  probarEsquema();
  probarGeometria();
  probarAjusteNiveles();
  probarNivelesSegunTexto();
  console.log("Pruebas de esquema, geometría y niveles: OK");

  if (process.argv.includes("--real")) {
    await probarModeloReal();
    console.log("Prueba con el modelo gratuito: OK");

    const imagen = process.argv
      .find((argumento) => argumento.startsWith("--imagen="))
      ?.slice("--imagen=".length);
    if (imagen) {
      await probarImagenReal(imagen);
      console.log("Prueba de solo imagen con el modelo gratuito: OK");
    }

    if (process.argv.includes("--niveles")) {
      await probarDosNiveles();
      console.log("Prueba de dos niveles con el modelo gratuito: OK");
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
