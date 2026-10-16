import { ICON_PATHS, type IconNode } from "./icon-paths";

const COLOR = "#2b2a28";

/** El icono `Box` de lucide, usado cuando el nombre pedido no está mapeado. */
const FALLBACK: IconNode = ICON_PATHS.item ?? [];

/**
 * Arma el markup de un icono lucide.
 *
 * Replica lo que hace el componente `<Icon>` del paquete (mismo `viewBox`,
 * grosor y terminaciones) para que el SVG se vea idéntico al del set. No se usa
 * `react-dom/server` porque Next lo prohíbe en un route handler.
 */
function renderIcono(node: IconNode): string {
  const inner = node
    .map(([tag, attrs]) => {
      const atributos = Object.entries(attrs)
        .map(([clave, valor]) => `${clave}="${valor}"`)
        .join(" ");
      return `<${tag} ${atributos} />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/**
 * Sirve el SVG del icono pedido.
 *
 * El paquete pide `/icons/algo.webp`; el `rewrite` de `next.config.ts` trae la
 * request acá con el nombre (incluida la extensión). Se descarta la extensión y
 * se devuelve el SVG cacheado de forma agresiva. Esto evita el 404 (y la imagen
 * rota) del badge del cursor 2D y del overlay 3D, que pintan el asset del tool
 * activo con `<img>`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await params;
  const clave = name.replace(/\.(webp|svg|png)$/i, "");
  const node = ICON_PATHS[clave] ?? FALLBACK;

  return new Response(renderIcono(node), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
