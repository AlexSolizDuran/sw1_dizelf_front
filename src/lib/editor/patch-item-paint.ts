import { type ItemNode, nodeRegistry } from "@pascal-app/core";
import type { ComponentType } from "react";
import { createItemPaintSlotsRenderer } from "@/components/editor/item-paint-slots";

type ItemRenderer = ComponentType<{ node: ItemNode }>;

/**
 * Parchea el renderer de `item` del plugin integrado para que los modelos cuyos
 * materiales no usan `slot_` también sean pintables desde el panel de
 * materiales. No modifica `node_modules`: sustituye el módulo lazy del registro
 * antes de que el editor monte el visor.
 *
 * Es idempotente y se cachea por módulo, igual que `React.lazy`, para no
 * reemplazar el componente en cada llamada (eso provocaría un remontaje del
 * GLB). Llamar después de `loadPlugin(builtinPlugin)`.
 */
let parcheAplicado = false;

export function patchItemPaintSlots(): void {
  if (parcheAplicado) return;
  const def = nodeRegistry.get("item");
  const renderer = def?.renderer;
  if (!renderer || renderer.kind !== "parametric") return;

  const moduloOriginal = renderer.module;
  let moduloParcheado: ReturnType<typeof moduloOriginal> | undefined;

  renderer.module = () => {
    if (!moduloParcheado) {
      moduloParcheado = moduloOriginal().then((modulo) => {
        const Original = modulo.default as unknown as ItemRenderer;
        return {
          ...modulo,
          default: createItemPaintSlotsRenderer(Original),
        } as unknown as Awaited<ReturnType<typeof moduloOriginal>>;
      });
    }
    return moduloParcheado;
  };

  parcheAplicado = true;
}
