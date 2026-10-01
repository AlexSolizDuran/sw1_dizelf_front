---
name: nextjs-frontend-standards
description: Estándares de codificación, arquitectura y librerías instaladas para el frontend Next.js del diagramador de clases/BD colaborativo. Úsala siempre al crear o revisar componentes, páginas, hooks, llamadas al backend, o cualquier código dentro de este proyecto frontend. También consultar cuando se pregunte qué librería usar para algo (estado, íconos, HTTP, colaboración en tiempo real) o cómo integrar GoJS/Yjs dentro de Next.js sin romper el build. Incluye los factores de calidad del software aplicados al frontend (correctitud, eficiencia, fiabilidad, usabilidad/accesibilidad, mantenibilidad/escalabilidad, seguridad/integridad, portabilidad).
---

# Estándares de frontend — Next.js (diagramador de clases/BD)

## Stack instalado (versiones fijadas, verificadas en build real)

| Paquete | Versión | Rol |
|---|---|---|
| next | 16.3.x | Framework (App Router) |
| react / react-dom | 19.2.x | UI |
| typescript | 5.x | Tipado |
| gojs | 4.0.3 | Editor del diagrama de clases |
| yjs | 13.6.32 | CRDT — sincronización de estado colaborativo |
| y-websocket | 2.1.0 | Cliente WebSocket para Yjs (usa el WebSocket nativo del navegador, no necesita el paquete `ws`) |
| zustand | última estable | Estado global de la app (usuario, proyecto activo) |
| lucide-react | última estable | Íconos de línea fina |
| tailwindcss | 4.x | Estilos |
| axios (opcional) | última estable | Cliente HTTP — el proyecto también puede usar `fetch` nativo, ver nota de autenticación abajo |

No agregar otra librería de estado (Redux, Recoil, Jotai), otro set de íconos, u otro motor de diagramas sin discutirlo antes — el objetivo es mantener el stack mínimo y ya validado.

## Regla no negociable: `"use client"` + carga dinámica para GoJS y Yjs

GoJS y Yjs necesitan el navegador (`window`/`document`, WebSocket). Next.js renderiza en servidor por defecto — cualquier componente que use estas librerías sin aislarse correctamente rompe el build o falla en runtime con `window is not defined`.

**Patrón obligatorio, siempre en dos archivos:**

```tsx
// components/DiagramEditor.tsx — el "wrapper" que hace el import dinámico
"use client";
import dynamic from "next/dynamic";

const GoJSCanvas = dynamic(() => import("./GoJSCanvas"), {
  ssr: false,
  loading: () => <p>Cargando editor...</p>,
});

export default function DiagramEditor() {
  return <GoJSCanvas />;
}
```

```tsx
// components/GoJSCanvas.tsx — el componente real, con GoJS/Yjs adentro
"use client";
import { useEffect, useRef } from "react";
import * as go from "gojs";

export default function GoJSCanvas() {
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const $ = go.GraphObject.make;
    const diagram = $(go.Diagram, diagramRef.current!, { /* config */ });
    // ... modelo, templates
    return () => { diagram.div = null; }; // limpieza obligatoria al desmontar
  }, []);

  return <div ref={diagramRef} style={{ width: "100%", height: "600px" }} />;
}
```

Reglas derivadas:
- `dynamic(..., { ssr: false })` **solo funciona dentro de un componente `"use client"`** — si se llama desde un Server Component, Next.js lo ignora silenciosamente y el build puede romperse igual.
- Toda conexión Yjs (`new WebsocketProvider(...)`) va dentro de un `useEffect`, nunca en el cuerpo del componente.
- Siempre limpiar en el `return` del `useEffect` (`diagram.div = null`, `provider.destroy()`) para evitar memory leaks al navegar entre páginas.

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
├── app/                    ← rutas (App Router: carpeta = ruta)
│   ├── (auth)/login/page.tsx
│   ├── proyectos/page.tsx
│   ├── editor/[id]/page.tsx
│   └── layout.tsx
├── components/
│   ├── diagram/             ← todo lo relacionado a GoJS/Yjs
│   ├── ui/                  ← componentes reutilizables (botones, tarjetas)
│   └── layout/               ← sidebar, header, etc.
├── lib/
│   ├── api.ts                ← cliente HTTP centralizado (fetch/axios con withCredentials)
│   └── store.ts              ← store(s) de zustand
├── hooks/
└── types/                    ← tipos TS compartidos (ej. modelo del diagrama)
```

## Convenciones de código

- **Componentes**: `PascalCase.tsx`, un componente por archivo, export default.
- **Hooks propios**: `useAlgo.ts`, siempre con prefijo `use`.
- **Tipos**: centralizados en `types/`, no duplicar interfaces del modelo de diagrama (`ClassNode`, `Relation`, etc.) entre componentes — importar desde un único lugar.
- **Nada de lógica de negocio en componentes de UI**: transformar datos, llamar al backend, o mapear el JSON del diagrama va en `lib/` o hooks, no inline dentro del JSX.
- **Server Components por defecto**: solo agregar `"use client"` cuando el componente realmente necesita estado, efectos, o acceso al navegador (GoJS, Yjs, event handlers). No marcar todo el árbol como cliente "por las dudas".

## Sistema de diseño (tokens)

- Fuente UI/encabezados: **IBM Plex Sans**.
- Fuente de datos/tipado (atributos de tabla, tipos de dato, badges de multiplicidad, preview de código generado): **IBM Plex Mono**.
- Paleta base (dirección minimalista "Quiet Stone", en definición — confirmar acento final antes de aplicar globalmente):

| Token | Hex | Uso |
|---|---|---|
| `stone` | `#E7E4DF` | Fondo del canvas del diagrama |
| `paper` | `#FAF9F7` | Tarjetas, chrome de la UI |
| `ink` | `#2B2A28` | Texto |
| `accent` | *(pendiente: rojo `#B0503E` o violeta `#6B5C8C`)* | Relaciones, foco, acciones principales |
| `amber-lock` | `#C9862E` | Único color semántico — presencia/bloqueo de otro usuario editando |

