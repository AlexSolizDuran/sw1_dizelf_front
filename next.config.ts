import type { NextConfig } from "next";

/**
 * Base del backend. Tiene que coincidir con `src/lib/api.ts`: si el CSP
 * bloquea la URL real, `connect-src` corta las llamadas al backend y el síntoma
 * es un error de red que no se parece a nada del front.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * El MISMO origen del backend, pero con esquema de WebSocket.
 *
 * ESTO NO ES COSMÉTICO. `connect-src` evalúa la URL del WebSocket tal cual, con
 * `ws://` o `wss://`, así que listar `http://api` NO habilita `ws://api`. Sin
 * esta línea el navegador bloquea el handshake de socket.io y toda la
 * colaboración —presencia y sincronización— queda muerta sin ningún error en el
 * código: el CSP solo aparece en la consola.
 *
 * Se Vera del `NEXT_PUBLIC_API_URL` en vez de hardcodear `ws://localhost:*`,
 * porque el backend de producción es https y necesita `wss`.
 */
const API_WS_URL = API_BASE_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

/**
 * Orígenes de assets de terceros.
 *
 * Son dos y distintos, y el CSP tiene que contemplating los dos:
 *  -  - El bucket de Supabase: thumbnails y modelos `.glb` del catálogo de
 *    muebles, con URLs ya absolutas hardcodeadas en el paquete.
 *  - `editor.pascal.app`: el CDN por defecto de `@pascal-app/viewer`, del que
 *    salen las texturas y los assets de la biblioteca de materiales
 *    (`asset-url.js`, sobre `NEXT_PUBLIC_ASSETS_CDN_URL`).
 */
const ASSETS_ORIGIN = "https://byrpxoiotywskoojsrzd.supabase.co";
const ASSETS_CDN = process.env.NEXT_PUBLIC_ASSETS_CDN_URL || "https://editor.pascal.app";

/**
 * CDN del decodificador Draco.
 *
 * Casi toda la geometría del editor (muebles del catálogo y el banderín de
 * medición del sitio) viene comprimida con `KHR_draco_mesh_compression`. Tanto
 * `@pascal-app/nodes` (`dist/item/renderer.js`) como drei (`useGLTF(url, true)`
 * en el editor) hacen `DRACOLoader.setDecoderPath(...)` sobre esta URL, así que
 * el loader baja `draco_wasm_wrapper.js` y `draco_decoder.wasm` con `fetch`.
 *
 * Sin este origen en `connect-src` el navegador corta esas dos descargas y el
 * síntoma es un `Failed to fetch` al abrir cualquier modelo comprimido, no un
 * mensaje que apunte al CSP.
 */
const DRACO_CDN = "https://www.gstatic.com";

/**
 * CDN del transcoder KTX2/Basis.
 *
 * Las texturas comprimidas (`.ktx2`, sobre todo las de acabados del catálogo y
 * algunos GLB) las transcodifica `KTX2Loader` con el WASM de Basis, que el
 * viewer apunta a jsdelivr (`lib/ktx2-loader.js`:
 * `setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/')`).
 *
 * El loader baja el wrapper/WASM con `fetch` (→ `connect-src`) y levanta un
 * `Worker` para transcodificar (→ `worker-src`). Faltando el origen, las texturas
 * comprimidas no cargan y el material queda roto.
 */
const KTX2_CDN = "https://cdn.jsdelivr.net";

/**
 * API de iconos de Iconify.
 *
 * `@pascal-app/editor` pinta buena parte de su HUD con `@iconify/react` (el
 * panel de atajos contextual, los chips de snapping, los badges del cursor…),
 * y ese runtime baja el JSON de cada set con `fetch` desde el primer host que
 * responde de esta lista (los otros dos son los fallbacks que el propio paquete
 * prueba en orden). Sin estos orígenes en `connect-src` cada icono queda en
 * blanco: no hay error en el código, solo una violación de CSP en la consola.
 */
