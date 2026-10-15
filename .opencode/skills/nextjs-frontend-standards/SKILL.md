---
name: nextjs-frontend-standards
description: Estándares de codificación, arquitectura y librerías instaladas para el frontend Next.js del editor de planos arquitectónicos 2D/3D colaborativo. Úsala siempre al crear o revisar componentes, páginas, hooks, llamadas al backend, o cualquier código dentro de este proyecto frontend. También consultar cuando se pregunte qué librería usar para algo (estado, íconos, HTTP, colaboración en tiempo real) o cómo integrar @pascal-app/editor / three.js / Yjs dentro de Next.js sin romper el build. Incluye los factores de calidad del software aplicados al frontend (correctitud, eficiencia, fiabilidad, usabilidad/accesibilidad, mantenibilidad/escalabilidad, seguridad/integridad, portabilidad).
---

# Estándares de frontend — Next.js (editor de planos 2D/3D)

## Stack instalado (versiones fijadas, verificadas en build real)

| Paquete | Versión | Rol |
|---|---|---|
| next | 16.3.x | Framework (App Router) |
| react / react-dom | 19.2.x | UI |
| typescript | 5.x | Tipado |
| @pascal-app/core | 0.9.2 | Registro de tipos de nodo, schema Zod, store de escena |
| @pascal-app/editor | 0.9.2 | Componente `<Editor>`: visor 2D/3D, herramientas, inspector |
| @pascal-app/viewer | 0.9.2 | Render three.js de la escena |
| @pascal-app/nodes | 0.1.1 | Los 43 tipos de nodo (muro, puerta, mueble, conducto…) |
| three | ^0.185.1 | Motor 3D. **No subir a 0.186**: el peer de @pascal-app pide `^0.185` |
| @react-three/fiber | ^9.7.0 | Binding de React a three.js |
| @react-three/drei | ^10.7.8 | Utilidades de three.js |
| yjs | 13.6.32 | CRDT — sincronización de estado colaborativo *(fase futura, no instalado)* |
| y-websocket | 2.1.0 | Cliente WebSocket para Yjs *(fase futura, no instalado)* |
| zustand | última estable | Estado global de la app (usuario, proyecto abierto) |
| lucide-react | última estable | **Único set de íconos.** Nada de webp ni de otro set |
| tailwindcss | 4.x | Estilos |

No agregar otra librería de estado (Redux, Recoil, Jotai), otro set de íconos, u otro motor de escena sin discutirlo antes — el objetivo es mantener el stack mínimo y ya validado.

> `yjs` y `y-websocket` **no están instalados todavía**. Se anotan acá porque la
> collaboratively en tiempo real es el objetivo, pero requiere antes un gateway
> WebSocket en el backend y una migración Prisma (ver más abajo).

## Regla no negociable: los cuatro configuration de @pascal-app

El paquete se integra en Next con ajustes que no son obvios. Si falta cualquiera, el síntoma es distinto en cada caso.

### 1. `transpilePackages` — sin esto el build falla

`@pascal-app/editor` publica **TypeScript crudo** como entry point:

```json
"exports": { ".": "./src/index.tsx" }
```

Node y Turbopack no lo procesan solos. En `next.config.ts`:

```ts
transpilePackages: [
  "@pascal-app/core", "@pascal-app/editor",
  "@pascal-app/viewer", "@pascal-app/nodes", "@pascal-app/lingo",
]
```

`@pascal-app/lingo` no se importa directo pero es dependencia de `editor`.

### 2. `@source` en `globals.css` — sin esto el editor monta sin CSS

Tailwind v4 no escanea `node_modules`. El editor se monta pero **todas** sus clases internas (`bg-sidebar`, `text-muted-foreground`, `border-border`…) no existen en el CSS generado, y el panel sale sin fondo ni colores.

```css
@import "tailwindcss";

@source "../../node_modules/@pascal-app/editor/src";
@source "../../node_modules/@pascal-app/nodes/dist";
@source "../../node_modules/@pascal-app/viewer/dist";
```

`@source` es una directiva de build: **no emite CSS**, así que no es una contaminación del global.

