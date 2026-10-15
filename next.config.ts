import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // El entry point de @pascal-app/editor es TypeScript crudo:
  //   "exports": { ".": "./src/index.tsx" }
  // Sin transpilarlo, Turbopack no lo procesa y el build falla. Los otros tres
  // ya vienen compilados en dist/, pero se incluyen por completitud.
  transpilePackages: [
    "@pascal-app/core",
    "@pascal-app/editor",
    "@pascal-app/viewer",
    "@pascal-app/nodes",
    "@pascal-app/lingo",
  ],

  // `@pascal-app` carga sus íconos con <img src="/icons/algo.webp"> y este
  // proyecto no tiene esos `.webp`. Se-atendían con un rewrite + route handler
  // que generaba SVG desde lucide; hoy sobra: de los 37 iconos que pide el
  // paquete, en esta interfaz solo llega uno — el cursor de pintura, en
  // `material-paint` — y está como archivo estático en `public/icons/`.
  //
  // El resto vino reemplazado por lucide directo (`icons/glyphs.tsx`) o nunca
  // se renderiza: el árbol del panel de Sitio y el rail usan los tabs que le
  // pasamos en `sidebarTabs`, y el catálogo usa `icons/registry-patch.tsx`.
  //
  // La extensión sigue siendo `.webp` porque es la que pide el paquete, así que
  // hay que corregir el Content-Type: el archivo contiene SVG.
  async headers() {
    return [
      {
        source: "/icons/:archivo",
        headers: [{ key: "Content-Type", value: "image/svg+xml; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
