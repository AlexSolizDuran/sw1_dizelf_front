# Tools del asistente (DIZELF)

Estas tools son la capa de escritura/lectura que un LLM puede usar sobre la
escena del editor. Viven en el **frontend** y operan directamente sobre
`useScene`; no hay endpoint de IA ni agente conectado todavía.

## Uso

```ts
import { TOOL_DEFINITIONS } from "@/lib/ai/tools";
import { executeTool } from "@/lib/ai/executor";

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

## Tools

### Lectura

| Tool | Para qué |
| --- | --- |
| `get_scene_summary` | Edificios, niveles, conteos, materiales y nivel activo. |
| `get_level` | Muros, ambientes, aberturas, muebles, losas y techos de un nivel. |
| `get_node` | Detalle de un nodo por ID. |
| `search_catalog` | Buscar muebles por nombre/tags; devuelve `catalogId`. |
| `search_materials` | Buscar materiales; devuelve `materialId`/`materialRef`. |

### Escritura

| Tool | Para qué |
| --- | --- |
| `create_level` | Crear un nivel (y un edificio si no hay). |
| `create_walls` | Crear muros sueltos o cerrar un contorno. |
| `create_room` | Crear muros + zone + losa + techo de forma atómica. |
| `add_opening` | Agregar puerta o ventana a un muro. |
| `place_item` | Colocar un objeto de piso, pared o techo. |
| `paint_surface` | Pintar muro, losa, techo, objeto, puerta o ventana. |
| `create_material` | Crear un material PBR de escena. |
| `update_node` | Cambiar nombre, geometría o transformación. |
| `delete_node` | Borrar un nodo; exige `cascade` si tiene hijos. |
| `validate_scene` | Revisar esquema, muros, aberturas y ambientes. |

## Notas de implementación

- `create_room` pausa `spaceDetection` para no duplicar losa/techo; crea la
  zone, la losa y el techo explícitamente y reanuda al terminar.
- `create_walls` no parte muros existentes en T. Si el editor tiene la
  detección automática activa, los contornos cerrados pueden generar ambientes.
- `add_opening` mide `distanceFromStart` desde el inicio del muro y valida que
  la abertura entre y no se superponga con otra.
- `place_item` usa `wallId`/`ceilingId` para objetos con `attachTo` de pared o
  techo; si no, usa `position` sobre el nivel.
- `paint_surface` usa `slots` en muros/objetos y `materialPreset` en losas,
  techos, columnas y cercas.