### 3. El paquete fija `.dark` en su propia raíz

`editor-layout-v2.tsx:251` renderiza:

```tsx
<div className="dark flex h-full w-full flex-col bg-sidebar text-foreground">
```

Ese `.dark` es fijo, no depende de nada. Por eso el `@custom-variant` del proyecto está atado a la **clase**, no al sistema operativo:

```css
@custom-variant dark (&:is(.dark *));
```

> Con el valor por defecto de Tailwind v4 (`prefers-color-scheme`), el editor se
> vería distinto según la máquina del usuario.

**Limitación conocida y aceptada**: unas 35 utilidades `dark:*` dentro del paquete (en 12 archivos) resuelven siempre al ramo oscuro porque su raíz lleva `.dark`. El tema oscuro del editor queda "medio oscuro". Se acepta; pelearlo sería más caro que el beneficio.

### 4. Iconos: hay que parchar el registro

`@pascal-app/nodes` declara sus iconos como rutas webp que **este proyecto no tiene**:

```js
// @pascal-app/nodes/dist/wall/definition.js
icon: { kind: 'url', src: '/icons/wall.webp' }
```

Son 24 rutas distintas, y el paquete las renderiza en el menú flotante de acciones y en el menú del plano 2D. Copiar los `.webp` del prototipo significaba heredar recursos gráficos de terceros.

La solución está en `src/components/editor/icons/registry-patch.ts`: `IconRef` es una unión discriminada y `IconRefGlyph` ya renderiza `kind: 'component'`, así que alcanza con **reescribir `presentation.icon`**. Las definiciones del registro **no están congeladas** (`Object.freeze` aparece 0 veces en `registry.js` ni en las definiciones de `nodes`).

```ts
for (const [kind, def] of nodeRegistry.entries()) {
  if (!KIND_ICON[kind] || !def?.presentation?.icon) continue;
  def.presentation.icon = { kind: "component", module: loaderPara(kind) };
}
```

**El loader se cachea por tipo**: `IconRefGlyph` memoriza el `React.lazy` por identidad de función, así que un closure nuevo en cada corrida remonta el icono.

### Reglas derivadas

- El registro debe estar listo **antes** de montar `<Editor>`: el shell lo carga con `bootstrapRegistry()` y recién entonces renderiza.
- Los glifos se renderizan con `width="1em"` para que el tamaño lo imponga el contenedor, no el default de lucide (24px).
- `"use client"` es obligatorio en todo `src/components/editor/`: three.js y los stores de Zustand del paquete necesitan el navegador.
- El paquete **ya trae autosave** con debounce de 1 s. No escribir un debounce propio: se conecta `onSave` / `onLoad` / `onSaveStatusChange`.
- `onSave` se llama también en `pagehide` / `beforeunload` con `{ keepalive: true }`. Hay que **reenviar esa opción** al `fetch` o se pierde la última edición. `apiClient` la propaga sola porque hace `...rest`.
- `use-auto-save.ts` bloquea el guardado si la escena cae de más de 4 nodos a ≤4 (`isSuspiciousNodeDrop`) y pone el estado en `error`. Hay que **mostrar ese error en la UI**: si no, parece que guardar no funciona.


## Autenticación — cookie httpOnly, no Bearer token

El proyecto usa una cookie `tokenAcceso` (httpOnly) para el JWT, seteada por el backend. **No se guarda el token en `localStorage` ni se manda por header `Authorization`.**

Consecuencias para el código del frontend:
- Nunca armar un interceptor de axios que agregue `Authorization: Bearer ...` — no aplica a este proyecto.
- Toda llamada al backend debe incluir credenciales explícitamente, porque frontend (Vercel) y backend (Render) están en dominios distintos:
  - Con `fetch`: `fetch(url, { credentials: "include" })`
  - Con axios: `axios.defaults.withCredentials = true` (o por request)
- Si una llamada autenticada responde 401/403, la petición sí llegó al backend: revisar que el backend tenga CORS configurado con `origin` exacto + `credentials: true` (nunca `*`), y que la cookie salga `SameSite=None; Secure` (env `COOKIE_SECURE=true`) para dominios distintos. Un bloqueo de CORS se ve como error de red en consola, no como 401.

