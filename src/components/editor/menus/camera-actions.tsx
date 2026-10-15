"use client";

import { LayoutPanelTop, Orbit } from "lucide-react";
import { emitter } from "@pascal-app/core";
import { useEditor } from "@pascal-app/editor";
import s from "../editor.module.css";

/**
 * Acciones de cámara: girar la vista a la izquierda, girarla a la derecha y
 * ver desde arriba.
 *
 * Réplica de `action-menu/camera-actions.tsx`. Se emiten los mismos eventos del
 * `emitter` de `@pascal-app/core`; la vista superior se oculta en 2D porque
 * inclina una cámara 3D que no está a la vista.
 *
 * Iconos: el original usa `rotate.webp` espejado para el par izquierdo/derecho.
 * Ese par de flechas circulares opuestas se lee como deshacer/rehacer, así que
 * se reemplaza por `Orbit`, que dibuja un cuerpo girando alrededor de un centro
 * (el movimiento real del orbit). `Vista desde arriba` usaba `Scan`, el mismo
 * glifo que `ReferencesControl` para escanear guías: se cambia a
 * `LayoutPanelTop`, que no colisiona con nada más de la barra.
 */
export function CameraActions() {
  const solo2d = useEditor((st) => st.viewMode === "2d");

  return (
    <div className="flex items-center gap-1">
      <button
        aria-label="Girar la vista a la izquierda"
        className={s.menuBtn}
        onClick={() => emitter.emit("camera-controls:orbit-ccw")}
        title="Girar la vista a la izquierda"
        type="button"
      >
        <Orbit className="h-5 w-5 scale-x-[-1]" />
      </button>

      <button
        aria-label="Girar la vista a la derecha"
        className={s.menuBtn}
        onClick={() => emitter.emit("camera-controls:orbit-cw")}
        title="Girar la vista a la derecha"
        type="button"
      >
        <Orbit className="h-5 w-5" />
      </button>

      {!solo2d ? (
        <button
          aria-label="Ver desde arriba"
          className={s.menuBtn}
          onClick={() => emitter.emit("camera-controls:top-view")}
          title="Ver desde arriba"
          type="button"
        >
          <LayoutPanelTop className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}