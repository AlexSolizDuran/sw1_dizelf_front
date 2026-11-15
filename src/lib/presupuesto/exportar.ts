/**
 * Exportación del presupuesto a CSV y a PDF.
 *
 * CSV: se descarga desde el navegador, con BOM y separador `;` para que Excel
 * en español abra las columnas de una y no coma decimales como texto.
 *
 * PDF: no hay dependencia de generación de PDF en el proyecto, y agregar una
 * (jsPDF + fuentes) por un documento que el navegador ya sabe imprimir no se
 * justifica. Se abre una ventana con el presupuesto maquetado y se dispara el
 * diálogo de impresión: de ahí sale "Guardar como PDF". La ventana se arma con
 * nodos del DOM, no con `document.write` de HTML crudo, para no inyectar texto
 * del usuario sin escapar.
 */
import type { Presupuesto } from "@/types/presupuesto";
import { formatearCantidad, formatearFecha, formatearMoneda } from "./formato";

function nombreArchivo(presupuesto: Presupuesto): string {
  const fecha = new Date(presupuesto.fecha);
  const iso = Number.isNaN(fecha.getTime())
    ? "sin-fecha"
    : fecha.toISOString().slice(0, 10);
  const slug = presupuesto.nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `presupuesto-${iso}${slug ? `-${slug}` : ""}`;
}

/**
 * Escapa un campo para CSV.
 *
 * Se entrecomilla si trae el separador, comillas o saltos de línea, y las
 * comillas internas se duplican (regla de RFC 4180).
 */