## Estructura de carpetas

```
src/
├── app/                       ← rutas (App Router: carpeta = ruta)
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── proyectos/page.tsx     ← lista, crea y abre proyectos
│   ├── editor/[proyectoId]/   ← el editor
│   │   ├── page.tsx           ← Server: metadata
│   │   └── editor-loader.tsx  ← Client: guard de auth + carga del proyecto
│   └── layout.tsx
├── components/
│   ├── editor/                ← todo el editor. Ver su README.md
│   │   ├── editor.module.css  ← tokens + clases del editor (CSS Module)
│   │   ├── editor-shell.tsx   ← orquesta registro, tema, carga y guardado
│   │   ├── icons/             ← glifos lucide + parche del registro
│   │   └── *-tab.tsx          ← los 4 paneles laterales
│   ├── ui/                    ← componentes reutilizables (botones, inputs)
│   └── layout/                ← navbar, footer
├── lib/
│   ├── api.ts                 ← cliente HTTP (fetch con credentials: "include")
│   ├── auth.ts                ← endpoints de auth
│   ├── projects.ts            ← endpoints de proyecto
│   └── editor/                ← lógica del editor (node-fields, scene-json, catalog-es)
├── stores/                    ← Zustand (use-auth-store, use-project-store)
└── types/                     ← tipos compartidos (auth.ts, proyecto.ts)
```

## Convenciones de código

- **Componentes**: `PascalCase.tsx`, un componente por archivo, export default.
- **Hooks propios**: `useAlgo.ts`, siempre con prefijo `use`.
- **Tipos**: centralizados en `types/`. El documento de la escena vive en `types/proyecto.ts` como `DocumentoProyecto` — no duplicar su forma entre componentes.
- **Nada de lógica de negocio en componentes de UI**: transformar datos, llamar al backend, o mapear la escena va en `lib/` o hooks, no inline dentro del JSX.
- **Server Components por defecto**: solo agregar `"use client"` cuando el componente realmente necesita estado, efectos, o acceso al navegador. Excepción: **todo `src/components/editor/` es cliente** porque three.js y los stores del paquete lo exigen.
- **Stores con selectores finos**: `useAuthStore((s) => s.user)`, nunca `useAuthStore()` a secas. El store de auth también guarda el documento del proyecto pero **solo lo reemplaza al cargar**, nunca en cada guardado: `PATCH` devuelve el blob entero y guardarlo dispararía un render por segundo.

## Sistema de diseño (tokens)

### Tokens: dos capas, y por qué están separadas

`globals.css` y `editor.module.css` declaran los **mismos** nombres de token, en lugares distintos, a propósito.

**Capa 1 — `src/app/globals.css`.** Declara los *nombres* en `@theme inline`, sin valores, más la paleta de marca en `:root`. Es lo que usan la landing y las páginas de auth.

```css
@theme inline {
  --color-primary: var(--primary);   /* solo el mapeo, no el valor */
  --color-sidebar: var(--sidebar);
  /* … los 24 nombres que usa @pascal-app/editor */
}
```

**Capa 2 — `src/components/editor/editor.module.css`.** Declara los *valores* en `.shell` y `.shellDark`. Ninguna clase sale del editor.

Esto funciona por cómo se comporta `@theme inline`: hace que las utilidades resuelvan la variable **en el elemento**, no a través de `--color-*`. Consecuencia práctica: declarar `--primary` en `.shell` re-tematiza **todo** el subárbol, incluido el paquete de terceros, sin tocar `:root` y sin `!important`.

```
.shell      { --primary: #8c432a; --background: #faf7f2; … }   /* claro DIZELF */
.shellDark  { --primary: #c9886d; --background: #1c1b1a; … }   /* grafito cálido */
```

El tema del editor es una **propiedad del editor**, no del documento: el toggle cambia la clase del módulo y nunca toca `<html>`. Así el editor no puede contaminar la landing ni al revés.

**Reglas al tocar tokens:**

