/**
 * Normaliza los esquemas que se envían al modelo.
 *
 * `z.toJSONSchema` expresa `z.tuple([...])` con `prefixItems` e `items: false`.
 * Ese booleano rompe el generador de parser de llama.cpp (`--jinja`), que exige
 * que `items` sea un objeto, y varios proveedores OpenAI tampoco entienden
 * `prefixItems`. Aquí las tuplas se convierten a arrays homogéneos y se quita
 * el ruido que solo engorda el prompt.
 *
 * La validación real sigue en Zod al ejecutar la tool: esto es solo la forma
 * que viaja al modelo.
 */
export function normalizarEsquema(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizarEsquema);
  if (typeof valor !== "object" || valor === null) return valor;

  const objeto = { ...(valor as Record<string, unknown>) };

  if (Array.isArray(objeto.prefixItems)) {
    const tipos = new Set(
      objeto.prefixItems
        .map((item) =>
          typeof item === "object" && item !== null
            ? (item as { type?: unknown }).type
            : undefined
        )
        .filter((tipo): tipo is string => typeof tipo === "string")
    );
    objeto.type = "array";
    objeto.items = tipos.size === 1 ? { type: [...tipos][0] } : {};
    delete objeto.prefixItems;
    delete objeto.additionalItems;
  }

  // `items: false|true` no es un esquema válido para el parser de llama.cpp.
  if (objeto.items === false || objeto.items === true) {
    delete objeto.items;
  }

  // Metadatos que no aportan al modelo.
  delete objeto.$schema;
  delete objeto.$id;
  delete objeto.examples;
  delete objeto.default;

  for (const [clave, hijo] of Object.entries(objeto)) {
    if (clave === "enum" || clave === "const") continue;
    objeto[clave] = normalizarEsquema(hijo);
  }
  return objeto;
}
