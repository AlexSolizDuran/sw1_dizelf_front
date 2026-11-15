# Conocimiento (RAG)

Asistente semi-experto: recupera tarjetas de referencia y las inyecta como
contexto en el prompt. **No agrega tools**: en Plan siguen siendo las 6 de
lectura.

## Flujo

```
pedido
  → decidirConocimiento()   ¿consulta o acción?
  → construirDiagnostico()  hechos medidos del nivel activo
  → POST /api/ia/conocimiento
      → bge-m3 (HF Space) + BM25 → fusión RRF → top-3
  → bloque en el system prompt
  → Qwen responde citando el id de cada tarjeta
```

## Cuándo se usa

| Modo | Pedido | RAG |
|---|---|---|
| Plan | cualquiera | completo (3 tarjetas) |
| Build | pregunta | completo (3) |
| Build | mixto ("¿necesita ventana? agregala") | 2 tarjetas |
| Build | acción pura | no |

## Archivos

| Archivo | Qué hace | Lado |
|---|---|---|
| `tarjetas.json` | 32 tarjetas genéricas, sin jurisdicción | datos |
| `esquema.ts` | validación Zod y tipos | ambos |
| `tarjetas.ts` | loader + hash de contenido | servidor |
| `vectores.json` | índice generado (32 × 1024) | servidor |
| `recuperar.ts` | denso + léxico, fusión RRF | servidor |
| `lexico.ts` | tokenizer español + BM25 | ambos |
| `embeddings.ts` | cliente del Space con timeout | servidor |
| `contexto.ts` | bloque de prompt y recorte | ambos |
| `reglas.ts` | reglas que acompañan al bloque | ambos |
| `diagnostico.ts` | superficies, aberturas, alertas | cliente |
| `intencion.ts` | consulta / acción / mixta | cliente |
| `cliente.ts` | fetch del endpoint | cliente |
| `../../app/api/ia/conocimiento/route.ts` | API | servidor |

## Reindexar

Obligatorio cada vez que cambia `tarjetas.json`:

```bash
npm run indexar:conocimiento
```

Si el hash no coincide, `recuperar.ts` detecta el índice viejo y usa solo la
búsqueda léxica. Nunca devuelve resultados de un índice desactualizado sin
avisar (`origen: "lexico"`).

## Evaluar

```bash
npm run dev
npm run evaluar:conocimiento
```

26 consultas con su tarjeta esperada. Mide recall@3 del pipeline real.

## Variables

| Variable | Default | Para qué |
|---|---|---|
| `EMBEDDINGS_URL` | Space `ia-Marranque` | Servicio de embeddings |
| `EMBEDDINGS_TIMEOUT_MS` | `8000` | Corte por consulta |
| `EMBEDDINGS_TOKEN` | vacío | `X-API-Key` si el Space lo exige |
| `EMBEDDINGS_DIMENSIONS` | `1024` | Validación de la respuesta |

Si el servicio falla o tarda, la consulta sigue con BM25. El chat nunca queda
bloqueado por el embedding.

## Contenido

Las tarjetas son **referencias generales de diseño**, no normativa de un país
o municipio. No hay citas legales ni artículos. El campo `ambito` queda
reservado para cuando se agreguen tarjetas locales.
