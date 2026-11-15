# AGENTS.md - dizelf_front

## Arquitectura
- Componentes reutilizables y composables
- Separación: presentación vs lógica
- State management centralizado

## Estructura de Directorios
src/
├── app/            # Páginas (App Router)
├── components/     # Componentes React
│   ├── ui/        # Componentes genéricos reutilizables
│   └── features/  # Componentes específicos por feature
├── hooks/         # Custom hooks
├── lib/           # Utilidades y helpers
├── stores/        # Estado global (Zustand)
└── types/         # Definiciones TypeScript

## Convenciones de Código
- Componentes funcionales + hooks
- Un componente por archivo
- Preferir Server Components cuando sea posible
- TypeScript estricto: no usar `any`

## Seguridad
- Nunca almacenar tokens en localStorage
- Sanitizar datos antes de renderizar
- Usar CSP headers
- No exponer API keys en cliente

## Comentarios
- Documentar props de componentes complejos
- Explicar side effects en hooks
- Mantener README de cada módulo

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
