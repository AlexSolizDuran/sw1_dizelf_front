# Generación de proyectos con IA (`lib/ia/proyecto`)

Convierte un prompt, una imagen o ambos en un **plano completo** ejecutable
sobre la escena del editor.

```text
Modal (prompt + imagen + perfil)
  └─ POST /api/ia/proyecto              route.ts
       ├─ guardiaIA (sesión + límite)
       ├─ llamarPlanificador            openrouter.ts
       ├─ planProyectoSchema            esquema.ts
       └─ normalizarPlan                geometria.ts
            └─ sessionStorage `dizelf:ia:proyecto:<id>`
                 └─ useGeneracionProyecto (editor)
                      └─ create_level + create_rooms + add_opening
```

## Por qué el modelo devuelve un plan y no un `SceneGraph`

Un `SceneGraph` tiene IDs, referencias entre nodos, colecciones y materiales: un
ID inválido deja el editor sin plano. `create_rooms` ya construye muros
compartidos, losas, techos y aberturas con validación previa, así que el modelo
solo decide la **distribución**.

## Archivos

| Archivo | Rol |
| --- | --- |
| `esquema.ts` | Contrato Zod, JSON Schema para `response_format` y extracción tolerante del JSON. |
| `geometria.ts` | Rectángulos alineados, snapping a 5 cm, traslación a `(0,0)`, escala a 28 m y detección de solapes. |
| `prompt.ts` | System prompt del planificador y mensaje de reparación. |
| `modelos.ts` | Perfiles (gratuito/económico/equilibrado/precisión), defaults hardcodeados y cadena de fallback. |
| `openrouter.ts` | Llamada multimodal (texto + imagen) con salida estructurada y un reintento sin ella. |
| `cliente.ts` | Helpers del navegador: pedir el plan, comprimir la imagen y pasar el plan al editor. |

## Perfiles y variables de entorno

El cliente manda `perfil`, nunca un ID de modelo. Todo tiene default
hardcodeado: la app funciona sin `.env`.

```env
OPENROUTER_MODEL_PROYECTO_GRATIS=nvidia/nemotron-3.5-super-vl:free
OPENROUTER_MODEL_PROYECTO_ECONOMICO=anthropic/claude-haiku-4.5
OPENROUTER_MODEL_PROYECTO_EQUILIBRADO=anthropic/claude-sonnet-5.5
OPENROUTER_MODEL_PROYECTO_PRECISION=openai/gpt-5.5
OPENROUTER_PERFIL_PROYECTO_DEFECTO=equilibrado
```

El fallback solo baja de perfil (`precision → equilibrado → economico →
gratuito`). Si falla el gratuito no se pasa a uno pago.

## Límites v1

- Ambientes rectangulares (el normalizador toma el rectángulo envolvente).
- Hasta 8 ambientes por nivel (`create_rooms` acepta 8 por llamada).
- Hasta 3 niveles. Se generan solo los que pida el texto o muestre la imagen:
  no hay un mínimo de 2 plantas.
- Sin escaleras: se agregan después con `create_stair`.

## Solo imagen = una planta

Cuando el pedido es solo una imagen, el endpoint conserva únicamente el nivel 0
y descarta los demás. Los modelos tienden a inventar una segunda planta (o una
variante del mismo plano) aunque la imagen muestre una sola. El recorte queda
anotado en `notas`. Si se necesitan más niveles, hay que pedirlos en el texto.

## Llamada al modelo

`max_tokens` es 6.000 y `reasoning.max_tokens` 1.200: los modelos de
razonamiento (incluido el gratuito) gastan el presupuesto pensando y dejaban
`content` vacío con el valor anterior.

## Pruebas

```bash
# Esquema y geometría, sin red
npx tsx scripts/probar-plan-proyecto.ts

# Además, el modelo gratuito real (texto e imagen)
npx tsx --env-file=.env.local scripts/probar-plan-proyecto.ts \
  --real --imagen=/ruta/al/croquis.png
```

La prueba con imagen interpreta un croquis; conviene que tenga ambientes
rotulados.
