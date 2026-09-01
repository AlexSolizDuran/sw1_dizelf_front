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
