/**
 * De la medición del plano a las líneas del presupuesto.
 *
 * Una `LineaBorrador` es lo que el usuario ve y edita en el panel antes de
 * mandar nada. Todavía no tiene precio de tienda: eso lo resuelve el backend al
 * crear el presupuesto. Lo único que puede traer es `precioManualBs`, si el
 * usuario lo escribe.
 */
import type { LineaEntrada } from "@/types/presupuesto";
import { indexarCatalogo, type MaterialCatalogo } from "./catalogo";
import { medirNivel, type MedicionNivel } from "./medicion";
import { COEFICIENTES } from "./recetas";

export interface LineaBorrador extends LineaEntrada {
  /** Clave local para editar/borrar sin depender del índice. */
  id: string;
  material: MaterialCatalogo;
  /** Supuesto con el que se calculó la cantidad, si vino de una receta. */
  supuesto?: string;
}

/**
 * Materiales que se sugieren al medir, en el orden en que se leen en obra:
 * primero la estructura del muro, después las aberturas y por último los
 * acabados. El porcelanato queda afuera a propósito: sugerir cerámica y
 * porcelanato a la vez duplicaría el mismo piso.
 */
const SUGERIBLES = [
  "ladrillo_6h",
  "cemento_ip30_50kg",
  "puerta_interior",
  "ventana_corrediza",
  "cerradura_externa",
  "ceramica_piso",
];

let contador = 0;

function nuevoId(): string {
  contador += 1;
  return `linea-${Date.now().toString(36)}-${contador}`;
}

/**
 * Entero hacia arriba: no se compra media bolsa ni un cuarto de ladrillo.
 *
 * Solo se aplica a materiales que se venden por unidad entera (`pza`, `bolsa`).
 * Lo que se mide por m² o m³ conserva sus decimales.
 */
function aEnteroSuperior(valor: number): number {
  return Math.ceil(valor);
}

export function borradorDe(
  material: MaterialCatalogo,
  cantidad: number,
  supuesto?: string
): LineaBorrador {
  return {
    id: nuevoId(),
    claveMaterial: material.clave,
    categoria: material.categoria,
    descripcion: material.nombre,
    unidad: material.unidad,
    cantidad,
    material,
    supuesto,
  };
}

/**
 * Líneas sugeridas para un nivel medido.
 *
 * Cada cantidad sale de un coeficiente de `recetas.ts` y se informa el supuesto
 * en la línea: el usuario puede aceptar la sugerencia o corregirla, pero ve de
 * dónde salió el número. Las líneas con cantidad cero no se agregan.
 */
export function sugerirLineas(
  medicion: MedicionNivel,
  catalogo: MaterialCatalogo[]
): LineaBorrador[] {
  const porClave = indexarCatalogo(catalogo);

  const valores: Record<string, number> = {
    m2_muro_neto: medicion.areaMuroNetaM2,
    m2_piso: medicion.areaPisoM2,
    puertas: medicion.puertas,
    ventanas: medicion.ventanas,
  };

  const lineas: LineaBorrador[] = [];

  for (const clave of SUGERIBLES) {
    const material = porClave.get(clave);
    const receta = COEFICIENTES[clave];
    if (!material || !receta) continue;

    const base = valores[receta.base] ?? 0;
    if (base <= 0) continue;

    const crudo = base * receta.factor;
    const cantidad = receta.redondear
      ? aEnteroSuperior(crudo)
      : Math.round(crudo * 100) / 100;

    lineas.push(borradorDe(material, cantidad, receta.supuesto));
  }

  return lineas;
}

/** Atajo para el panel: mide y devuelve las líneas sugeridas. */
export function medirYSugerir(
  nodes: Parameters<typeof medirNivel>[0],
  nivelId: string | null,
  nivelNombre: string,
  catalogo: MaterialCatalogo[]
): { medicion: MedicionNivel; lineas: LineaBorrador[] } {
  const medicion = medirNivel(nodes, nivelId, nivelNombre);
  return { medicion, lineas: sugerirLineas(medicion, catalogo) };
}
