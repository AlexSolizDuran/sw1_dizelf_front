"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/use-auth-store";

/**
 * Único dueño de la restauración de sesión.
 *
 * `checkSession()` es lo único que pone `isInitialized: true`. Antes lo llamaba
 * `Navbar`, y como `Navbar` solo se monta en `/` y `/proyectos`, abrir
 * `/editor/[proyectoId]` directo —con F5, un enlace compartido o una pestaña
 * nueva— dejaba `isInitialized` en `false` para siempre y la ruta se quedaba en
 * "Verificando sesión…" sin llegar a redirigir ni a cargar el editor. No era un
 * flash de redirect: era un cuelgue.
 *
 * Montado en el layout raíz, cubre las cuatro rutas y deja de importar si la
 * página tiene o no un Navbar.
 *
 * El flag `isInitialized` hace que la llamada ocurra una sola vez: mientras la
 * petición está en vuelo sigue en `false`, y varios montar en el mismo render
 * (App Router hidrata el layout una vez, pero unStrictMode en dev monta dos)
 * podrían disparar dos `GET /auth/perfil`. Se usa un ref para que el segundo
 *StrictMode se salte.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    if (isInitialized) return;
    void checkSession();
  }, [isInitialized, checkSession]);

  return <>{children}</>;
}