import type { NextConfig } from "next";

/**
 * Origen real del backend. SOLO servidor/build: no se expone al navegador.
 *
 * Es la base del proxy same-origin (`rewrites`) y la fuente de la URL del
 * WebSocket. Tiene que estar definido en BUILD, igual que antes
 * `NEXT_PUBLIC_API_URL`: el destino de un rewrite se hornea en el build, no se
 * resuelve en runtime.
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3001").replace(
  /\/+$/,
  ""
);

/**
 * Prefijo del proxy HTTP. El navegador habla con el MISMO origen que la página
 * y Next reenvía a `BACKEND_URL`.
 *
 * POR QUÉ: en producción la cookie de sesión la emite el backend sin `Domain`,
 * así que queda host-only de `*.onrender.com`. El route handler de `/api/ia/*`
 * corre en Vercel y nunca la recibía → "Tu sesión venció" con el usuario
 * logueado. Pasando el login por el proxy, el `Set-Cookie` lo emite el dominio
 * del front y la cookie vuelve a estar donde se lee.
 */
const API_PROXY_PATH = "/api/backend";

/**
 * El MISMO origen del backend, pero con esquema de WebSocket.
 *
 * ESTO NO ES COSMÉTICO. `connect-src` evalúa la URL del WebSocket tal cual, con
 * `ws://` o `wss://`, así que listar `http://api` NO habilita `ws://api`. Sin
 * esta línea el navegador bloquea el handshake de socket.io y toda la
 * colaboración —presencia y sincronización— queda muerta sin ningún error en el
 * código: el CSP solo aparece en la consola.
 *
 * Se deriva de `BACKEND_URL` en vez de pedir otra variable (`NEXT_PUBLIC_WS_URL`):
 * ese valor ya está disponible en build, y `env` lo inlinea en el bundle igual
 * que un `NEXT_PUBLIC_*`. Vercel no puede proxear WebSockets, así que el socket
 * va directo y se autentica con un ticket de corta duración.
 */
const API_WS_URL = BACKEND_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

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
 * Origen del almacenamiento de modelos AR (Neon Object Storage).
 *
 * El GLB no se sube a través del backend: el editor pide una URL prefirmada y
 * el navegador hace el `PUT` DIRECTO contra el bucket, porque el proxy de
 * Vercel corta los cuerpos grandes. Es otro origen, así que sin esta línea en
 * `connect-src` el navegador aborta el `PUT` antes de enviar el primer byte y
 * el síntoma es el mensaje genérico "No se pudo conectar con el almacenamiento
 * del modelo. Revisá tu conexión" — una violación de CSP, no un problema de
 * red. En el panel de red se ve la petición con 0 bytes transferidos.
 *
 * Se hornea en el build como el resto del CSP: si cambia, hay que REDEPLOYAR.
 * Opcional: si falta, el editor funciona igual salvo publicar el modelo AR.
 */
const MODELOS_ORIGIN = (process.env.MODELOS_ORIGIN || "").replace(/\/+$/, "");

if (process.env.NEXT_PHASE === "phase-production-build" && !MODELOS_ORIGIN) {
  console.warn(
    "[CSP] Falta MODELOS_ORIGIN: la subida del GLB de AR va a quedar bloqueada " +
      "por connect-src. Cargala (host del bucket, sin '/' final) y volvé a construir."
  );
}

/**
 * `'unsafe-eval'` hace falta TAMBIÉN en producción.
 *
 * En desarrollo React lo necesita para Fast Refresh, HMR y callstacks. Pero en
 * producción lo exige el transcoder KTX2 de las texturas: `basis_transcoder.js`
 * (Emscripten) llama a `new Function` al inicializar el worker del `KTX2Loader`.
 * Sin la directiva, el worker del blob hereda este CSP, el `new Function` lanza
 * `EvalError` y **todas** las texturas `.ktx2` fallan en silencio: los materiales
 * de la biblioteca (madera, piedra, baldosa…) no pintan y la superficie queda
 * blanca. Los colores funcionan porque no llevan mapa. Es el síntoma que
 * aparecía solo en Vercel y no en `next dev`.
 *
 * `wasm-unsafe-eval` NO lo cubre: es una directiva distinta, solo para compilar
 * WebAssembly.
 */

