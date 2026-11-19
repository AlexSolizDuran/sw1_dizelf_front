/**
 * Nombres en español de la biblioteca de materiales.
 *
 * Vive fuera de la pestaña de Materiales porque el presupuesto también los
 * necesita: al agrupar la pintura por color, la línea se describe con el mismo
 * nombre que el usuario vio al elegirla ("Terracota", no "preset-terracotta").
 *
 * Los ids no se traducen: son la clave del preset y viajan en `node.slots`.
 * Solo se traduce el texto que ve el usuario.
 */
const MATERIAL_LABELS: Record<string, string> = {
  // Colores
  "preset-white": "Blanco",
  "preset-softwhite": "Blanco suave",
  "preset-cream": "Crema",
  "preset-beige": "Beige",
  "preset-lightgrey": "Gris claro",
  "preset-greige": "Greige",
  "preset-midgrey": "Gris medio",
  "preset-charcoal": "Grafito",
  "preset-nearblack": "Negro intenso",
  "preset-blush": "Rubor",
  "preset-tomato": "Tomate",
  "preset-brickred": "Rojo ladrillo",
  "preset-oxblood": "Granate",
  "preset-peach": "Durazno",
  "preset-terracotta": "Terracota",
  "preset-burntorange": "Naranja tostado",
  "preset-clay": "Arcilla",
  "preset-paleyellow": "Amarillo pálido",
  "preset-mustard": "Mostaza",
  "preset-ochre": "Ocre",
  "preset-gold": "Dorado",
  "preset-mint": "Menta",
  "preset-sage": "Salvia",
  "preset-olive": "Oliva",
  "preset-forest": "Bosque",
  "preset-paleteal": "Verde agua claro",
  "preset-teal": "Verde azulado",
  "preset-deepteal": "Verde azulado oscuro",
  "preset-powderblue": "Azul polvo",
  "preset-softblue": "Azul suave",
  "preset-sky": "Cielo",
  "preset-slateblue": "Azul pizarra",
  "preset-royalblue": "Azul real",
  "preset-navy": "Azul marino",
  "preset-lavender": "Lavanda",
  "preset-plum": "Ciruela",
  "preset-aubergine": "Berenjena",
  "preset-petal": "Pétalo",
  "preset-rose": "Rosa",
  "preset-dustyrose": "Rosa apagado",
  "preset-berry": "Baya",
  "preset-sand": "Arena",
  "preset-tan": "Canela",
  "preset-taupe": "Taupe",
  "preset-espresso": "Expreso",
  // Metal y vidrio
  "preset-metal": "Metal",
  "preset-glass": "Vidrio",
};

/**
 * Nombre visible de un material.
 *
 * `fallback` es el label que trae el catálogo del paquete (en inglés); se usa
 * para los materiales que no tienen traducción propia. Además se quita el
 * sufijo numérico de los presets de textura ("Wood Parquet 14" → "Wood
 * Parquet").
 */
export function materialLabel(id: string, fallback: string): string {
  const base = MATERIAL_LABELS[id] ?? fallback;
  return base.replace(/\s+\d+$/, "");
}
