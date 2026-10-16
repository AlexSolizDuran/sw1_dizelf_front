# Editor de planos 2D/3D

Editor arquitectónico construido sobre `@pascal-app/editor`. Se abre en
`/editor/[proyectoId]` y guarda el documento de la escena en
`proyecto.esquema_json` (JSONB) del backend.

## Archivos

| Archivo | Rol |
|---|---|
| `editor-shell.tsx` | Orquesta todo: registro de nodos, tema, carga, guardado y el `<Editor>` |
| `editor.module.css` | Tokens + clases del editor. **Todo el CSS vive acá** |
| `editor-navbar.tsx` | Marca, 2D/3D, snapping, tema, estado de guardado, colaboradores |
| `indicador-presencia.tsx` | Quién más está en el plano (presencia en vivo) |
| `panel-colaboradores.tsx` | Invitar por correo y gestionar permisos |
| `panel-versiones.tsx` | Historial de versiones (guardar/renombrar/eliminar) |
| `build-tab.tsx` | Las 9 herramientas de estructura |
| `muebles-tab.tsx` | Catálogo de mobiliario (111 objetos) |
| `materiales-tab.tsx` | Biblioteca de pinturas y texturas |
| `estructura-tab.tsx` | El JSON de la escena y el manifiesto para IA |
| `properties-panel.tsx` | Inspector del nodo seleccionado |
| `level-bootstrap.tsx` | Auto-selecciona el primer edificio y nivel |
| `menus/` | Bottom bar propia: modo, medición, cámara, referencias, niveles |
| `icons/glyphs.tsx` | Tipo de nodo → ícono de lucide |
| `icons/registry-patch.tsx` | Reescribe los iconos del registro (ver abajo) |

Los hooks de sincronización y presencia viven en `src/hooks/`
(`use-sincronizacion.ts`, `use-presencia.ts`, `use-delete-on-click.ts`).

La lógica pura va fuera del componente: `lib/editor/node-fields.ts` (campos del
inspector), `lib/editor/scene-json.ts` (serialización) y `lib/editor/catalog-es.ts`
(catálogo en español).

## Los 4 tabs

- **Construir** — Muro, Puerta, Ventana, Piso, Columna, Techo, Escalera, Tejado, Zona.
  Atajos `1`–`8`, `Z` para zona, `V` para volver a selección.
- **Muebles** — Catálogo del paquete (`CATALOG_ITEMS`, 111 objetos) traducido al
  español y agrupado en 13 categorías. Elegís uno y hacés clic en el plano.
- **Materiales** — Biblioteca de pinturas y texturas. Elegís una y hacés clic sobre
  una superficie. Incluye borrador y restablecer.
- **Estructura** — Dos representaciones del documento en JSON: el `SceneGraph` crudo
  (lo que persiste el editor) y un manifiesto reagrupado por categoría pensado para
  que una IA lo lea. Solo lectura, con copiar al portapapeles.

## Cómo se re-temática el paquete

El editor no necesita fork del paquete: declara los mismos tokens en su CSS Module.

```css
.shell      { --primary: #8c432a; --background: #faf7f2; … }
.shellDark  { --primary: #c9886d; --background: #1c1b1a; … }
```

Funciona porque `globals.css` usa `@theme inline`, que hace que las utilidades
resuelvan `var(--primary)` **en el elemento** y no a través de `--color-*`.
Declararla en `.shell` re-tematiza todo el subárbol, incluido el paquete.

El tema es una propiedad del editor, no del documento: el toggle cambia la clase
del módulo y nunca toca `<html>`, así que no puede contaminar la landing.

## Por qué hay que parchar los iconos

`@pascal-app/nodes` declara sus iconos como rutas webp que este proyecto no tiene:

```js
icon: { kind: 'url', src: '/icons/wall.webp' }   // 24 rutas distintas
```

El paquete las renderiza en el menú flotante de acciones y en el menú del plano 2D.
`icons/registry-patch.ts` las reemplaza por lucide. Se puede porque `IconRef` es una
unión discriminada y que `IconRefGlyph` ya renderiza `kind: 'component'`:

```ts
for (const [kind, def] of nodeRegistry.entries()) {
  if (!KIND_ICON[kind] || !def?.presentation?.icon) continue;
  def.presentation.icon = { kind: "component", module: loaderPara(kind) };
}
```

Las definiciones del registro no están congeladas, así que se pueden mutar en
runtime. `bootstrapRegistry()` corre una vez, antes de montar el editor.

## Cómo se persiste

El paquete trae autosave propio con debounce de 1 s. `editor-shell.tsx` lo conecta:

```
use-auto-save.ts  ──onSave(scene)──►  editor-shell.tsx
                                      envuelve en { version, scene, vista }
                                      │
                                      ▼
                            use-project-store.guardar()
                                      │
                                      ▼
                          PATCH /proyectos/:id  { esquemaJson }
                                      │
                                      ▼
                            proyecto.esquema_json  (JSONB, Neon)
```

Dos detalles que importan:

- `onSave` se llama también en `pagehide` con `{ keepalive: true }`. Hay que
  reenviar esa opción o se pierde la última edición.
- El paquete **bloquea** el guardado si la escena cae de más de 4 nodos a ≤4
  (`isSuspiciousNodeDrop`) y marca `error`. El navbar muestra ese estado, porque
  si no parece que guardar no funciona.

## Dependencia externa

Los modelos `.glb`, los thumbnails y las texturas salen de un bucket público de
Supabase **ajeno**, del autor del paquete. Si ese owner lo da de baja, el catálogo
de muebles y la biblioteca de materiales quedan vacíos. Para dejar de depender de
un tercero hay que servir los assets desde un bucket propio.

## Agregar un campo al inspector

1. Declararlo en el `CATALOG` de `lib/editor/node-fields.ts` con su ruta.
2. **Verificar que la ruta exista** en `nodeRegistry.get(kind).schema.shape`. Si no
   existe, el campo sale vacío en silencio — no tira error.

Ese es el error más fácil de cometer al tocar este archivo.

## Cosas que el editor necesita del entorno

- **WebGL.** Sin GPU la pantalla queda en negro.
- El editor pesa ~1,6 MB gzip. Está aislado en su ruta a propósito: las páginas
  estáticas no cargan ni un chunk de three.js. Si algo rompe eso, se nota.
