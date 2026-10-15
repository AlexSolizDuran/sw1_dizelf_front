import type { NextConfig } from "next";

/**
 * Base del backend. Tiene que coincidir con `src/lib/api.ts`: si el CSP
 * bloquea la URL real, `connect-src` corta las llamadas al backend y el síntoma
 * es un error de red que no se parece a nada del front.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Orígenes de assets de terceros.
 *
 * Son dos y distintos, y el CSP tiene que contemplating los dos:
 *  - El bucket de Supabase: thumbnails y modelos `.glb` del catálogo de
 *    muebles, con URLs ya absolutas hardcodeadas en el paquete.
 *  - `editor.pascal.app`: el CDN por defecto de `@pascal-app/viewer`, del que
 *    salen las texturas y los assets de la biblioteca de materiales
 *    (`asset-url.js`, sobre `NEXT_PUBLIC_ASSETS_CDN_URL`).
 */
const ASSETS_ORIGIN = "https://byrpxoiotywskoojsrzd.supabase.co";
const ASSETS_CDN = process.env.NEXT_PUBLIC_ASSETS_CDN_URL || "https://editor.pascal.app";

/**
 * CSP del sitio.
 *
 * `script-src` y `style-src` necesitan `'unsafe-inline'`: Next inyecta el
 * payload de hidratación en `<script>` inline y Tailwind v4 emite los estilos
 * como `<style>` inline en dev. Una CSP estricta con nonce exigiría un
 * `middleware.ts` que lo inyecte; lo que sí se cierra acá, sobre un árbol que
 * ya no tiene sinks de inyección (`dangerouslySetInnerHTML`, `innerHTML`, `eval`
 * y `JSON.parse` de datos remotos dan 0 en `src/`), es:
 *
 *   frame-ancestors 'none' → nada de clickjacking sobre el editor
 *   object-src 'none'     → ni <object>/<embed>/plugins
 *   base-uri 'self'        → un <base> inyectado no puede redigir las URLs
 *   form-action 'self'     → un formulario inyectado no puede postear afuera
 *   connect-src            → la exfiltración vía fetch se limita a lo de arriba
 *
 * `connect-src` lleva los dos orígenes de assets y no solo el backend: los
 * `.glb` y las texturas los baja `GLTFLoader`/`TextureLoader` con `fetch`, no
 * con `<img>`, así que un CSP que los dejara solo en `img-src` rompería el
 * catálogo de muebles y la biblioteca de materiales en silencio.
 */
const CSP = [
  "default-src 'self'",
  `connect-src 'self' ${API_BASE_URL} ${ASSETS_ORIGIN} ${ASSETS_CDN}`,
  `img-src 'self' data: blob: ${ASSETS_ORIGIN} ${ASSETS_CDN}`,
  `font-src 'self' data: ${ASSETS_CDN}`,
  // Las imágenes guía del editor se sirven como blob: y some los .glb y las
  // texturas salen de los orígenes de arriba.
  `media-src 'self' blob: ${ASSETS_ORIGIN}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // El decodificador draco del visor 3D es WebAssembly.
].join("; ");

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
      // Cabeceras de seguridad para todo el sitio, landing y editor alike.
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Redundante con `frame-ancestors`, pero cubre clientes viejos.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // El editor solo necesita WebGL: cámara, micrófono y geolocalización
          // se niegan para que un script inyectado no pueda pedir permisos.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
