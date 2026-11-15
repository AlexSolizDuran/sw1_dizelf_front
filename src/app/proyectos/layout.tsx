/**
 * Segmento de `/proyectos`.
 *
 * El `dynamic` va acá y no en `page.tsx` porque ese archivo es `"use client"`,
 * y Next no lee los exports de configuración de ruta (`dynamic`,
 * `revalidate`…) desde un módulo cliente: el `force-dynamic` se ignoraba en
 * silencio y la página seguía saliendo como `○ (Static)`.
 *
 * Sin esto, la ruta se prerenderizaba y el CDN cacheaba el HTML —con el
 * "Cargando proyectos…" y el formulario de "Registrarse"— para servirlo a
 * cualquiera, crawler incluido. No filtra datos porque el fetch es del cliente,
 * pero una página detrás de sesión no debería salir del build como estática.
 */
export const dynamic = "force-dynamic";

export default function ProyectosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}