import { CATALOG_ITEMS } from "@pascal-app/editor";
import {
  BedDouble,
  ChefHat,
  Monitor,
  Rows3,
  ShowerHead,
  Sofa,
  Table,
  Tv,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

/**
 * Grupos del catálogo de mobiliario.
 *
 * El `slug` es el identificador de taxonomía. El matcher usa los campos que el
 * catálogo oficial REALMENTE tiene: `category` (furniture, appliance, bathroom,
 * kitchen, outdoor) y `tags`. No existe `functionTags` — una versión anterior
 * de este panel filtraba por ese campo inexistente y por eso no mostraba ningún
 * objeto.
 *
 * Un ítem entra al grupo si coincide la categoría o CUALQUIERA de los tags. Los
 * nombres se matchean por substring, sin distinguir mayúsculas.
 *
 * OJO: los tags matchean contra el tag original del paquete MÁS los alias de
 * `SEARCH_ALIASES`, y los nombres contra el nombre ya traducido de
 * `SPANISH_NAMES`. Por eso `names` va en español ("lavarropas", no "washing
 * machine") y por eso los alias son la vía principal para alcanzar un objeto:
 * sin ellos la sección de PC quedaba vacía, porque el ítem se llama
 * "Computadora" y no "Computer".
 *
 * El icono es un componente de lucide, no una ruta: el catálogo del paquete
 * apunta a `/icons/*.webp` que este proyecto no tiene.
 *
 * La lista es cerrada y cada sección tiene al menos 5 objetos: son las 10
 * categorías que el panel expone. Cualquier ítem del paquete que no entre en
 * ninguna queda fuera a propósito —no hay grupo "Todos" ni grupo "Otros"— así
 * que exterior y electrodomésticos sueltos no son alcanzables desde el
 * sidebar.
 */
export type CatalogGroup = {
  slug: string;
  label: string;
  icon: LucideIcon;
  category?: string;
  tags?: string[];
  names?: string[];
  /**
   * `id` del ítem que la sección descarta aunque entre por tag o por nombre.
   * Hace falta porque los tags del paquete son demasiado amplios: la plancha
   * es una mesa plegable, el tender está en el baño y el lavarropas también.
   */
  excludeIds?: string[];
};

export const CATALOG_GROUPS: CatalogGroup[] = [
  {
    slug: "asientos",
    label: "Sillones",
    icon: Sofa,
    // `lounge` fuera: la Mesa ratona lo lleva y no es un asiento.
    tags: ["seating", "seat", "chair", "armchair", "lounger", "stool", "bench"],
    // La Barra de cocina tiene el tag `seating` porque se apoya en banquetas,
    // pero es una mesada: vive en Cocina.
    excludeIds: ["wooden-kitchen-bar-moa2hhh4"],
  },
  {
    slug: "camas",
    label: "Camas",
    icon: BedDouble,
    // Ropero y Cómoda entran por el tag `bedroom`: son muebles de dormitorio
    // y hacen de 5ta y 6ta opción, aunque su lugar natural es Roperos.
    tags: ["bed", "bunkbed", "bedside", "bedroom", "sleep", "sleeper", "nightstand"],
  },
  {
    slug: "mesas",
    label: "Mesas",
    icon: Table,
    // `tabletop`, `workspace` y `workstation` fuera: también los llevan las
    // frutas, la mesada de cocina, la silla de oficina y la computadora.
    tags: ["table", "desk", "writing"],
    // La plancha es una mesa plegable (`table`) y la Silla de oficina tiene el
    // tag `desk`, pero ninguna de las dos es una mesa.
    excludeIds: ["ironing-board", "office-chair"],
  },
  {
    slug: "roperos",
    label: "Roperos",
    icon: Rows3,
    // `storage` fuera: lo también llevan el cactus y el mueble de TV.
    tags: ["wardrobe", "shelf", "shelving", "cabinet", "dresser", "bookcase", "closet", "cubby"],
    // La Cocina completa entra por `cabinet`, pero es un mueble entero, no un
    // armario: la muestran sus partes en Cocina. La Mesita de luz tiene tag
    // `cabinet` por el cajón, pero es una mesa de luz.
    excludeIds: ["kitchen", "bedside-table"],
  },
  {
    slug: "cocina",
    label: "Cocina",
    icon: ChefHat,
    // `countertop` fuera: la lámpara de mesa también lo lleva.
    tags: ["kitchen", "cooking", "cookware", "kitchenware", "counter", "island", "pantry", "refrigerator", "fridge", "stove", "oven", "microwave", "toaster", "serving", "baking"],
    // La Silla de comedor tiene el tag `kitchen`, pero es un asiento.
    excludeIds: ["dining-chair"],
  },
  {
    slug: "bano",
    label: "Baños",
    icon: ShowerHead,
    // `inodoro` y `papel` son alias, no tags del paquete: sin ellos el inodoro
    // y el papel higiénico no caían en ninguna sección.
    tags: ["bathroom", "bath", "bathtub", "tub", "vanity", "washbasin", "basin", "sink", "mirror", "hygiene", "inodoro", "papel"],
    // El Tender tiene el tag `bathroom` (el paquete lo categoriza así), pero
    // seca ropa: lo muestra Lavadora.
    excludeIds: ["drying-rack"],
  },
  {
    slug: "ducha",
    label: "Ducha",
    icon: ShowerHead,
    // `ducha` y `lavabo` por nombre: el set de ducha siempre incluye el lavabo.
    tags: ["shower", "soaking", "bathmat"],
    names: ["ducha", "lavabo"],
  },
  {
    slug: "lavadero",
    label: "Lavadora",
    icon: WashingMachine,
    // Ni `washing` (también lo llevan el lavabo y la ducha) ni `iron` (la barra
    // de pesas y la hidrante son de hierro). El lavarropas entra por su alias
    // `washer`.
    tags: ["laundry", "dryer", "airer", "hamper", "ironing", "pressing", "washer"],
    names: ["lavarropas", "lavadora"],
  },
  {
    slug: "tv",
    label: "TV",
    icon: Tv,
    // Televisor y Mueble de TV entran por el alias `tv`; la parlante, por
    // nombre. `instrument` suma los instrumentos de audio.
    tags: ["tv", "audio", "acoustics", "monitor", "instrument"],
    names: ["speaker", "parlante", "soundbar"],
    // La Computadora tiene el tag `monitor`, pero es la pantalla del PC: ese
    // Monitor vive en la sección PC.
    excludeIds: ["computer"],
  },
  {
    slug: "pc",
    label: "PC",
    icon: Monitor,
    // `office` fuera: también lo llevan la biblioteca y los libros. El
    // escritorio regulable y la silla Aeron entran por nombre.
    tags: ["computer", "desk", "workstation", "technology", "monitor"],
    names: ["escritorio", "silla aeron", "computadora", "teclado", "impresora"],
  },
];

/**
 * Un ítem pertenece al grupo si el matcher lo acepta y no está excluido.
 *
 * La exclusión va antes que todo: un `id` vetado no entra ni por categoría, ni
 * por tag, ni por nombre.
 */
export function matchesGroup(
  item: { id?: string; category?: string; tags?: string[]; name?: string },
  group: CatalogGroup
): boolean {
  if (item.id && group.excludeIds?.includes(item.id)) return false;
  if (group.category && item.category === group.category) return true;
  if (group.tags?.some((t) => (item.tags ?? []).includes(t))) return true;
  if (group.names?.some((n) => (item.name ?? "").toLowerCase().includes(n))) return true;
  return false;
}

/** `id` del ítem en `CATALOG_ITEMS` → nombre en español. */
const SPANISH_NAMES: Record<string, string> = {
  // Asientos
  sofa: "Sofá",
  "my-leather-couch-modp80ha": "Sofá de cuero",
  "lounge-chair": "Sillón",
  "livingroom-chair": "Sillón living",
  "dining-chair": "Silla de comedor",
  "office-chair": "Silla de oficina",
  stool: "Taburete",
  // Camas
  "single-bed": "Cama simple",
  "double-bed": "Cama doble",
  bunkbed: "Cama cucheta",
  "bedside-table": "Mesita de luz",
  // Mesas
  "coffee-table": "Mesa ratona",
  "dining-table": "Mesa de comedor",
  "office-table": "Escritorio",
  "standing-desk-mo8wgz95": "Escritorio regulable",
  // Roperos y estantes
  closet: "Ropero",
  dresser: "Cómoda",
  bookshelf: "Biblioteca",
  shelf: "Estante",
  "ikea-kallax-1x4-moa2y49n": "Kallax 2x4",
  "coat-rack": "Perchero",
  // Cocina
  kitchen: "Cocina",
  "kitchen-cabinet": "Mueble de cocina",
  "kitchen-counter": "Mesada de cocina",
  "wooden-kitchen-bar-moa2hhh4": "Barra de cocina",
  "kitchen-shelf": "Estante de cocina",
  fridge: "Heladera",
  stove: "Cocina",
  microwave: "Microondas",
  hood: "Campana",
  // Baño
  toilet: "Inodoro",
  "toilet-paper": "Papel higiénico",
  "bathroom-sink": "Lavabo",
  bathtub: "Banheira",
  // Ducha
  "shower-square": "Ducha cuadrada",
  "shower-angle": "Ducha de esquina",
  // Lavadora
  "washing-machine": "Lavarropas",
  // TV
  television: "Televisor",
  "tv-stand": "Mueble de TV",
  // PC
  computer: "Computadora",
  "herman-miller-aeron-mo8x36k9": "Silla Aeron",
};

/** Sinónimos de búsqueda en español: ampliar el término también trae el inglés. */
const SEARCH_ALIASES: Record<string, string[]> = {
  sofa: ["sofa", "sillon", "living"],
  "my-leather-couch-modp80ha": ["cuero", "sofa"],
  "lounge-chair": ["sillon", "living"],
  "livingroom-chair": ["sillon", "living"],
  "dining-chair": ["silla", "comedor"],
  "office-chair": ["silla", "oficina", "pc"],
  stool: ["taburete", "banqueta"],
  "single-bed": ["cama", "simple", "individual"],
  "double-bed": ["cama", "doble", "matrimonio"],
  bunkbed: ["cama", "cucheta", "dormitorio"],
  "bedside-table": ["mesita", "luz", "cama"],
  "coffee-table": ["mesa", "ratona", "living"],
  "dining-table": ["mesa", "comedor"],
  "office-table": ["escritorio", "pc", "trabajo"],
  "standing-desk-mo8wgz95": ["escritorio", "altura", "pc"],
  closet: ["ropero", "placard", "armario"],
  dresser: ["comoda", "ropero"],
  bookshelf: ["biblioteca", "librero", "estante"],
  shelf: ["estante", "repisa"],
  "ikea-kallax-1x4-moa2y49n": ["kallax", "librero", "ikea"],
  "coat-rack": ["perchero", "abrigos"],
  kitchen: ["cocina", "amueblada"],
  "kitchen-cabinet": ["mueble", "cocina", "alacena"],
  "kitchen-counter": ["mesada", "cocina", "meson"],
  "wooden-kitchen-bar-moa2hhh4": ["barra", "cocina"],
  "kitchen-shelf": ["estante", "cocina"],
  fridge: ["heladera", "nevera", "refrigerador"],
  stove: ["cocina", "horno", "anafe"],
  microwave: ["microondas", "horno"],
  hood: ["campana", "extractora", "cocina"],
  toilet: ["inodoro", "sanitario", "bano"],
  "toilet-paper": ["papel", "higienico", "bano"],
  "bathroom-sink": ["lavabo", "bacha", "bano"],
  bathtub: ["banheira", "bano"],
  "shower-square": ["ducha", "cuadrada"],
  "shower-angle": ["ducha", "esquina"],
  "washing-machine": ["lavarropas", "lavadora", "washer"],
  television: ["tv", "televisor", "tele"],
  "tv-stand": ["mueble", "tv", "televisor"],
  computer: ["pc", "computadora", "escritorio"],
  "herman-miller-aeron-mo8x36k9": ["silla", "aeron", "oficina", "pc"],
};

type CatalogSource = (typeof CATALOG_ITEMS)[number];

/**
 * Catálogo completo con nombre en español y alias de búsqueda.
 *
 * Se parte de los 111 ítems que trae el paquete y el recorte a las 10
 * categorías lo hace el panel, filtrando con `matchesGroup`. Los ítems que no
 * caen en ninguna categoría quedan en la lista pero no se renderizan.
 */
export const CATALOG_ES_ITEMS = CATALOG_ITEMS.map((source) => {
  const aliases = SEARCH_ALIASES[source.id] ?? [];
  return {
    ...source,
    name: SPANISH_NAMES[source.id] ?? source.name,
    tags: [...(source.tags ?? []), ...aliases],
  };
});

/** Índice por id para resolver un grupo de una vez. */
export const CATALOG_BY_ID = new Map(CATALOG_ES_ITEMS.map((i) => [i.id, i]));