- **No declarar `--radius-*` en `@theme`.** El sitio usa `rounded-md/lg/xl/2xl` en toda la landing; declararlos pisa la escala por defecto de Tailwind y cambia páginas que ya funcionan. El editor define su propio `--radius` y lo aplica con selectores `:where()`.
- **`body` sigue con `font-family: Arial`** a propósito: es lo que renderiza el sitio hoy. Cambiarlo a `var(--font-sans)` pone Geist en toda la landing y es un cambio visual no pedido. El editor sí usa Geist, desde `.shell`.
- Paleta de marca: `#8C432A` (terracota, primary) · `#FAF7F2` (fondo) · `#2B2A28` (ink) · `#7A6D63` (muted) · `#E5DFD7` (borde) · `#F5ECE8` (accent). El editor usa exactamente la misma familia.
- Radios chicos (2–4px), bordes finos en vez de sombras, sin gradientes ni glow.
- Los overrides sobre los internos del paquete van **dentro** del CSS Module con escapes `:global()`, para que sigan scopeados:

```css
.shell :global(div.fixed.top-20.right-4.z-50) { display: none !important; }
.shell :where(button) { border-radius: var(--radius); }
```

El paquete usa `rounded-*` unas 363 veces, muchas fijas (`xl`, `2xl`, `[3px]`). Estas reglas viven fuera de `@layer utilities`, así que ganan por orden de cascada.

## Factores de calidad

Todo cambio debe evaluarse contra estos 7 factores. Son reglas concretas para el frontend; las reglas de servidor (autorización real, constraints de BD, transacciones) viven en la skill del backend.

| Factor | Reglas obligatorias |
|---|---|
| **1. Correctitud** | La UI refleja exactamente el modelo real de la escena; el documento guardado, el mostrado y el manifiesto para IA deben coincidir. `node-fields.ts` mapea campos del registro con rutas profundas (`["material","properties","roughness"]`): si una propiedad no existe, el campo sale vacío **y no tira error**. Al agregar un campo, verificar que exista en `nodeRegistry.get(kind).schema.shape`. El idioma de la UI del editor es español con **voseo**; el resto del sitio usa español neutro. No reimplementar en el front reglas de negocio que decide el backend. TypeScript estricto, sin `any`. |
| **2. Eficiencia** | Server Components por defecto; `dynamic(..., { ssr: false })` solo para lo que de verdad lo necesite. **El editor pesa ~1,6 MB gzip** (three.js + decodificador draco + el paquete entero). Eso está aisladísimo en su ruta: las páginas estáticas no cargan ni un chunk de three.js. Verificar con un grep sobre los chunks de la landing antes de romper el code-splitting. Evitar re-renders innecesarios: selectores finos en zustand. Los cambios del canvas NO deben provocar re-render de React por cada evento. El debounce de guardado ya lo trae el paquete (1 s) — no duplicarlo. Importar solo lo necesario de `lucide-react`. |
| **3. Fiabilidad** | Toda vista con datos remotos implementa estados de carga, error y vacío. Manejar fallo de red y caída del WebSocket de Yjs (cuando exista). Usar `error.tsx` / error boundaries. No asumir la forma de la respuesta del backend: `lib/api.ts` normaliza el error de NestJS, y `leerDocumento()` valida `esquemaJson` antes de usarlo. Mostrar el estado `error` del autosave: el paquete bloquea el guardado cuando la escena cae a ≤4 nodos y, sin avisar, parece roto. Limpieza completa en cada `useEffect`. |
| **4. Usabilidad** | Feedback inmediato en cada acción (cargando, guardado, error). Mensajes en español, sin códigos técnicos. Confirmación antes de acciones destructivas (borrar nodo o proyecto). `aria-label` en botones que solo tienen ícono. Contraste suficiente, foco visible, navegación por teclado. Diseño responsive **salvo el editor**, que exige pantalla grande (el panel de propiedades se oculta bajo 900px a propósito). Respetar los tokens. |
| **5. Mantenibilidad y escalabilidad** | Convenciones y estructura de esta skill. Componentes pequeños, sin lógica de negocio en el JSX. Tipos en un único lugar. Zustand solo para estado realmente global; el store del proyecto **no** guarda la escena enmutable (la posee el store interno del paquete y cambia en cada edición). Sin valores mágicos. **Toda clase del editor va en `editor.module.css`** con `styles.x`, nunca como string global. |
| **6. Seguridad e integridad** | Nunca guardar el token en `localStorage`. Ningún secreto en `NEXT_PUBLIC_*`. No usar `dangerouslySetInnerHTML`. Sanitizar nombres antes de mostrarlos. La validación del front es solo UX. **El bucket de assets es de terceros**: los modelos `.glb`, thumbnails y texturas del catálogo salen de un Supabase ajeno (`byrpxoiotywskoojsrzd`, del autor del paquete). Si se quiere dejar de depender de un tercero hay que servir los assets desde un bucket propio. Integridad: con Yjs nunca sobrescribir el estado remoto con estado local desactualizado. |
| **7. Portabilidad** | Sin URLs hardcodeadas: `NEXT_PUBLIC_API_URL`. Compatible con navegadores modernos. `npm run build` sin pasos manuales. Nota: el editor necesita **WebGL**; sin GPU disponible hay que avisar al usuario, no dejar la pantalla en negro. |