function campoCsv(valor: string | number | null | undefined): string {
  // `undefined` aparece cuando la línea no trae fuente (pendiente): celda vacía.
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[";\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

const COLUMNAS_CSV = [
  "Categoría",
  "Descripción",
  "Unidad",
  "Cantidad",
  "Precio unitario (Bs)",
  "Subtotal (Bs)",
  "Origen",
  "Proveedor",
  "SKU",
  "Precio capturado",
  "URL",
  "Pendiente",
  "Nota",
];

export function presupuestoACsv(presupuesto: Presupuesto): string {
  const filas: (string | number | null | undefined)[][] = [COLUMNAS_CSV];

  for (const linea of presupuesto.lineas) {
    filas.push([
      linea.categoria,
      linea.descripcion,
      linea.unidad,
      linea.cantidad,
      linea.precioUnitarioBs,
      linea.subtotalBs,
      linea.origen,
      linea.fuente?.proveedor,
      linea.fuente?.sku,
      linea.fuente?.capturadoEn ? formatearFecha(linea.fuente.capturadoEn) : null,
      linea.fuente?.url,
      linea.pendiente ? "SÍ" : "NO",
      linea.nota,
    ]);
  }

  // El total va en una fila aparte: si fuera una columna más, cualquier suma en
  // la planilla lo contaría dos veces.
  filas.push([]);
  filas.push(["Total materiales (Bs)", presupuesto.totalMaterialesBs]);
  filas.push(["Total materiales (USD)", presupuesto.totalMaterialesUsd]);
  filas.push(["Tipo de cambio (Bs por USD)", presupuesto.tipoCambioUsd]);
  filas.push(["Líneas pendientes", presupuesto.lineasPendientes]);
  filas.push(["Receta", presupuesto.recetaVersion]);

  return filas.map((fila) => fila.map(campoCsv).join(";")).join("\r\n");
}

export function descargarCsv(presupuesto: Presupuesto): void {
  // BOM: sin él, Excel interpreta el archivo como ANSI y rompe tildes.
  const contenido = `\uFEFF${presupuestoACsv(presupuesto)}`;
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${nombreArchivo(presupuesto)}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  // El objeto se libera en el siguiente tick: revocarlo antes puede abortar la
  // descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ESTILOS_PDF = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #2b2a28; margin: 32px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #7a6d63; margin: 0 0 16px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #e5dfd7; padding: 6px 4px; text-align: left; vertical-align: top; }
  th { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #7a6d63; }
  .num { text-align: right; white-space: nowrap; }
  .pend { color: #b3261e; font-weight: 600; }
  .fuente { color: #7a6d63; font-size: 10px; }
  .totales { margin-top: 18px; display: flex; justify-content: flex-end; gap: 32px; }
  .total { text-align: right; }
  .total strong { display: block; font-size: 16px; }
  .total span { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #7a6d63; }
  .aviso { margin-top: 14px; border-left: 3px solid #b3261e; padding: 6px 8px; font-size: 11px; background: #fdf1f0; }
  .pie { margin-top: 24px; color: #7a6d63; font-size: 10px; }
  @media print { body { margin: 12mm; } }
`;

function crearNodo<K extends keyof HTMLElementTagNameMap>(
  etiqueta: K,
  texto?: string,
  clase?: string
): HTMLElementTagNameMap[K] {
  const nodo = document.createElement(etiqueta);
  if (texto !== undefined) nodo.textContent = texto;
  if (clase) nodo.className = clase;
  return nodo;
}

/**
 * Abre el presupuesto en una ventana lista para imprimir o guardar como PDF.
 *
 * Devuelve `false` si el navegador bloqueó la ventana (pop-up blocker): el
 * panel lo muestra como error en vez de quedarse esperando algo invisible.
 */
export function imprimirPresupuesto(
  presupuesto: Presupuesto,
  nombreProyecto: string
): boolean {
  const ventana = window.open("", "_blank", "width=900,height=1000");
  if (!ventana) return false;

  const doc = ventana.document;
  doc.title = `${presupuesto.nombre} · ${nombreProyecto}`;

  const estilo = crearNodo("style", ESTILOS_PDF);
  doc.head.appendChild(estilo);

  const titulo = crearNodo("h1", presupuesto.nombre);
  const subtitulo = crearNodo(
    "p",
    `Proyecto: ${nombreProyecto} · Generado: ${formatearFecha(presupuesto.fecha)} · Tipo de cambio: Bs ${presupuesto.tipoCambioUsd} por USD · Receta ${presupuesto.recetaVersion}`,
    "sub"
  );
  doc.body.append(titulo, subtitulo);

  const tabla = crearNodo("table");
  const cabecera = crearNodo("thead");
  const filaCabecera = crearNodo("tr");
  for (const [texto, clase] of [
    ["Material", ""],
    ["Cantidad", "num"],
    ["P. unitario", "num"],
    ["Subtotal", "num"],
  ] as const) {
    filaCabecera.appendChild(crearNodo("th", texto, clase));
  }
  cabecera.appendChild(filaCabecera);
  tabla.appendChild(cabecera);

  const cuerpo = crearNodo("tbody");
  for (const linea of presupuesto.lineas) {
    const fila = crearNodo("tr");
    const celdaMaterial = crearNodo("td");
    celdaMaterial.appendChild(crearNodo("div", linea.descripcion));
    const referencia =
      linea.fuente?.proveedor && linea.fuente.tipo === "web"
        ? `${linea.fuente.proveedor}${linea.fuente.sku ? ` · SKU ${linea.fuente.sku}` : ""} · ${formatearFecha(linea.fuente.capturadoEn)}`
        : linea.pendiente
          ? "Sin precio de proveedor"
          : "Precio escrito a mano";
    celdaMaterial.appendChild(crearNodo("div", referencia, "fuente"));

    fila.appendChild(celdaMaterial);
    fila.appendChild(
      crearNodo("td", `${formatearCantidad(linea.cantidad)} ${linea.unidad}`, "num")
    );
    fila.appendChild(
      crearNodo("td", formatearMoneda(linea.precioUnitarioBs, "BOB"), "num")
    );
    const subtotal = crearNodo(
      "td",
      linea.pendiente ? "pendiente" : formatearMoneda(linea.subtotalBs, "BOB"),
      linea.pendiente ? "num pend" : "num"
    );
    fila.appendChild(subtotal);
    cuerpo.appendChild(fila);
  }
  tabla.appendChild(cuerpo);
  doc.body.appendChild(tabla);

  const totales = crearNodo("div", undefined, "totales");
  for (const [etiqueta, valor] of [
    ["Total en bolivianos", formatearMoneda(presupuesto.totalMaterialesBs, "BOB")],
    ["Total en dólares", formatearMoneda(presupuesto.totalMaterialesUsd, "USD")],
  ] as const) {
    const bloque = crearNodo("div", undefined, "total");
    bloque.appendChild(crearNodo("strong", valor));
    bloque.appendChild(crearNodo("span", etiqueta));
    totales.appendChild(bloque);
  }
  doc.body.appendChild(totales);

  if (presupuesto.lineasPendientes > 0) {
    doc.body.appendChild(
      crearNodo(
        "p",
        `${presupuesto.lineasPendientes} ${presupuesto.lineasPendientes === 1 ? "línea queda" : "líneas quedan"} sin precio y no ${presupuesto.lineasPendientes === 1 ? "suma" : "suman"} al total. Escribí un precio para incluirlas.`,
        "aviso"
      )
    );
  }

  doc.body.appendChild(
    crearNodo(
      "p",
      "Solo materiales. Los precios son los que cada tienda publica en la fecha indicada y pueden cambiar; las cantidades derivadas del plano son estimaciones de consumo, no un cómputo de obra certificado.",
      "pie"
    )
  );

  ventana.focus();
  ventana.print();
  return true;
}
