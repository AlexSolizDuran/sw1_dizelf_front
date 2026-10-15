"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/use-auth-store";
import { useProjectStore } from "@/stores/use-project-store";
import { EditorShell } from "@/components/editor/editor-shell";

/**
 * Puerta de entrada al editor.
 *
 * El guard es de cliente, igual que en `/proyectos`: no hay lectura de cookie
 * en servidor, así que la sesión solo se conoce después de hidratar. Es un
 * redirect que se ve un instante, y queda como deuda.
 */
export function EditorLoader({ proyectoId }: { proyectoId: string }) {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuthStore();
  const cargar = useProjectStore((st) => st.cargar);
  const proyecto = useProjectStore((st) => st.proyecto);
  const error = useProjectStore((st) => st.error);

  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let vivo = true;
    void cargar(proyectoId).finally(() => {
      if (vivo) setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [isAuthenticated, cargar, proyectoId]);

  if (!isInitialized || !isAuthenticated) {
    return <PantallaCarga texto="Verificando sesión…" />;
  }

  if (cargando) {
    return <PantallaCarga texto="Abriendo proyecto…" />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FAF7F2] px-6 text-center">
        <p className="text-sm font-semibold text-[#8C432A]">No se pudo abrir el proyecto</p>
        <p className="max-w-sm text-xs leading-relaxed text-[#7A6D63]">{error}</p>
        <button
          className="mt-2 border border-[#DDD5CB] px-4 py-2 text-xs font-medium text-[#5A4E46] hover:bg-[#F9F7F5]"
          onClick={() => router.push("/proyectos")}
          type="button"
        >
          Volver a mis proyectos
        </button>
      </div>
    );
  }

  return (
    <EditorShell
      nombreProyecto={proyecto?.nombre ?? "Proyecto"}
      proyectoId={proyectoId}
    />
  );
}

function PantallaCarga({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF7F2]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#F2E8E2] border-t-[#8C432A]" />
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#7A6D63]">
        {texto}
      </p>
    </div>
  );
}
