"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetInput } from "@pascal-app/core";
import { useEditor } from "@pascal-app/editor";
import { useViewer } from "@pascal-app/viewer";
import { ChevronRight, Search } from "lucide-react";
import {
  CATALOG_ES_ITEMS,
  CATALOG_GROUPS,
  matchesGroup,
  type CatalogGroup,
} from "@/lib/editor/catalog-es";
import s from "./editor.module.css";

/**
 * Catálogo de mobiliario y electrodomésticos.
 *
 * Panel propio, en español. No usa el `ItemsPanel` del paquete porque sus
 * controles vienen en inglés y su grilla de categorías muestra solo íconos.
 *
 * Los grupos van plegados: se ven los 10 títulos con su cantidad y se despliega
 * el que se cliquea. Antes había una barra que filtraba y una grilla con scroll
 * propio, que obligaba a un mini-scroll por tipo; ahora es un solo scroll y el
 * índice completo está a la vista.
 *
 * La lista de categorías es cerrada (`CATALOG_GROUPS`): sin grupo "Todos" ni
 * grupo "Otros", así que lo que no entre en una de las 10 no se muestra.
 *
 * Colocar un objeto arma la herramienta `item` (o la que traiga el ítem, como
 * el gabinete paramétrico) y limpia la selección, que es el mismo gesto que
 * hace el catálogo oficial.
 */
export function MueblesTab() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const setPhase = useEditor((st) => st.setPhase);
  const setMode = useEditor((st) => st.setMode);
  const setTool = useEditor((st) => st.setTool);
  const setSelectedItem = useEditor((st) => st.setSelectedItem);
  const selectedItem = useEditor((st) => st.selectedItem);
  const setSelection = useViewer((st) => st.setSelection);

  // Los ítems viven en la fase de amenable: varias capas asumen esa fase para
  // que la colocación enganche.
  useEffect(() => {
    setPhase("furnish");
  }, [setPhase]);

  /** Secciones a renderizar: cada grupo con los objetos que le pertenecen. */
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (item: (typeof CATALOG_ES_ITEMS)[number]) =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.tags ?? []).some((t) => t.toLowerCase().includes(q));

    const out: { group: CatalogGroup; items: typeof CATALOG_ES_ITEMS }[] = [];
    for (const group of CATALOG_GROUPS) {
      const items = CATALOG_ES_ITEMS.filter((i) => matchesGroup(i, group) && hit(i));
      if (items.length > 0) out.push({ group, items });
    }

    return out;
  }, [query]);

  const total = sections.reduce((a, sec) => a + sec.items.length, 0);

  // Con el buscador escrito no hay nada oculto que el usuario no haya pedido
  // ver, así que las secciones con resultados se muestran abiertas.
  const searching = query.trim().length > 0;
  const isOpen = (slug: string) => searching || open.has(slug);

  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const place = (item: AssetInput) => {
    setSelection({ selectedIds: [], zoneId: null });
    setSelectedItem(item);
    setTool((item as { tool?: string }).tool ?? "item");
    setMode("build");
  };

  return (
    <div className={s.catPanel}>
      <div className={s.catSearch}>
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input
          aria-label="Buscar objetos"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar objeto…"
          value={query}
        />
      </div>

      <div className={s.panelScroll}>
        {sections.length === 0 ? (
          <p className={s.catEmpty}>Sin resultados para “{query}”.</p>
        ) : (
          sections.map(({ group, items }) => {
            const Icon = group.icon;
            return (
              <section className={s.panelSection} key={group.slug}>
                <button
                  aria-expanded={isOpen(group.slug)}
                  className={s.panelSectionHead}
                  data-open={isOpen(group.slug)}
                  onClick={() => toggle(group.slug)}
                  type="button"
                >
                  <ChevronRight className={`h-3 w-3 shrink-0 ${s.panelSectionChev}`} />
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={s.panelSectionTitle}>{group.label}</span>
                  <span className={s.panelSectionN}>{items.length}</span>
                </button>

                {isOpen(group.slug) && (
                  <div className={s.catGrid}>
                    {items.map((item) => {
                      // La key es el `id`, no el `src`: `cabinet` y
                      // `kitchen-cabinet` comparten el mismo model.glb, y con
                      // `src` React se queja de claves duplicadas.
                      const active =
                        (selectedItem as { id?: string } | null)?.id === item.id;
                      return (
                        <button
                          className={s.catTile}
                          data-active={active}
                          key={item.id}
                          onClick={() => place(item)}
                          title={item.name}
                          type="button"
                        >
                          <span className={s.catThumb}>
                            {item.thumbnail ? (
                              <img
                                alt={item.name}
                                loading="lazy"
                                src={item.thumbnail}
                              />
                            ) : null}
                          </span>
                          <span className={s.catName}>{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <p className={s.hint}>
        {total} objetos. Elegí uno y hacé clic en el plano para colocarlo.
      </p>
    </div>
  );
}
