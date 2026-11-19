/**
 * De la medición del plano a las líneas del presupuesto.
 *
 * Una `LineaBorrador` es lo que el usuario ve y edita en el panel antes de
 * mandar nada. Todavía no tiene precio de tienda: eso lo resuelve el backend al
 * crear el presupuesto. Lo único que puede traer es `precioManualBs`, si el
 * usuario lo escribe.
 */
import { getCatalogMaterialById } from "@pascal-app/core";
import { materialLabel } from "@/lib/material-labels";
import type { LineaEntrada } from "@/types/presupuesto";
import { indexarCatalogo, type MaterialCatalogo } from "./catalogo";
import { medirNivel, type MedicionNivel } from "./medicion";
import { COEFICIENTES, RECETA_PINTURA } from "./recetas";

export interface LineaBorrador extends LineaEntrada {
  /** Clave local para editar/borrar sin depender del índice. */
  id: string;
  material: MaterialCatalogo;
  /** Supuesto con el que se calculó la cantidad, si vino de una receta. */
  supuesto?: string;
  /**
   * Identidad de la sugerencia para volver a medir sin duplicarla.
   *
   * Las líneas comunes usan la clave del material, pero la pintura emite una
   * línea por color con la MISMA `claveMaterial` (`pintura_latex`). Sin una
   * clave propia, el panel las colapsaría en una sola al re-medir.
   */
  claveSugerencia?: string;
}

/** Clave del único producto de pintura del catálogo del backend. */
const PINTURA_CLAVE = "pintura_latex";

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
  "cielo_raso",
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
  supuesto?: string,
  opciones?: { descripcion?: string; claveSugerencia?: string }
): LineaBorrador {
  return {
    id: nuevoId(),
    claveMaterial: material.clave,
    categoria: material.categoria,
    descripcion: opciones?.descripcion ?? material.nombre,
    unidad: material.unidad,
    cantidad,
    material,
    supuesto,
    ...(opciones?.claveSugerencia
      ? { claveSugerencia: opciones.claveSugerencia }
      : {}),
  };
}

/**
 * Una línea de pintura por color elegido.
 *
 * La superficie sale solo de las caras pintadas (`wall.slots`), nunca del muro
 * completo: si el usuario pintó una pared de un ambiente, el presupuesto no
 * compra pintura para las otras. La cantidad se redondea hacia arriba a
 * galones enteros porque no se compra medio galón.
 */
export function sugerirPintura(
  medicion: MedicionNivel,
  catalogo: MaterialCatalogo[]
): LineaBorrador[] {
  const material = indexarCatalogo(catalogo).get(PINTURA_CLAVE);
  if (!material || medicion.pintura.length === 0) return [];

  return medicion.pintura.flatMap((color) => {
    const galones = Math.ceil(
      (color.areaM2 * RECETA_PINTURA.manos) / RECETA_PINTURA.rendimientoM2PorGalon
    );
    if (galones <= 0) return [];

    const etiquetaCatalogo = color.materialId
      ? getCatalogMaterialById(color.materialId)?.label
      : undefined;
    const nombre = materialLabel(color.materialId ?? "", etiquetaCatalogo ?? color.ref);
    const metros = color.areaM2.toLocaleString("es-BO", {
      maximumFractionDigits: 2,
    });

    return [
      borradorDe(
        material,
        galones,
        `${RECETA_PINTURA.supuesto} · ${metros} m².`,
        {
          descripcion: `Látex interior — ${nombre}`,
          claveSugerencia: `${PINTURA_CLAVE}:${color.ref}`,
        }
      ),
    ];
  });
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
    m2_techo: medicion.areaTechoM2,
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

  return [...lineas, ...sugerirPintura(medicion, catalogo)];
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