- Radios de esquina chicos (2–4px), bordes finos (0.5px) en vez de sombras, sin gradientes ni efectos de neón/glow.
- Multiplicidad UML: texto simple en `accent`, sin caja de fondo (no usar badges rellenos — mantener el peso visual bajo).

## Factores de calidad

Todo cambio debe evaluarse contra estos 7 factores. Son reglas concretas para el frontend; las reglas de servidor (autorización real, constraints de BD, transacciones) viven en la skill del backend.

| Factor | Reglas obligatorias |
|---|---|
| **1. Correctitud** | La UI refleja exactamente el modelo real (`ClassNode`, `Relation`); el diagrama guardado, el mostrado y el código generado deben coincidir. No reimplementar en el front reglas de negocio que decide el backend. Formularios con validación de campos y casos límite (vacío, duplicado, longitud). TypeScript estricto, sin `any`. |
| **2. Eficiencia** | Server Components por defecto. Cargar con `dynamic` lo pesado (GoJS, Yjs). Evitar re-renders innecesarios: selectores finos en zustand, `useMemo`/`useCallback` solo donde se mida el problema. Los cambios del canvas NO deben provocar re-render de React por cada evento. Aplicar debounce a guardados y sincronizaciones frecuentes. Usar `next/image` y `next/font`; importar solo lo necesario de `lucide-react`. |
| **3. Fiabilidad** | Toda vista con datos remotos implementa estados de carga, error y vacío. Manejar fallo de red y caída del WebSocket de Yjs (mostrar estado de conexión, reconectar, no perder cambios locales). Usar `error.tsx` / error boundaries para que un fallo no rompa toda la app. No asumir la forma de la respuesta del backend: validar antes de usar. Limpieza completa en cada `useEffect` (ver regla de GoJS/Yjs). |
| **4. Usabilidad** | Feedback inmediato en cada acción (cargando, guardado, error). Mensajes de error claros y en español, sin códigos técnicos. Confirmación antes de acciones destructivas (borrar clase, relación o proyecto). Accesibilidad mínima: `aria-label` en botones que solo tienen ícono de `lucide-react`, contraste suficiente, foco visible y navegación por teclado en formularios y menús. Diseño responsive salvo el editor, que puede exigir pantalla grande (indicarlo con un aviso). Mostrar presencia/bloqueo de otros usuarios con `amber-lock`. Respetar los tokens del sistema de diseño. |
| **5. Mantenibilidad y escalabilidad** | Seguir las convenciones y la estructura de carpetas de esta skill. Componentes pequeños y de una sola responsabilidad; sin lógica de negocio en el JSX. Tipos en un único lugar (`types/`). Estado local con `useState`; zustand solo para estado realmente global. Sin valores mágicos: constantes con nombre. El editor debe mantenerse fluido con diagramas grandes (muchas clases y relaciones); no duplicar el modelo completo en el estado de React. |
| **6. Seguridad e integridad** | Nunca guardar el token en `localStorage` (ya cubierto en Autenticación). Ningún secreto en variables `NEXT_PUBLIC_*`. No usar `dangerouslySetInnerHTML` sin sanitizar. Sanitizar nombres de clases y atributos antes de mostrarlos o generar código en el preview. La validación del front es solo UX: la autorización y la validación reales las hace el backend. Integridad: con Yjs nunca sobrescribir el estado remoto con estado local desactualizado; toda edición debe pasar por el documento compartido. |
| **7. Portabilidad** | Sin URLs hardcodeadas (`localhost`, dominios de Vercel/Render): usar variables de entorno (por ejemplo `NEXT_PUBLIC_API_URL` y la URL del WebSocket). Compatible con navegadores modernos (Chrome, Firefox, Safari, Edge); no usar APIs exclusivas de un navegador sin alternativa. Mismas instrucciones de build y arranque en cualquier entorno (`npm run build` sin pasos manuales). |

**Conflicto entre factores:** priorizar correctitud, seguridad y fiabilidad; optimizar solo con evidencia (medición) y sin sacrificar legibilidad.

## Contrato esperado del backend

El frontend asume que el backend (skill `nestjs-standards`, sección 15) cumple este contrato. Si una respuesta no lo cumple, reportarlo en vez de parchearlo en el front:

- **Errores:** formato estándar de NestJS `{ statusCode, message, error }`; en errores de validación `message` es un arreglo de textos. `lib/api.ts` debe normalizarlo a un solo formato para la UI.
- **Paginación:** respuestas de colecciones con `{ datos, total, pagina, limite }`.
- **Autenticación:** cookie httpOnly `tokenAcceso`; 401 = no autenticado, 403 = sin permiso.

## Checklist antes de cada commit

1. `npm run build` corre sin errores ni warnings de TypeScript.
2. Todo componente con GoJS o Yjs tiene `"use client"` y, si corresponde, está cargado vía `dynamic(..., { ssr: false })`.
3. Ninguna llamada al backend olvida `credentials: "include"` / `withCredentials: true`.
4. No se agregó ninguna librería fuera de la tabla de "Stack instalado" sin actualizarla acá.
5. Factores de calidad: toda vista con datos tiene estados de carga/error/vacío, los botones con solo ícono tienen `aria-label`, no hay URLs hardcodeadas ni secretos en `NEXT_PUBLIC_*`, y la UI maneja la caída del WebSocket.
