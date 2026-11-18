/**
 * Pruebas del título automático de proyectos.
 *
 *   npx tsx scripts/probar-nombre-proyecto.ts
 *
 * La barra IA crea proyectos sin pedir nombre. El título sale del
 * `nombreSugerido` del plan y no puede repetir uno del mismo usuario.
 */
import assert from "node:assert/strict";
import {
  MAX_TITULO_PROYECTO,
  TITULO_POR_DEFECTO,
  tituloProyectoUnico,
} from "../src/lib/ia/proyecto/nombre";

// Sin sugerencia o vacía: cae al título por defecto.
assert.equal(tituloProyectoUnico(undefined, []), TITULO_POR_DEFECTO);
assert.equal(tituloProyectoUnico("", []), TITULO_POR_DEFECTO);
assert.equal(tituloProyectoUnico("   ", []), TITULO_POR_DEFECTO);

// Limpia espacios y respeta el título cuando no hay colisión.
assert.equal(tituloProyectoUnico("  Casa   de 2 pisos ", []), "Casa de 2 pisos");
assert.equal(tituloProyectoUnico("Casa", ["Departamento"]), "Casa");

// La comparación ignora mayúsculas y espacios sobrantes.
assert.equal(tituloProyectoUnico("casa", ["  CASA  "]), "casa (2)");
assert.equal(tituloProyectoUnico("Casa", ["Casa", "Casa (2)"]), "Casa (3)");
assert.equal(tituloProyectoUnico("Casa", ["casa", "CASA (2)", "Casa (3)"]), "Casa (4)");

// Nunca supera el máximo del backend, incluso agregando sufijo.
const largo = "x".repeat(120);
const recortado = tituloProyectoUnico(largo, []);
assert.equal(recortado.length, MAX_TITULO_PROYECTO);
const conSufijo = tituloProyectoUnico(largo, [recortado]);
assert.ok(conSufijo.endsWith(" (2)"));
assert.ok(conSufijo.length <= MAX_TITULO_PROYECTO);

// No muta la lista de títulos existentes.
const existentes = ["Casa"];
tituloProyectoUnico("Casa", existentes);
assert.deepEqual(existentes, ["Casa"]);

console.log("Pruebas de título de proyecto: OK");
