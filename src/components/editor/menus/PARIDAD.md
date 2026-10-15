# Paridad de los menús

Comparación botón por botón contra los componentes del paquete
`@pascal-app/editor` 0.9.2, que quedaron apagados.

## Barra de abajo — `menus/bottom-bar.tsx`

Sustituye a `ui/action-menu/index.tsx` (`<ActionMenu />`).

| Original | Nuestro | Store | Estado |
|---|---|---|---|
| `ControlModes` → Select (V) | `mode-bar.tsx` | `setMode('select')` + `setFloorplanSelectionTool('click')` | ✅ |
| `ControlModes` → Zone (Z) | `mode-bar.tsx` | `setPhase('structure')` + `setStructureLayer('zones')` + `setMode('build')`, alterna a `select` | ✅ |
| `ControlModes` → Delete (X) | `mode-bar.tsx` | `setMode('delete')` | ✅ |
| Salida de edición de terreno | `mode-bar.tsx` | `setPhase('structure')` + `setStructureLayer('elements')` antes de cualquier cambio | ✅ |
| `MeasurementControl` → Distancia | `measurement-control.tsx` | `setToolDefaults('measurement', {kind})` + `setTool('measurement')` | ✅ |
| `MeasurementControl` → Ángulo | ídem | ídem | ✅ |
| `MeasurementControl` → Área | ídem | ídem | ✅ |
| `MeasurementControl` → Perímetro | ídem | ídem | ✅ |
| `MeasurementControl` → Volumen | ídem | ídem | ✅ |
| `MeasurementControl` → Smart | ídem | ídem | ✅ |
| `MeasurementControl` → mostrar/ocultar mediciones | ídem | `setShowMeasurements` | ✅ |
| `ReferencesControl` → mostrar/ocultar todo | `references-control.tsx` | `setShowScans` + `setShowGuides` | ✅ |
| `ReferencesControl` → panel de escaneos | ídem | lista con elegir / borrar / opacidad | ⚠️ sin botón de subir `.glb` |
| `ReferencesControl` → panel de imágenes guía | ídem | lista con elegir / borrar / opacidad | ✅ |
| `ReferencesControl` → subir imagen | `references-control.tsx` | `crearGuiaLocal()` → IndexedDB | ✅ |
| `CameraActions` → girar izquierda | `camera-actions.tsx` | `emitter.emit('camera-controls:orbit-ccw')` | ✅ |
| `CameraActions` → girar derecha | ídem | `emitter.emit('camera-controls:orbit-cw')` | ✅ |
| `CameraActions` → vista desde arriba | ídem | `emitter.emit('camera-controls:top-view')`, oculto en 2D | ✅ |

### Lo que falta y por qué

| Falta | Motivo |
|---|---|
| Subir escaneos `.glb` | Requiere que la app host registre un handler con `useUploadStore.registerUploadHandler()`. Hoy nadie lo registra — tampoco el propio paquete — y el backend no tiene endpoint de subida. El botón se muestra deshabilitado con la explicación en pantalla. |
| `ViewToggles` (escaneos, guías, piso de referencia, diagrama de riser) | **No se usa en el `ActionMenu` de escritorio**: solo se exporta por si acaso. `SecondaryToggles` —que sí va en la barra— renderiza únicamente `ReferencesControl`. No hay pérdida de función. |

## Selector de pisos — `menus/level-selector.tsx`

Sustituye a `ui/floating-level-selector.tsx` (`<FloatingLevelSelector />`, apagado por CSS — ver abajo).

| Original | Nuestro | Estado |
|---|---|---|
| Agregar piso arriba | `agregarArriba` → `LevelNode.parse()` + `createNode` | ✅ |
| Agregar piso abajo | `agregarAbajo` | ✅ |
| Insertar piso entre dos | `insertarEntre` → corre los de arriba con `updateNodes` | ✅ |
| Seleccionar piso | `onSeleccionar` → `setSelection({ buildingId, levelId })` | ✅ |
| Renombrar (edición en línea) | doble clic sobre el nombre → input | ✅ |
| Duplicar piso | `duplicar` → `cloneLevelSubtree` + corrimiento | ✅ |
| Borrar piso | `borrarPisoConSelectionDeRespaldo` + confirmación | ✅ |
| Reordenar arrastrando | `DndContext` + `useSortable` de `@dnd-kit` | ✅ |

## Modo borrar (martillo) — `hooks/use-delete-on-click.ts`

**Paridad rota en el paquete, no en este proyecto.** El botón de la barra
funciona igual que el original (`setMode("delete")`), pero el click-to-delete
del paquete no.

`selection-manager.tsx` implementa el borrado suscribiéndose a los eventos
`${tipo}:click` del `emitter`. En la **0.9.2 y en la 1.0.4** esos eventos casi
nunca se emiten:

| Evento | Dónde | Condición |
|---|---|---|
| `wall:click` | `use-floorplan-background-placement.ts:144` | `isOpeningPlacementActive` (colocar puerta/ventana) |
| `ceiling:click` | `floorplan-panel.tsx:9074`, `use-ceiling-events.ts:161`, `ceiling-selection-affordance-system.tsx:506` | techos |

`selection-manager` se suscribe a 14 tipos fijos + los del registro, y los nodos
del registro solo hacen `event.stopPropagation()`
(`floorplan-registry-layer.tsx:557`). **Ningún clic sobre un muro emite un
evento**, así que el modo se activa y el hover marca en rojo, pero el clic no
borra nada.

El hook reimplementa esa parte con las APIs públicas:

- Escucha `click` en `window` solo mientras `mode === "delete"`.
- Descarta clics que no caen en el plano (`SVGElement` en 2D, `<canvas>` en 3D),
  lo que excluye los menús y paneles propios.
