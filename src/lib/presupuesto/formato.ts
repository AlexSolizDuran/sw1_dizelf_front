/**
 * Formato de números y fechas para el panel.
 *
 * Los montos llegan como string decimal. Acá se convierten a número SOLO para
 * mostrarlos: sumar en coma flotante es lo que produce el error de centavos, y
 * los totales ya vienen calculados con `Decimal` desde el backend.
 */
import type { Moneda } from "@/types/presupuesto";

const SIMBOLO: Record<Moneda, string> = {
  BOB: "Bs",
  USD: "US$",
};

/** "9404.96" → "Bs 9.404,96". */
export function formatearMoneda(
  valor: string | number | null | undefined,
  moneda: Moneda
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return "—";

  return `${SIMBOLO[moneda]} ${new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero)}`;
}

/**
 * Pasa un monto en bolivianos a la moneda de vista.
 *
 * El presupuesto guarda todo en Bs y congela la tasa, así que mostrar en USD es
 * dividir por esa tasa congelada. Es SOLO presentación: el subtotal oficial
 * sigue siendo el de la base y el total en USD ya viene calculado por el
 * backend con la misma tasa.
 */
export function convertirMonto(
  valor: string | number | null | undefined,
  moneda: Moneda,
  tipoCambioUsd: string | number
): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return null;
  if (moneda === "BOB") return numero;

  const tasa = typeof tipoCambioUsd === "number" ? tipoCambioUsd : Number(tipoCambioUsd);
  if (!Number.isFinite(tasa) || tasa <= 0) return null;
  return numero / tasa;
}

/** "1800.000" → "1.800"; "84.500" → "84,5". */
export function formatearCantidad(valor: string | number): string {
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return "—";

  return new Intl.NumberFormat("es-BO", {
    maximumFractionDigits: 3,
  }).format(numero);
}

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Lee un número escrito por el usuario.
 *
 * Acepta coma o punto como separador decimal, y el formato con miles
 * ("1.234,56"): si aparecen los dos, el último es el decimal.
 */
export function numeroDesdeTexto(texto: string): number | null {
  let limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return null;

  /**
   * Deja `decimal` como separador decimal y borra `miles`.
   * Se define acá para escribir `limpio` una sola vez.
   */
  const limpiarMiles = (decimal: "," | ".", miles: "," | ".") => {
    const posDecimal = limpio.lastIndexOf(decimal);
    const enteros = limpio.slice(0, posDecimal).split(miles).join("");
    const decimales = limpio.slice(posDecimal + 1).split(miles).join("");
    limpio = `${enteros}.${decimales}`;
  };

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");

  if (ultimaComa > -1 && ultimoPunto > -1) {
    if (ultimaComa > ultimoPunto) limpiarMiles(",", ".");
    else limpiarMiles(".", ",");
  } else if (ultimaComa > -1) {
    // Sin puntos: la coma es decimal.
    limpio = limpio.replace(/,/g, ".");
  } else {
    const puntos = (limpio.match(/\./g) ?? []).length;
    // "1.234.567" (varios puntos) o "1.500" (un punto y exactamente tres
    // dígitos detrás): puntos de miles, sin parte decimal. En español "1.500"
    // es mil quinientos, no uno coma cinco; los decimales se escriben con coma.
    const esMiles =
      puntos > 1 || (puntos === 1 && /^\d{1,3}\.\d{3}$/.test(limpio));
    if (esMiles) limpio = limpio.replace(/\./g, "");
  }

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}
