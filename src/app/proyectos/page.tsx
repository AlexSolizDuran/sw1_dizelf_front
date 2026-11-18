"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { IaCreationBar } from "@/components/features/proyectos/ia-creation-bar";
import { ProyectosGrid } from "@/components/features/proyectos/proyectos-grid";
import { ProyectosEstados } from "@/components/features/proyectos/proyectos-estados";
import { CrearProyectoModal } from "@/components/features/proyectos/crear-proyecto-modal";
import { GestionarProyectoModal } from "@/components/features/proyectos/gestionar-proyecto-modal";
import { HelpAssistant } from "@/components/ayuda/help-assistant";
import { useAuthStore } from "@/stores/use-auth-store";
import { useProyectosStore } from "@/stores/use-proyectos-store";
import { useUiProyectosStore } from "@/stores/use-ui-proyectos-store";

/**
 * Dashboard "Mis Proyectos": barra IA + grilla de proyectos con menú de 3
 * puntos, paginación y estados de carga/error/vacío.
 *
 * La restauración de sesión la hace `SessionProvider` en el layout raíz; acá
 * solo se redirige si ya se sabe que no hay sesión y se cargan los proyectos.
 */
export default function ProyectosPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const { proyectos, total, pagina, limite, isLoading, error, cargar } =
    useProyectosStore();
  const {
    crearAbierto,
    crearModo,
    abrirCrear,
    cerrarCrear,
    gestionarId,
    cerrarGestionar,
  } = useUiProyectosStore();

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      void cargar(1);
    }
  }, [isInitialized, isAuthenticated, cargar]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2A28]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#7A6D63]">Verificando sesión...</p>
        </main>
        <Footer />
      </div>
    );
  }

  const hayProyectos = proyectos.length > 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const creados = proyectos.filter((p) => p.miRol === "CREADOR");
  const colaboraciones = proyectos.filter((p) => p.miRol !== "CREADOR");

  const nuevoDiseno = () => {
    abrirCrear("normal");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2A28]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-[#ECE5DD]">
          <div>
            <h1 className="text-3xl font-extrabold text-[#6A3825]">
              Mis Proyectos
            </h1>
            <p className="mt-1 text-sm text-[#7A6D63]">
              {user
                ? `Bienvenido, ${user.persona?.nombre || user.username}. Administra tus diagramas y diseños.`
                : "Administra tus diagramas y diseños."}
            </p>
          </div>
          <Button
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={nuevoDiseno}
          >
            Nuevo diseño
          </Button>
        </div>

        <div className="mt-8">
          <IaCreationBar />
        </div>

        <section aria-label="Proyectos">
          <ProyectosEstados
            isLoading={isLoading}
            error={error}
            vacio={!isLoading && !error && !hayProyectos}
            onRetry={() => void cargar(pagina)}
            onCrear={nuevoDiseno}
          />

          {!isLoading && !error && hayProyectos && (
            <div className="space-y-12">
              <section aria-label="Mis proyectos">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-[#2B2A28]">
                    Mis proyectos
                  </h2>
                  <p className="mt-1 text-xs text-[#7A6D63]">
                    Proyectos que creaste vos.
                  </p>
                </div>
                {creados.length > 0 ? (
                  <ProyectosGrid proyectos={creados} />
                ) : (
                  <p className="rounded-xl border border-dashed border-[#E5DFD7] bg-white/60 px-4 py-10 text-center text-xs text-[#7A6D63]">
                    {totalPaginas > 1
                      ? "No hay proyectos creados por vos en esta página."
                      : "Todavía no creaste ningún proyecto. Usá la barra de arriba para generar uno."}
                  </p>
                )}
              </section>

              <section aria-label="Proyectos donde colaboro">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-[#2B2A28]">
                    Compartidos conmigo
                  </h2>
                  <p className="mt-1 text-xs text-[#7A6D63]">
                    Proyectos de otras personas donde sos colaborador.
                  </p>
                </div>
                {colaboraciones.length > 0 ? (
                  <ProyectosGrid proyectos={colaboraciones} />
                ) : (
                  <p className="rounded-xl border border-dashed border-[#E5DFD7] bg-white/60 px-4 py-10 text-center text-xs text-[#7A6D63]">
                    {totalPaginas > 1
                      ? "No hay proyectos compartidos con vos en esta página."
                      : "Todavía no te compartieron ningún proyecto."}
                  </p>
                )}
              </section>
            </div>
          )}

          {totalPaginas > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || isLoading}
                onClick={() => void cargar(pagina - 1)}
              >
                Anterior
              </Button>
              <span className="text-xs text-[#7A6D63]">
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas || isLoading}
                onClick={() => void cargar(pagina + 1)}
              >
                Siguiente
              </Button>
            </div>
          )}
        </section>
      </main>

      <HelpAssistant usuarioId={user?.id ?? null} />
      <Footer />

      <CrearProyectoModal
        open={crearAbierto}
        onClose={cerrarCrear}
        modoInicial={crearModo}
      />
      <GestionarProyectoModal
        proyectoId={gestionarId}
        onClose={cerrarGestionar}
      />
    </div>
  );
}