const ICONIFY_ORIGINS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com",
].join(" ");

/**
 * `'unsafe-eval'` solo en desarrollo.
 *
 * En `next dev`, React usa `eval()` para Fast Refresh, HMR y reconstruir
 * callstacks entre entornos; sin él el navegador lanza "eval() is not supported
 * in this environment" y la app no hidrata. `wasm-unsafe-eval` NO lo cubre: es
 * una directiva distinta, solo para compilar WebAssembly.
 *
 * En producción React nunca llama a `eval()`, así que prod queda sin la
 * directiva y el CSP sigue igual de estricto.
 */
const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * CSP del sitio.
 *
 * `script-src` y `style-src` necesitan `'unsafe-inline'`: Next inyecta el
 * payload de hidratación en `<script>` inline y Tailwind v4 emite los estilos
 * como `<style>` inline en dev. Además, en dev se agrega `'unsafe-eval'` (ver
 * `IS_DEV`) porque React lo exige para Fast Refresh; en prod no. Una CSP
 * estricta con nonce exigiría un
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
 * catálogo de muebles y la biblioteca de materiales en silencio. Además lleva:
 *
 *   `data:`       → el banderín de medición del sitio es un GLB embebido como
 *                   `data:model/gltf-binary;base64,…`; `fetch()` sobre un data
 *                   URI cae bajo `connect-src`.
 *   `DRACO_CDN`   → decoder Draco (ver arriba).
 *   `KTX2_CDN`    → transcoder KTX2 (ver arriba), también en `worker-src`.
 */
const CSP = [
  "default-src 'self'",
  `connect-src 'self' data: ${API_BASE_URL} ${API_WS_URL} ${ASSETS_ORIGIN} ${ASSETS_CDN} ${DRACO_CDN} ${KTX2_CDN} ${ICONIFY_ORIGINS}`,
  `img-src 'self' data: blob: ${ASSETS_ORIGIN} ${ASSETS_CDN}`,
  `font-src 'self' data: ${ASSETS_CDN}`,
  // Las imágenes guía del editor se sirven como blob: y some los .glb y las
  // texturas salen de los orígenes de arriba.
  `media-src 'self' blob: ${ASSETS_ORIGIN}`,
  `worker-src 'self' blob: ${KTX2_CDN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${IS_DEV ? " 'unsafe-eval'" : ""}`,
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
  // proyecto no tiene esos `.webp`. La mayoría de sus usos quedan reemplazados
  // por lucide directo (`icons/glyphs.tsx`) o nunca se renderizan (el árbol del
  // panel de Sitio y el rail usan los tabs que le pasamos en `sidebarTabs`, y el
  // catálogo usa `icons/registry-patch.tsx`).
  //
  // Pero NO todos: el badge del cursor 2D (`floorplan-cursor-indicator-overlay`)
  // y el overlay 3D sí pintan el `iconSrc` del tool activo, así que sin atender
  // esa ruta el badge queda con la imagen rota. `rewrites` manda `/icons/:name`
  // a un route handler que devuelve un SVG generado desde el mismo mapa lucide.
  //
  // Es `afterFiles` a propósito: `public/icons/paint.webp` es un archivo real y
  // tiene que ganarle al handler (si no, se pisa con el SVG genérico).
  async rewrites() {
    return {
      afterFiles: [{ source: "/icons/:name", destination: "/api/icons/:name" }],
    };
  },

  // El `Content-Type` de `paint.webp` se fija sobre el archivo exacto y no sobre
  // `/icons/:archivo`: aplicarlo a la carpeta entera hacía que cualquier `.webp`
  // real que se agregara ahí se sirviera como SVG y el navegador lo parseara con
  // ese parser. Los demás nombres los sirve `api/icons/[name]` ya con el header
  // correcto.
  async headers() {
    return [
      {
        source: "/icons/paint.webp",
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
