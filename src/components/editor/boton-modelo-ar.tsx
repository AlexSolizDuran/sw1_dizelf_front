"use client";

import { useCallback, useState } from "react";
import { Boxes } from "lucide-react";
import { exportarGlbDelProyecto } from "@/lib/ar/glb";
import {
  apiConfirmarModelo,
  apiMetaModelo,
  apiUrlSubidaModelo,
  subirGlbConProgreso,
  AVISO_MODELO_BYTES,
  LIMITE_MODELO_BYTES,
} from "@/lib/ar/modelo-ar";
import type { MetaModeloAr } from "@/types/ar";
import { Popover, PopoverBody, PopoverTrigger } from "./menus/ui/popover";
import s from "./editor.module.css";

type Fase = "idle" | "generando" | "subiendo" | "confirmando";

const TEXTO_FASE: Record<Exclude<Fase, "idle">, string> = {
  generando: "Generando GLB…",
  subiendo: "Subiendo…",
  confirmando: "Confirmando…",
};

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Publica el GLB que consume la experiencia de AR.
 *
 * UN SOLO BOTÓN PARA CREAR Y ACTUALIZAR
 * -------------------------------------
 * No hay "crear" y "actualizar" separados: si el proyecto ya tiene modelo, el
 * mismo botón lo reemplaza (pide confirmación) y el backend sube la versión. El
 * binario va directo al bucket con una URL prefirmada; acá solo se orquesta
 * generar → subir → confirmar.
 *
 * El peso se mide antes de subir: por encima del tope del backend el `PUT`
 * sería tiempo perdido, y por encima del presupuesto de móvil conviene avisar
 * aunque se permita.
 */
export function BotonModeloAr({ proyectoId }: { proyectoId: string }) {
  const [meta, setMeta] = useState<MetaModeloAr | null>(null);
  const [fase, setFase] = useState<Fase>("idle");
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ocupado = fase !== "idle";

  const cargarMeta = useCallback(async () => {
    try {
      setMeta(await apiMetaModelo(proyectoId));
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo leer el estado del modelo."
      );
    }
  }, [proyectoId]);

  const publicar = useCallback(async () => {
    if (ocupado) return;

    if (meta?.hay) {
      const continuar = window.confirm(
        `Ya hay un modelo publicado (v${meta.version}). Se va a reemplazar por la escena actual y el anterior se borra del almacenamiento. ¿Continuar?`
      );
      if (!continuar) return;
    }

    setError(null);
    setAviso(null);
    setProgreso(0);

    try {
      setFase("generando");
      const glb = await exportarGlbDelProyecto();
      const bytes = glb.size;

      if (bytes > LIMITE_MODELO_BYTES) {
        throw new Error(
          `El modelo pesa ${megabytes(bytes)} y el máximo es ${megabytes(LIMITE_MODELO_BYTES)}. Simplificá materiales o texturas y volvé a intentar.`
        );
      }

      setFase("subiendo");
      const { url, clave } = await apiUrlSubidaModelo(proyectoId);
      await subirGlbConProgreso(url, glb, setProgreso);

      setFase("confirmando");
      const publicada = await apiConfirmarModelo(proyectoId, clave, bytes);
      setMeta(publicada);

      setAviso(
        bytes > AVISO_MODELO_BYTES
          ? `Publicado v${publicada.version}, pero pesa ${megabytes(bytes)}: en un móvil puede tardar en cargar.`
          : `Publicado v${publicada.version}.`
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo publicar el modelo."
      );
    } finally {
      setFase("idle");
      setProgreso(0);
    }
  }, [meta, ocupado, proyectoId]);

  const estadoModelo = !meta
    ? "Consultando…"
    : meta.hay
      ? `Publicado v${meta.version} · ${megabytes(meta.bytes)} · ${fecha(meta.actualizado)}`
      : "Sin modelo AR publicado";

  return (
    <Popover>
      {({ abierto }) => (
        <>
          <PopoverTrigger
            className={s.iconBtn}
            label="Modelo de realidad aumentada"
            onClick={() => {
              if (!abierto) void cargarMeta();
            }}
          >
            <Boxes className="h-3.5 w-3.5" />
          </PopoverTrigger>

          <PopoverBody Icon={Boxes} titulo="Modelo AR">
            <div className="flex flex-col gap-2">
              <p className={s.hint}>{estadoModelo}</p>

              {/* `matBtn` se estira dentro de un contenedor flex; se lo envuelve
                  para que ocupe el ancho del panel, no el alto. */}
              <div className="flex">
                <button
                  className={s.matBtn}
                  disabled={ocupado}
                  onClick={() => void publicar()}
                  type="button"
                >
                  {ocupado
                    ? TEXTO_FASE[fase as Exclude<Fase, "idle">]
                    : meta?.hay
                      ? "Actualizar GLB de AR"
                      : "Generar y publicar GLB"}
                </button>
              </div>

              {fase === "subiendo" && (
                <div
                  aria-label="Progreso de la subida"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(progreso * 100)}
                  className="h-1 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  style={{ backgroundColor: "var(--border)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-150"
                    style={{
                      width: `${Math.round(progreso * 100)}%`,
                      backgroundColor: "var(--primary)",
                    }}
                  />
                </div>
              )}

              {error && (
                <p className={s.popoverError} role="alert">
                  {error}
                </p>
              )}

              {aviso && <p className={s.hint}>{aviso}</p>}

              <p className={s.hint}>
                Un solo GLB por proyecto: si volvés a publicar, este se
                reemplaza. La app de AR lo descarga de Neon, sin actualizar la
                app.
              </p>
            </div>
          </PopoverBody>
        </>
      )}
    </Popover>
  );
}