- Toma `useViewer.hoveredId`, que sí se puebla: los nodos con `def.floorplan`
  entran en `floorplanData.entries` (`floorplan-export.tsx:273`) y esa capa
  cablea `onHoveredIdChange={setHoveredId}` (`floorplan-registry-layer.tsx:1315`).
- Respeta los mismos límites que el paquete: no borra `building` ni `site`,
  filtra por nivel con `resolveLevelId`, y respeta `capabilities.deletable`.
  Los ascensores son de alcance edificio.

Es complementario: si una versión futura emite los eventos, `deleteNode` sobre
un id inexistente es un no-op.

**El listener va en fase `capture`, no en bubble.** Cada entrada del registry
layer renderiza `<g onClick={onClickStop}>`, y `onClickStop` es
`event.stopPropagation()` (`floorplan-registry-layer.tsx:1618` y `:557`). React
17+ engancha los eventos sintéticos en el contenedor raíz, de modo que ese
`stopPropagation` frena también la propagación nativa: un listener en `window`
en fase bubble nunca se ejecuta para clics sobre nodos 2D. Por eso el modo
borrar funcionaba en 3D (el canvas no pasa por esa capa) y no en 2D. En captura
el listener corre antes del target y ningún `stopPropagation` posterior lo
alcanza.

**Diferencias respecto al paquete:** no dispara el SFX `emitDeleteSFX` (no está
exportado) y limpia la selección tras borrar, para que el panel de Propiedades
no quede apuntando a algo que ya no existe.
| Pegar en este piso | — | ❌ **no implementado** |

### Por qué falta "pegar en este piso"

El portapapeles vive en `lib/scene-clipboard.ts` (332 líneas), **no está exportado**, y lo alimenta el `Ctrl+C` que corre en `hooks/use-keyboard.ts` del propio paquete (`use-keyboard.ts:363`), que se monta siempre (`index.tsx:1117`).

Reimplementarlo dejaría dos portapapeles conviviendo: el del paquete seguiría llenándose con `Ctrl+C` y el nuestro quedaría vacío, así que copiar en un contexto y pegar en otro fallaría.

**Lo que sí sigue funcionando**: el `Ctrl+C`/`Ctrl+V` del paquete, que pega en el nivel **actual**. Lo que se pierde es la comodidad de pegar en un nivel distinto del que estás editando.

## Cómo se apagaron los originales

Ambos se renderizan hardcodeados en `index.tsx:1392-1399`, sin prop para desactivarlos.

| Menú | Mecanismo |
|---|---|
| `FloatingLevelSelector` | CSS: `.shell :global([data-viewer-bounds] > .pointer-events-auto.absolute.top-14.left-3.z-20)` (origen: `floating-level-selector.tsx:513`) |
| `ActionMenu` | CSS: `.shell :global(div.fixed.bottom-6)` |

### Por qué no se usa `stageOverlay`

`EditorProps.stageOverlay` **sí** apaga el `FloatingLevelSelector` a propósito
(`index.tsx:1393`), y sería la forma más limpia. Pero el paquete lo envuelve en:

```tsx
// editor-layout-v2.tsx:191
{stageOverlay && <div className="absolute inset-0 z-10">{stageOverlay}</div>}
```

Sin `pointer-events-none`. Esa capa ocupa todo el visor y **se queda con los
clics del lienzo**.

El síntoma fue acotado: **solo el paneo con espacio dejaba de funcionar.** La
cámara es la única pieza del paquete que valida que el evento venga del canvas:

```ts
// custom-camera-controls.tsx:816
if (!gl.domElement.contains(event.target)) return
```

Verificado: `domElement.contains` aparece en **1 archivo** de `editor/src` y en
**0** de `viewer/dist`. El resto de las herramientas (dibujar, seleccionar,
colocar) escuchan en `window` y calculan coordenadas por su cuenta, así que
seguían funcionando y el bug pasaba desapercibido.

Por eso los menús van como **hermanos** de `<Editor>` dentro de `.shell`, que ya
es `position: fixed; inset: 0`.

### Riesgo del selector CSS

Apagar el selector de pisos depende de clases de Tailwind del paquete. Si
`@pascal-app` las renombra, **el selector vuelve a aparecer sin aviso**. Es el
síntoma a buscar si alguna vez se ven dos selectores de pisos a la vez.

## Posicionamiento

Al ser hermano de `<Editor>`, el selector se posiciona contra `.shell`
(`fixed inset 0`), no contra la columna del visor. El componente reconstruye el
desplazamiento que antes le daba el layout:

```
x = rail (44px, `w-11` en icon-rail.tsx:85) + panel del sidebar + 20px de margen
y = navbar (44px, `.topbar`) + 56px (`top-14`)
```

El margen es de 20px y no los 12px del `left-3` original porque con 12 el dock
quedaba pegado al borde del sidebar.

El ancho del panel se lee de `useSidebarStore` porque es **redimensionable y
colapsable**: con un valor fijo el selector se desalinearía al arrastrar el
resizer o al colapsar la barra lateral.

**Acoplamientos a vigilar si el paquete cambia el layout:** la altura de 44px de
la navbar, el ancho `w-11` del rail, y que el navbar ocupe el ancho completo
(`navbarSlot`, no un slot lateral).

## Helpers reimplementados

Viven fuera de `@pascal-app/editor` y no están exportados por el paquete:

| Nuestro | Origen | Líneas |
|---|---|---|
| `lib/editor/level-selection.ts` | `lib/level-selection.ts` | 31 |
| `lib/editor/guide-image.ts` | `lib/local-guide-image.ts` | 42 |

**Riesgo**: si el paquete cambia su semántica, estas copias quedan viejas en silencio. Es el motivo por el que conviene revisarlas en cada upgrade de `@pascal-app`.