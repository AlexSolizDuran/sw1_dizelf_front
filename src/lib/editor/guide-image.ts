import {
  type AnyNodeId,
  type GuideNode as GuideNodeType,
  saveAsset,
  useScene,
} from "@pascal-app/core";

/**
 * Crea un nodo de imagen guía a partir de un archivo local.
 *
 * El archivo se guarda en IndexedDB con `saveAsset` y queda referenciado por
 * una URL de objeto local: **no sube nada al backend**. Es exactamente el
 * comportamiento del `lib/local-guide-image.ts` del paquete, que tampoco está
 * exportado.
 *
 * Los escaneos `.glb` son otra historia: esos necesitan un `uploadHandler`
 * que registre la aplicación host, y hoy nadie lo registra (no hay endpoint de
 * subida en el backend). Por eso el control de referencias los muestra
 * deshabilitados en vez de ofrecer un botón que no hace nada.
 */
export function nombreDeGuia(nombreArchivo: string): string {
  const limpio = nombreArchivo.trim();
  if (!limpio) return "Imagen guía";

  const punto = limpio.lastIndexOf(".");
  return punto > 0 ? limpio.slice(0, punto) : limpio;
}

export async function crearGuiaLocal({
  archivo,
  nivelId,
  posicion = [0, 0, 0],
}: {
  archivo: File;
  nivelId: string;
  posicion?: [number, number, number];
}): Promise<{ id: string }> {
  const url = await saveAsset(archivo);
  const createNode = useScene.getState().createNode;

  // El registro valida contra su schema: `guide` con nombre, url y defaults.
  const guia = {
    type: "guide" as const,
    name: nombreDeGuia(archivo.name),
    url,
    position: posicion,
    rotation: [0, 0, 0] as [number, number, number],
    scale: 1,
    opacity: 50,
  };

  // `createNode` no devuelve nada, así que el id se recupera del store: es el
  // único nodo `guide` con esa url.
  createNode(guia as unknown as GuideNodeType, nivelId as AnyNodeId);

  const creado = Object.values(useScene.getState().nodes).find(
    (n) => n?.type === "guide" && (n as { url?: string }).url === url
  );

  return { id: String(creado?.id ?? "") };
}