**Conflicto entre factores:** priorizar correctitud, seguridad y fiabilidad; optimizar solo con evidencia (medición) y sin sacrificar legibilidad.

## Contrato esperado del backend

El frontend asume que el backend (skill `nestjs-standards`, sección 15) cumple este contrato. Si una respuesta no lo cumple, reportarlo en vez de parchearlo en el front:

- **Errores:** formato estándar de NestJS `{ statusCode, message, error }`; en errores de validación `message` es un arreglo de textos. `lib/api.ts` debe normalizarlo a un solo formato para la UI.
- **Paginación:** respuestas de colecciones con `{ datos, total, pagina, limite }`.
- **Autenticación:** cookie httpOnly `tokenAcceso`; 401 = no autenticado, 403 = sin permiso.
- **Persistencia de la escena:** la columna `proyecto.esquema_json` (JSONB) guarda el documento completo. El DTO valida con `@IsObject()`, así que el payload tiene que ser un **objeto**, nunca un array. El frontend lo envuelve en `{ version, scene, vista }` (`types/proyecto.ts`) para dejar lugar a migrar el formato.

### Límites conocidos del backend (no parchear en el front)

- `PATCH /proyectos/:id` **sobrescribe el documento entero** y devuelve el blob completo como eco. Con una edición continua son ~1 PATCH/secondo con el documento yendo y viniendo. Solución futura: endpoint de delta.
- **No hay control de concurrencia.** `Proyecto` no tiene `updatedAt` ni `version`, así que dos personas editando el mismo proyecto se pisan (último `PATCH` gana). Requiere migración Prisma.
- **No hay historial.** Las tablas `version` y `documento_colaborativo` ya existen en la base, con sus índices, pero **ningún módulo las referencia**. Cada guardado pisa el anterior.
- **No hay gateway WebSocket.** `JwtAuthGuard` implementa solo `CanActivate` (HTTP), así que un handshake WS necesita su propia autenticación leyendo `handshake.headers.cookie`. Esto bloquea la fase de Yjs.

## Checklist antes de cada commit

1. `npm run build` corre sin errores ni warnings de TypeScript.
2. Todo componente del editor tiene `"use client"`, y el registro de `@pascal-app` está listo antes de montar `<Editor>`.
3. Ninguna llamada al backend olvida `credentials: "include"`.
4. No se agregó ninguna librería fuera de la tabla de "Stack instalado" sin actualizarla acá.
5. Toda clase nueva del editor quedó en `editor.module.css` (no como string global).
6. Si se tocan campos de nodo, las rutas existen en `nodeRegistry.get(kind).schema.shape`.
7. Factores de calidad: toda vista con datos tiene estados de carga/error/vacío, los botones con solo ícono tienen `aria-label`, no hay URLs hardcodeadas ni secretos en `NEXT_PUBLIC_*`.
8. **Aislamiento de bundle**: si se toca algo que el editor importa, confirmar que las páginas estáticas siguen sin cargar chunks de three.js / pascal.
