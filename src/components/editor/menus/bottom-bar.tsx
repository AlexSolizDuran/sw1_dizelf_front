"use client";

import { CameraActions } from "./camera-actions";
import { ModeBar } from "./mode-bar";
import { ReferencesControl } from "./references-control";
import s from "../editor.module.css";

/**
 * Barra flotante de abajo: modos · referencias · cámara.
 *
 * Mismo lugar y mismo orden que el `ActionMenu` del paquete, que queda oculto
 * por CSS (`.shell :global(div.fixed.bottom-6)`) porque no hay prop para
 * apagarlo. Los tres grupos disparan exactamente los mismos actions de store.
 */
export function BottomBar() {
  return (
    <div className={s.bottomBar}>
      <ModeBar />
      <div className={s.bottomDivider} />
      <ReferencesControl />
      <div className={s.bottomDivider} />
      <CameraActions />
    </div>
  );
}