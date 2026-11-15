# Tools del asistente (DIZELF)

Estas tools son la capa de escritura/lectura que un LLM puede usar sobre la
escena del editor. Viven en el **frontend** y operan directamente sobre
`useScene`; el agente (`agentLoop.ts`) las expone al proveedor de IA y ejecuta
lo que el modelo devuelve.

## Uso

```ts
import { TOOL_DEFINITIONS } from "@/lib/ia/tools";
import { executeTool } from "@/lib/ia/executor";

// 1. Mandar TOOL_DEFINITIONS al proveedor de LLM.
// 2. Cuando el modelo pida una tool:
const result = await executeTool(toolCall.name, toolCall.arguments, {
  proyectoId,
  puedeEditar,       // permiso del colaborador
  levelId: nivelActivo,
});

// 3. Devolver `result` al modelo. Nunca se devuelve la escena completa.
```

`executeTool` acepta argumentos como objeto o como string JSON. Valida con Zod,
bloquea escrituras sin permiso y normaliza errores:

- `TOOL_NOT_FOUND`
- `INVALID_ARGS`
- `READ_ONLY`
- `TOOL_ERROR`

Las tools también devuelven códigos propios (`LEVEL_NOT_FOUND`,
`OPENING_OVERLAP`, `CASCADE_REQUIRED`, etc.) con un `hint` para que el modelo
pueda corregir sin adivinar.

## Contrato de la escena

- Unidades: metros.
- Planta: `[x, z]`; `y` es altura.
- Los IDs se leen con `get_scene_summary`, `get_level` o `get_node`. No se
  inventan IDs.
- Toda escritura es una sola operación de undo.
- No se reemplaza la escena completa.

## Tools (24)

### Lectura

| Tool | Para qué |
| --- | --- |
| `get_scene_summary` | Edificios, niveles, conteos, materiales y nivel activo. |
| `get_level` | Contenido de un nivel: muros, ambientes, aberturas, muebles, losas, techos, columnas, escaleras, cubiertas, estantes, cercos, ascensores, spawns y sus segmentos. |
| `get_node` | Detalle de un nodo por ID. |
| `search_catalog` | Buscar muebles por nombre/tags; devuelve `catalogId`. |
| `search_materials` | Buscar materiales; devuelve `materialId`/`materialRef`. |

### Crear base

| Tool | Para qué |
| --- | --- |
| `create_level` | Crear un nivel (y un edificio si no hay). |
| `create_walls` | Crear muros sueltos o cerrar un contorno. |
| `create_room` | Crear muros + zone + losa + techo + puertas/ventanas de forma atómica, reutilizando muros existentes. |
| `create_rooms` | Igual que `create_room` pero por lote: varios ambientes en un solo undo y compartiendo paredes entre ellos. |
| `add_opening` | Agregar puerta o ventana a un muro o a un ambiente por nombre. |

### Crear estructuras

| Tool | Para qué |
| --- | --- |
| `create_column` | Columna con preset o dimensiones propias. |
| `create_fence` | Cerco recto entre dos puntos. |
| `create_shelf` | Estantería con filas y columnas. |
| `create_stair` | Escalera + tramo, con huecos sincronizados en losa/techo. |
| `create_roof` | Cubierta + paño con tipo, pendiente y dimensiones. |

### Objetos y edición

| Tool | Para qué |
| --- | --- |
| `place_item` | Colocar un objeto de piso, pared o techo. |
| `paint_surface` | Pintar muro, losa, techo, objeto, puerta o ventana. |
| `update_node` | Editar propiedades según el tipo de nodo. |
| `delete_node` | Borrar un nodo; exige `cascade` si tiene hijos. |

### Duplicar y navegar

| Tool | Para qué |
| --- | --- |
| `duplicate_node` | Clonar un nodo y su subárbol con IDs y referencias nuevas. |
| `duplicate_level` | Clonar un piso completo y correr +1 los superiores. |
| `select_level` | Activar un nivel sin modificar la escena. |
| `focus_node` | Seleccionar un nodo y acercar la cámara. |

### Validación

| Tool | Para qué |
| --- | --- |
| `validate_scene` | Revisar esquema, muros, aberturas y ambientes. |

## Notas de implementación

- `create_room` pausa `spaceDetection` para no duplicar losa/techo; crea la
  zone, la losa y el techo explícitamente y reanuda al terminar. Un lado que
  coincide exactamente con un muro existente se reutiliza; un solape parcial
  devuelve `WALL_SPLIT_REQUIRED` en vez de partir el muro en silencio.
- `create_room` y `create_rooms` aceptan `openings`: puertas y ventanas que se
  crean en la misma transacción. Cada abertura se ancla con `side` (número de
  lado del polígono, 1 = del vértice 1 al 2) y, opcionalmente, `position` en
  metros desde el vértice inicial de ese lado. Sin `position` se usa el hueco
  libre más grande del muro; si la posición pedida no entra, se avisa y se mueve
  al hueco libre. `face` elige el lado de la hoja (`front`/`back`). Una abertura
  sin espacio se omite con un warning en vez de abortar el ambiente.
- `create_rooms` es la vía recomendada para una vivienda completa: valida todos
  los polígonos antes de escribir, comparte los lados que coinciden entre
  ambientes del lote (una pared medianera se crea una sola vez) y aplica todo en
  un único paso de undo. Un polígono repetido devuelve `DUPLICATE_ROOM`.
- `create_walls` no parte muros existentes en T. Si el editor tiene la
  detección automática activa, los contornos cerrados pueden generar ambientes.
- `add_opening` acepta `wallId` o, si no se conoce, `roomName`/`roomId`: resuelve
  los `boundaryWallIds` del ambiente y elige el muro con hueco libre (ventanas
  prefieren muros exteriores y puertas los interiores). `distanceFromStart` se
  mide desde el inicio del muro. Al resolver por ambiente, una distancia
  explícita que choca con otra abertura descarta ese muro y prueba el hueco
  libre. Si el `wallId` es explícito, `OPENING_OVERLAP` devuelve
  `details.freeSlots` y `details.suggestedDistance`. Si el muro o el ambiente no
  existen, el error incluye `details.rooms` y `details.walls` con IDs válidos.
- `update_node` valida el patch según el tipo (`PATCH_FIELDS_BY_TYPE`) y
  devuelve `UNSUPPORTED_PATCH` en vez de descartar campos en silencio. En
  puertas y ventanas recalcula `position[1]`: puerta `height / 2`, ventana
  `sill + height / 2`. En `update_node`, `sill` es la altura del alféizar
  (número); el booleano `WindowNode.sill` no se toca.
- `place_item` usa `wallId`/`ceilingId` para objetos con `attachTo` de pared o
  techo; si no, usa `position` sobre el nivel.
- `paint_surface` usa `slots` en muros/objetos y `materialPreset` en losas,
  techos, columnas, cercas y estantes. Ya no existen materiales de escena
  creados por IA: solo biblioteca y materiales `scene:<id>` preexistentes.
- `delete_node` protege el terreno, el último nivel y el último edificio con
  niveles (`LAST_LEVEL_PROTECTED`).
- `duplicate_level` usa `cloneLevelSubtree` y remapea `boundaryWallIds` y
  `fromLevelId`/`toLevelId`, que la librería no reescribe.
- `select_level` y `focus_node` son `risk: "read"`: no tocan la escena y
  permiten navegar incluso sin permiso de edición. `focus_node` usa
  `publishNavigationSyncPose`, el mismo canal que sincroniza el plano 2D con la
  cámara 3D.
