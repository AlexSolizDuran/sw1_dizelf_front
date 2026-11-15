import type { NextRequest } from "next/server";
import { getAdapter } from "@/lib/ia/adapters";
import { IA_DEFAULT_PROVIDER, esProveedorIA } from "@/lib/ia/config";
import { guardiaIA } from "@/lib/ia/server/guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guardia = await guardiaIA(request, "health", { consumirLimite: false });
  if (!guardia.ok) return guardia.respuesta;

  const raw =
    request.nextUrl.searchParams.get("provider") ?? IA_DEFAULT_PROVIDER;
  const provider = esProveedorIA(raw) ? raw : IA_DEFAULT_PROVIDER;

  try {
    const health = await getAdapter(provider).health();
    return Response.json({ provider, ...health });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ provider, ok: false, error: message });
  }
}
