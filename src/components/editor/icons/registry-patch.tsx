"use client";

import type { IconRef } from "@pascal-app/core";
import { loadPlugin, nodeRegistry } from "@pascal-app/core";
import { builtinPlugin } from "@pascal-app/nodes";
import type { ComponentType, SVGProps } from "react";
import { KIND_ICON } from "./glyphs";
import type { LucideIcon } from "lucide-react";

/**
 * Sustituye los iconos webp del registro por los de lucide-react.
 *
 * `@pascal-app/nodes` declara `icon: { kind: 'url', src: '/icons/wall.webp' }`
 * en sus definiciones, y el paquete las renderiza en el menú flotante de
 * acciones y en el menú de acciones del plano 2D. `IconRefGlyph` —el
 * renderizador compartido— ya soporta `kind: 'component'`, así que alcanza con
 * reescribir `presentation.icon`: no hay que tocar el paquete.
 *
 * El loader se cachea por tipo porque `IconRefGlyph` memoriza el `React.lazy`
 * por identidad de función: si cada corrida del parche generara un closure
 * nuevo, el icono se remontaría en cada lectura.
 */
const loaders = new Map<string, () => Promise<{ default: ComponentType }>>();

function loaderPara(kind: string): () => Promise<{ default: ComponentType }> {
  const cached = loaders.get(kind);
  if (cached) return cached;

  const loader = async () => {
    const { KIND_ICON: mapa } = await import("./glyphs");
    const Icon = mapa[kind] ?? KIND_ICON[kind];
    // `1em` en vez del tamaño por defecto de lucide (24px): el contenedor
    // del menú fija el tamaño con su propia tipografía y así el glifo se
    // acomoda en lugar de desbordar.
    return {
      default: function Glyph(props: SVGProps<SVGSVGElement>) {
        return <Icon width="1em" height="1em" {...props} />;
      },
    };
  };

  loaders.set(kind, loader);
  return loader;
}

function parchearIcono(icono: IconRef): boolean {
  return icono.kind === "url" || icono.kind === "iconify";
}

export function patchRegistryIcons(): number {
  let patched = 0;
  for (const [kind, def] of nodeRegistry.entries()) {
    const presentation = def?.presentation;
    if (!presentation?.icon) continue;
    if (!KIND_ICON[kind] && !parchearIcono(presentation.icon)) continue;
    presentation.icon = { kind: "component", module: loaderPara(kind) };
    patched++;
  }
  return patched;
}

/**
 * Registra los tipos de nodo y reemplaza sus iconos.
 *
 * Idempotente: `loadPlugin` ignora un plugin ya cargado y el parche vuelve a
 * fijar el mismo loader cacheado, así que llamarlo dos veces no remonta nada.
 */
export function bootstrapRegistry(): Promise<number> {
  return loadPlugin(builtinPlugin).then(() => patchRegistryIcons());
}

/** Un icono suelto para un tipo, fuera del registro. */
export function iconForKind(kind: string): LucideIcon | undefined {
  return KIND_ICON[kind];
}