/**
 * Fotos de producto del presupuesto de materiales.
 *
 * Las tarjetas del catálogo muestran la foto que publica la tienda que cotiza
 * ese material, hotlinkeada desde su CDN (la URL la sirve el backend junto con
 * el precio; no se copian los archivos). Son dos orígenes porque el catálogo
 * mezcla una tienda WooCommerce (`constructorbolivia.com`) con una Shopify
 * (`cdn.shopify.com`, de donde cuelga la ferretería Morales). Los manuales, en
 * cambio, son `'self'`: salen de `public/materiales/*.svg`.
 *
 * Solo `img-src`: no son `fetch`, son `<img>`.
 */
const TIENDAS_IMG = [
  "https://www.constructorbolivia.com",
  "https://cdn.shopify.com",
].join(" ");

/**
 * CSP del sitio.
 *
 * `script-src` y `style-src` necesitan `'unsafe-inline'`: Next inyecta el
 * payload de hidratación en `<script>` inline y Tailwind v4 emite los estilos
 * como `<style>` inline en dev. `'unsafe-eval'` va en dev y en prod: React lo
 * exige para Fast Refresh y el transcoder KTX2 lo exige siempre (ver arriba).
 * Una CSP estricta con nonce exigiría un
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
 *   `MODELOS_ORIGIN` → subida del GLB de AR con `PUT` prefirmado (ver arriba).
 */
const CSP = [
  "default-src 'self'",
  `connect-src 'self' data: ${API_WS_URL} ${ASSETS_ORIGIN} ${ASSETS_CDN} ${DRACO_CDN} ${KTX2_CDN} ${ICONIFY_ORIGINS} ${MODELOS_ORIGIN}`.replace(/ +/g, " "),
  `img-src 'self' data: blob: ${ASSETS_ORIGIN} ${ASSETS_CDN} ${TIENDAS_IMG}`,
  `font-src 'self' data: ${ASSETS_CDN}`,
  // Las imágenes guía del editor se sirven como blob: y some los .glb y las
  // texturas salen de los orígenes de arriba.
  `media-src 'self' blob: ${ASSETS_ORIGIN}`,
  `worker-src 'self' blob: ${KTX2_CDN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // El decodificador draco del visor 3D es WebAssembly.
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,

  /**
   * Marca de la actualización de seguridad aplicada por `next upgrade`.
   * Next lo usa para no volver a sugerir la misma actualización.
   */
  experimental: { agentUpgrade: "security" },

  /**
   * `NEXT_PUBLIC_WS_URL` la calcula este archivo, no el panel de Vercel.
   *
   * `env` inlinea el valor en el bundle del cliente igual que un `NEXT_PUBLIC_*`
   * de `.env`. Así no hay una variable nueva que configurar: sale de
   * `BACKEND_URL`, que ya existe y ya se necesita en build.
   */
  env: { NEXT_PUBLIC_WS_URL: API_WS_URL },

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
  //
  // `/api/backend/*` va en `beforeFiles` para que nada del filesystem le gane:
  // es el proxy al backend (HTTP same-origin, cookie del dominio del front).
  async rewrites() {
    return {
      beforeFiles: [
        { source: `${API_PROXY_PATH}/:path*`, destination: `${BACKEND_URL}/:path*` },
      ],
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
          // El editor solo necesita WebGL. La cámara y la geolocalización se
          // niegan para que un script inyectado no pueda pedir permisos; el
          // micrófono se habilita para el mismo origen porque el asistente
          // incluye dictado por voz (`/api/ia/transcribe`).
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
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
