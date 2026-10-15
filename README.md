# DIZELF — frontend

Frontend de DIZELF: landing, autenticación, lista de proyectos y el editor de
planos arquitectónicos 2D/3D.

El backend (NestJS + Prisma + Neon) vive en `../dizelf_back` y es independiente.

## Stack

| Paquete | Versión |
|---|---|
| next | 16.3.4 |
| react / react-dom | 19.2.8 |
| typescript | 5.9 |
| tailwindcss | 4.3 |
| zustand | 5.0 |
| lucide-react | 1.51 |
| @pascal-app/core, editor, viewer | 0.9.2 |
| @pascal-app/nodes | 0.1.1 |
| three / @react-three/fiber / drei | 0.185 / 9 / 10 |

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Landing |
| `/login`, `/register` | Autenticación |
| `/proyectos` | Lista de proyectos, crear, abrir y eliminar |
| `/editor/[proyectoId]` | El editor 2D/3D |

## Arrancar

Dos terminals. El backend va en `:3001`, el front en `:3000`.

```bash
# terminal 1 — backend
cd ../dizelf_back
cp .env.example .env      # y completar NEON_DB_URL, JWT_SECRET
npm install
npm run start:dev

# terminal 2 — frontend
npm install
npm run dev
```

Abrir <http://localhost:3000>.

El frontend no necesita `.env`: `NEXT_PUBLIC_API_URL` cae a
`http://localhost:3001` si no está definida. Para apuntar a otro backend:

```bash
echo "NEXT_PUBLIC_API_URL=https://api.tuservidor.com" > .env.local
```

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL del backend | `http://localhost:3001` |

No hay secretos en el frontend. El JWT viaja en una cookie `HttpOnly` que fija
el backend; nunca se guarda en `localStorage` ni se manda por header.

## Autenticación

1. `/register` o `/login` → el backend responde `201`/`200` y setea la cookie.
2. `Navbar` llama a `GET /auth/perfil` al montar para recuperar la sesión.
3. `checkSession()` deja `isInitialized: true` pase lo que pase.

**El guard de rutas es de cliente.** No hay `middleware.ts` ni lectura de cookie
en servidor, así que `/proyectos` y `/editor/[id]` renderizan y después redirigen
si no hay sesión. Se ve un instante. Queda como deuda.

## Persistencia de la escena

El documento del plano vive en `proyecto.esquema_json` (JSONB) del backend:

```json
{ "version": 1, "vista": "2d", "scene": { "nodes": {}, "rootNodeIds": [] } }
```

Se carga con `GET /proyectos/:id` y se guarda con `PATCH /proyectos/:id`.
El autosave lo trae el paquete editor con debounce de 1 s.

## Cosas que conviene saber antes de tocar algo

- **El editor pesa ~1,6 MB gzip** y está aislado en su ruta. Las páginas
  estáticas no cargan ni un chunk de three.js. Si tocás algo que el editor
  importa, verificá que eso siga siendo así.
- **Los assets (modelos `.glb`, texturas, thumbnails) vienen de un bucket de
  Supabase de un tercero**, no nuestro. Ver `src/components/editor/README.md`.
- **No hay control de concurrencia ni historial** en el backend. Dos personas
  editando el mismo proyecto se pisan.
- `npm audit` reporta 3 vulnerabilidades en `next@16.3.4` (RCE en `next/og`,
  SSRF en Image Optimization, entre otras). Hay upgrade pendiente a 16.4.0.

## Convenciones

Están en [`AGENTS.md`](./AGENTS.md) y en la skill
[`.opencode/skills/nextjs-frontend-standards/`](./.opencode/skills/nextjs-frontend-standards/SKILL.md).
La skill es la referencia completa: stack validado, reglas de integración de
`@pascal-app`, tokens y los 7 factores de calidad.
