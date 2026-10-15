"use client";

import { usePresencia, type Presente } from "@/hooks/use-presencia";
import { useAuthStore } from "@/stores/use-auth-store";
import s from "./editor.module.css";

/**
 * Quién más está en el plano.
 *
 * Solo muestra los demás: la persona que mira el componente ya sabe que está
 * ahí. Si hay un LECTOR, se distingue del resto porque su posición no se está
 * moviendo —no está editando— y el ícono lo dice.
 */
export function IndicadorPresencia({ proyectoId }: { proyectoId: string }) {
  const miUsuarioId = useAuthStore((st) => st.user?.id);
  const { conectados, reconectando, error } = usePresencia(proyectoId);

  const otros = conectados.filter((p) => p.usuarioId !== miUsuarioId);

  if (error) {
    return (
      <span className={s.presencia} title={error}>
        <span className={s.presenciaPunto} data-estado="error" />
        Sin sesión compartida
      </span>
    );
  }

  if (otros.length === 0) {
    return (
      <span
        className={s.presencia}
        title={
          reconectando
            ? "Conectando con el servidor…"
            : "Nadie más está en este plano ahora mismo."
        }
      >
        <span className={s.presenciaPunto} data-estado={reconectando ? "idle" : "solo"} />
        Solo vos
      </span>
    );
  }

  return (
    <span
      className={s.presencia}
      title={otros
        .map((p) => `${p.nombre}${p.puedeEditar ? "" : " · solo lectura"}`)
        .join("\n")}
    >
      <span className={s.presenciaPunto} data-estado="varios" />
      {otros.length === 1 ? (
        <Iniciales presente={otros[0]} />
      ) : (
        `${otros.length} en el plano`
      )}
    </span>
  );
}

/** Iniciales del avatar, para un nombre corto. */
function Iniciales({ presente }: { presente: Presente }) {
  const partes = presente.nombre.trim().split(/\s+/);
  const iniciales = (partes[0]?.[0] ?? "?") + (partes[1]?.[0] ?? "");
  return (
    <span className={s.presenciaAvatar}>
      {iniciales.toUpperCase()}
      {!presente.puedeEditar && (
        <span className={s.presenciaLector} title="Permiso de solo lectura" />
      )}
    </span>
  );
}