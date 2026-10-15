"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import s from "../../editor.module.css";

/**
 * Popover del editor, con los tokens del CSS Module.
 *
 * Se apoya en `@radix-ui/react-popover` (declarado explícitamente en
 * `package.json`) por lo que ya resuelve: cierre con Escape, click fuera,
 * retorno del foco al disparador y el ARIA para lectores de pantalla.
 *
 * `side="top"` por defecto porque estos paneles se abren desde una barra que
 * está pegada al borde inferior de la pantalla.
 */

export function Popover({
  children,
}: {
  children: (api: { abierto: boolean; setAbierto: (v: boolean) => void }) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <PopoverPrimitive.Root onOpenChange={setAbierto} open={abierto}>
      {children({ abierto, setAbierto })}
    </PopoverPrimitive.Root>
  );
}

export function PopoverTrigger({
  children,
  className,
  label,
  ...props
}: {
  children: ReactNode;
  className?: string;
  label: string;
} & React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>) {
  return (
    <PopoverPrimitive.Trigger
      aria-label={label}
      className={className}
      title={label}
      {...props}
    >
      {children}
    </PopoverPrimitive.Trigger>
  );
}

export function PopoverBody({
  children,
  titulo,
  Icon,
}: {
  children: ReactNode;
  titulo: string;
  Icon?: LucideIcon;
}) {
  return (
    // **Sin `PopoverPrimitive.Portal` a propósito.** El portal por defecto
    // manda el contenido a `document.body`, que queda fuera del subárbol de
    // `.shell` — y ahí es donde están los tokens (`--background`, `--border`…).
    // El panel saldría sin fondo ni bordes. Renderizado en el lugar, hereda
    // los tokens; el posicionamiento lo calcula igual floating-ui.
    <PopoverPrimitive.Content
      align="center"
      className={s.popover}
      side="top"
      sideOffset={12}
    >
      <div className={s.popoverHead}>
        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
        <span className={s.popoverTitle}>{titulo}</span>
      </div>
      {children}
      <PopoverPrimitive.Arrow className={s.popoverArrow} />
    </PopoverPrimitive.Content>
  );
}

/** Chevron del botón partido: gira cuando el panel está abierto. */
export function PopoverChevron({ abierto }: { abierto: boolean }) {
  return (
    <ChevronDown
      className={`h-3 w-3 transition-transform ${abierto ? "rotate-180" : ""}`}
    />
  );
}