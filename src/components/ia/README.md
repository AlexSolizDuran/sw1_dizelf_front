# Chats de IA (`components/ia` + `components/ayuda`)

DIZELF tiene dos chats flotantes, con la misma estética y alcances distintos:

| Chat | Componente | Alcance |
|---|---|---|
| Asistente de escena | `components/ia/asistente-panel.tsx` | Lee y propone cambios sobre el plano. Usa `useIAChat`, `agentLoop` y las tools de escena. Vive abajo a la derecha del editor. |
| Ayuda de la aplicación | `components/ayuda/help-assistant.tsx` | Explica DIZELF y gestiona proyectos/invitaciones. **No** lee ni modifica la escena. Vive abajo a la izquierda. |

## Diseño compartido

`components/ia/chat-kit.tsx` concentra las piezas visuales: lanzador, panel,
cabecera, burbujas con markdown ligero, aviso, indicador de escritura y
compositor con dictado. Ambas UIs usan los tokens de `globals.css` /
`editor.module.css`, radios chicos (4 px), bordes finos, sin sombras ni
gradientes. Cualquier cambio visual debe hacerse en `chat-kit.tsx` para que los
dos paneles sigan iguales.

## Conocimiento

El módulo vive en `lib/ia/conocimiento/` (ver su README) y no agrega tools: en
Plan siguen siendo las 6 de lectura. Las tarjetas se inyectan como contexto del
turno y no se muestran como bloque aparte en el chat: la respuesta del modelo es
la única superficie visible. La subventana de actividad sólo informa cuántas
tarjetas entraron al contexto.

## Diagnóstico de un turno

El chip de cada tool muestra el `hint` del error, no solo el mensaje genérico:
así se ve qué campo rechazó Zod (`kind`, `width`, `doorType`) sin abrir la
consola. El tooltip agrega los argumentos que mandó el modelo cuando el error
fue `INVALID_ARGS`, y el JSON crudo cuando llegó cortado.

Si el proveedor agota el presupuesto de salida, la respuesta lleva el chip
`respuesta cortada`. No es una falla del modelo: una llamada a mitad de JSON se
pierde, y sin ese aviso parecía un error de argumentos. El loop además distingue
`ARGUMENTS_TRUNCATED` de `INVALID_ARGS` y, cuando el modelo repite el mismo
error de argumentos, prueba una ronda con el proveedor de respaldo antes de
cerrar el turno.

## Límites del chat de ayuda

- Solo puede ejecutar `crear_proyecto`, `abrir_proyecto`, `ir_a_proyectos`,
  `invitar_colaborador` y `explicar`.
- No importa `agentLoop`, `executeTool`, `useScene` ni `useEditor`.
- Ante una pregunta, el servidor degrada cualquier acción a `explicar`.
- Si el proveedor de IA falla, responde con `lib/ayuda/knowledge.ts`.
- El historial vive en `localStorage` con la clave
  `dizelf.ayuda.chat:<usuarioId>`; no hay persistencia en base de datos.

## Backend

`POST /api/ia/help` reutiliza `guardiaIA` (sesión + límite por usuario) y
`chatConCadena` (HF Space → OpenRouter). El prompt y el parser tolerante viven
en `lib/ia/helpPrompt.ts`.
