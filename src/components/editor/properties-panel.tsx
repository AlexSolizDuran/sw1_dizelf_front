"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { nodeRegistry, useScene, type AnyNode, type AnyNodeId } from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { useEditor } from "@pascal-app/editor";
import { Box, ChevronDown, Copy, Move, Search, Trash2, X } from "lucide-react";
import {
  displayValue,
  formatValue,
  groupsForNode,
  optionsFor,
  patchFor,
  readPath,
  type FieldGroup,
  type FieldSpec,
} from "@/lib/editor/node-fields";
import { optionLabel } from "@/lib/editor/labels";
import { iconForKind } from "./icons/registry-patch";
import s from "./editor.module.css";

/** Nombre en español de cada tipo de nodo. */
const KIND_LABELS: Record<string, string> = {
  wall: "Muro",
  slab: "Piso",
  ceiling: "Cielo raso",
  zone: "Zona",
  column: "Columna",
  item: "Objeto",
  door: "Puerta",
  window: "Ventana",
  stair: "Escalera",
  "stair-segment": "Tramo",
  shelf: "Estante",
  elevator: "Ascensor",
  roof: "Cubierta",
  "roof-segment": "Faldón",
  fence: "Cercado",
  building: "Edificio",
  level: "Nivel",
  site: "Terreno",
  cabinet: "Mueble",
  "cabinet-module": "Módulo de mueble",
  skylight: "Claraboya",
  gutter: "Canaleta",
  downspout: "Bajante",
  dormer: "Buhardilla",
  chimney: "Chimenea",
  cupola: "Cúpula",
  "box-vent": "Rejilla de ventilación",
  "ridge-vent": "Ventilación de cumbrera",
  "turbine-vent": "Extractor eólico",
  "eyebrow-vent": "Ventilación de alero",
  "duct-fitting": "Accesorio de conducto",
  "duct-segment": "Conducto",
  "duct-terminal": "Rejilla de conducto",
  "hvac-equipment": "Equipo HVAC",
  "pipe-fitting": "Accesorio de tubería",
  "pipe-segment": "Tubería",
  "pipe-trap": "Sifón",
  "solar-panel": "Panel solar",
  measurement: "Medición",
  guide: "Guía",
  scan: "Escaneo",
  spawn: "Punto de inicio",
  lineset: "Línea de refrigerante",
  "liquid-line": "Línea de líquido",
};

/**
 * El registro del paquete etiqueta todo en inglés ("Wall", "Slab"). El
 * prototipo consultaba el registro primero y por eso nunca llegaba a su mapa
 * en español: el panel salía en inglés. Acá va el español primero.
 */
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? nodeRegistry.get(kind)?.presentation?.label ?? kind;
}

export function PropertiesPanel({
  compacto = false,
}: {
  /** Con el chat abierto el inspector se queda con la mitad superior de la columna. */
  compacto?: boolean;
}) {
  const selectedIds = useViewer((st) => st.selection.selectedIds);
  const zoneId = useViewer((st) => st.selection.zoneId);
  const setSelection = useViewer((st) => st.setSelection);
  const setSelectedReferenceId = useEditor((st) => st.setSelectedReferenceId);
  const setMovingNode = useEditor((st) => st.setMovingNode);
  const setMode = useEditor((st) => st.setMode);
  const setTool = useEditor((st) => st.setTool);
  const [query, setQuery] = useState("");
  const [restOpen, setRestOpen] = useState(false);

  const ids = selectedIds as AnyNodeId[];
  const targetId: AnyNodeId | null =
    ids.length === 1 ? ids[0] : zoneId && ids.length === 0 ? (zoneId as AnyNodeId) : null;

  const node = useScene((st) => (targetId ? (st.nodes[targetId] ?? null) : null));

  useEffect(() => {
    setQuery("");
  }, [targetId]);

  /** Réplica del path del inspector oficial: derive → reconcile → un updateNodes. */
  const commit = useCallback(
    (spec: FieldSpec, value: unknown) => {
      if (!targetId) return;
      const scene = useScene.getState();
      const current = scene.nodes[targetId];
      if (!current) return;
      const parametrics = nodeRegistry.get(current.type)?.parametrics;

      let patch = patchFor(current, spec, value);
      if (parametrics?.derive) {
        patch = { ...patch, ...parametrics.derive({ ...current, ...patch } as AnyNode, patch) };
      }
      const updates: { id: AnyNodeId; data: Partial<AnyNode> }[] = [
        { id: targetId, data: patch as Partial<AnyNode> },
      ];
      if (parametrics?.reconcile) {
        updates.push(...parametrics.reconcile(current, { ...current, ...patch } as AnyNode));
      }
      scene.updateNodes(updates);
    },
    [targetId],
  );

  const close = useCallback(() => {
    setSelection({ selectedIds: [], zoneId: null });
    setSelectedReferenceId(null);
  }, [setSelection, setSelectedReferenceId]);

  const handleMove = useCallback(() => {
    if (!node) return;
    setMovingNode(node as never);
    close();
  }, [node, setMovingNode, close]);

  const handleDuplicate = useCallback(() => {
    if (!node) return;
    const scene = useScene.getState();
    const { id: _id, parentId, ...rest } = node;
    const nextId = `${node.type}_${Math.random().toString(36).slice(2, 18)}`;
    scene.createNode({ ...rest, id: nextId } as never, (parentId ?? undefined) as never);
  }, [node]);

  const handleDelete = useCallback(() => {
    if (!targetId) return;
    useScene.getState().deleteNodes([targetId]);
    close();
  }, [targetId, close]);

  const { curated, rest } = useMemo(
    () => (node ? groupsForNode(node) : { curated: [], rest: [] }),
    [node],
  );

  const filterGroups = (groups: FieldGroup[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (f) =>
            f.label.toLowerCase().includes(q) ||
            (f.path ? f.path.join(".").toLowerCase().includes(q) : false),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  };

  const visibleCurated = filterGroups(curated);
  const visibleRest = filterGroups(rest);

  // Sin selección no hay panel: se desmonta entero. Antes mostraba un mensaje
  // ("Ningún elemento seleccionado") que ocupaba la esquina del visor sin
  // aportar nada y tapaba el plano.
  if (!node) return null;

  const def = nodeRegistry.get(node.type);
  const canMove = !!def?.capabilities.movable;
  const canDelete = def?.capabilities.deletable !== false;
  const totalRest = rest.reduce((acc, group) => acc + group.fields.length, 0);
  const Icon = iconForKind(node.type) ?? Box;

  return (
    <aside
      aria-label="Propiedades del elemento seleccionado"
      className={`${s.props}${compacto ? ` ${s.propsMitad}` : ""}`}
    >
      <header className={s.propsHead}>
        <Icon className="h-[26px] w-[26px] shrink-0 opacity-85" />
        <div className="min-w-0 flex-1">
          <p className={s.propsKind}>{kindLabel(node.type)}</p>
        </div>
        <button aria-label="Cerrar" className={s.propsX} onClick={close} type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className={s.propsSearch}>
        <Search className="h-3 w-3 shrink-0 opacity-60" />
        <input
          aria-label="Filtrar propiedades"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar…"
          value={query}
        />
      </div>

      <div aria-label="Campos del elemento" className={s.propsBody} role="region" tabIndex={0}>
        <div className={s.propsCols}>
          <span>Parámetro</span>
          <span>Valor</span>
          <span>u.</span>
        </div>

        {visibleCurated.map((group) => (
          <Group key={group.id} group={group} node={node} onWrite={commit} />
        ))}

        {visibleRest.length > 0 && (
          <div className="mt-2">
            <button
              className={s.propsFold}
              onClick={() => setRestOpen((v) => !v)}
              type="button"
            >
              <span className={s.techLabel}>Avanzado</span>
              <span className={s.toolKey}>{totalRest}</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${restOpen ? "rotate-180" : ""}`}
              />
            </button>
            {restOpen &&
              visibleRest.map((group) => (
                <Group key={group.id} group={group} node={node} onWrite={commit} />
              ))}
          </div>
        )}
      </div>

      <footer className={s.propsFoot}>
        {canMove && (
          <button className={s.propsAct} onClick={handleMove} type="button">
            <Move className="h-3.5 w-3.5" />
            Mover
          </button>
        )}
        <button
          className={s.propsAct}
          onClick={() => {
            setMode("select");
            setTool(null);
            handleDuplicate();
          }}
          type="button"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicar
        </button>
        {canDelete && (
          <button
            className={`${s.propsAct} ${s.propsActDanger}`}
            onClick={handleDelete}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        )}
      </footer>
    </aside>
  );
}

function Group({
  group,
  node,
  onWrite,
}: {
  group: FieldGroup;
  node: AnyNode;
  onWrite: (spec: FieldSpec, value: unknown) => void;
}) {
  const [open, setOpen] = useState(true);
  const collapsible = group.fields.length > 6;

  return (
    <section className={s.propsGroup}>
      <button
        className={s.propsFold}
        onClick={() => collapsible && setOpen((v) => !v)}
        type="button"
      >
        <span className={s.techLabel}>{group.label}</span>
        <span className={s.toolKey}>{group.fields.length}</span>
        {collapsible && (
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        )}
      </button>
      {(!collapsible || open) &&
        group.fields.map((field) => (
          <Row
            key={field.label + (field.path?.join(".") ?? "")}
            field={field}
            node={node}
            onWrite={onWrite}
          />
        ))}
    </section>
  );
}

function Row({
  field,
  node,
  onWrite,
}: {
  field: FieldSpec;
  node: AnyNode;
  onWrite: (spec: FieldSpec, value: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const shown = displayValue(node, field);
  const isReadOnly = field.kind === "metric" || !field.path;
  const suggestions = field.suggestions ?? [];
  const datalist =
    suggestions.length > 0 ? (
      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    ) : null;

  useEffect(() => {
    if (!editing) return;
    setDraft(
      typeof shown === "number"
        ? String(Number(shown.toFixed(field.precision ?? 3)))
        : shown === "—"
          ? ""
          : shown
    );
    // El frame se cancela al desmontar o al salir del modo edición: si no, el
    // callback queda pendiente sobre un `inputRef` ya nulo.
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
  }, [editing, shown, field.precision]);

  if (field.kind === "bool") {
    const raw = readPath(node, field.path ?? []);
    const on = raw === true;
    return (
      <div className={s.propsRow}>
        <span className={s.propsLabel}>{field.label}</span>
        <button
          aria-pressed={on}
          aria-label={field.label}
          className={s.propsCheck}
          data-on={on}
          onClick={() => onWrite(field, !on)}
          type="button"
        >
          <span />
        </button>
        <span />
      </div>
    );
  }

  if (field.kind === "enum") {
    const options = optionsFor(node, field);

    // Toda opción que exista en el schema se dibuja, aunque el nodo no tenga
    // el campo: antes un enum sin opciones se convertía en una fila muerta.
    if (options.length > 0) {
      const actual = String(shown);
      const seleccionado = options.includes(actual) ? actual : "";
      return (
        <div className={s.propsRow}>
          <span className={s.propsLabel}>{field.label}</span>
          <span className={s.propsSelectWrap}>
            <select
              aria-label={field.label}
              className={s.propsSelect}
              onChange={(e) => onWrite(field, e.target.value)}
              value={seleccionado}
            >
              {seleccionado === "" ? (
                <option disabled value="">
                  Sin definir
                </option>
              ) : null}
              {options.map((option) => (
                <option key={option} value={option}>
                  {optionLabel(option, field.path)}
                </option>
              ))}
            </select>
          </span>
          <span />
        </div>
      );
    }
    // Sin opciones conocidas cae al editor de texto: mejor escribir un valor
    // que dejar el campo sin forma de cambiarlo.
  }

  if (field.kind === "text" || field.kind === "color" || field.kind === "enum") {
    const raw = readPath(node, field.path ?? []);
    const valor = typeof raw === "string" ? raw : String(shown);
    // Un texto vacío se veía como una celda en blanco; con esto se entiende que
    // el campo existe y se puede completar.
    const mostrar = valor === "—" ? "Sin definir" : valor;
    if (field.kind === "color") {
      return (
        <div className={s.propsRow}>
          <span className={s.propsLabel}>{field.label}</span>
          <span className={s.propsColorWrap}>
            <input
              aria-label={field.label}
              className={s.propsColor}
              onChange={(e) => onWrite(field, e.target.value)}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#ffffff"}
            />
            {editing ? (
              <input
                aria-label={`Editar ${field.label}`}
                autoFocus
                className={s.propsColorInput}
                list={suggestions.length > 0 ? listId : undefined}
                onBlur={() => {
                  const escrito = draft.trim();
                  const hex = /^[0-9a-f]{6}$/i.test(escrito)
                    ? `#${escrito}`
                    : escrito;
                  if (/^#[0-9a-f]{6}$/i.test(hex)) onWrite(field, hex);
                  setEditing(false);
                }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(false);
                }}
                ref={inputRef}
                value={draft}
              />
            ) : (
              <button
                aria-label={`Editar ${field.label}`}
                className={s.propsColorTxt}
                onClick={() => setEditing(true)}
                type="button"
              >
                {valor}
              </button>
            )}
          </span>
          <span />
          {datalist}
        </div>
      );
    }
    return (
      <div className={s.propsRow}>
        <span className={s.propsLabel}>{field.label}</span>
        {editing ? (
          <input
            autoFocus
            className={s.propsInput}
            list={suggestions.length > 0 ? listId : undefined}
            onBlur={() => {
              onWrite(field, draft);
              setEditing(false);
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            ref={inputRef}
            value={draft}
          />
        ) : (
          <button
            aria-label={`Editar ${field.label}`}
            className={`${s.propsInput} ${s.propsInputIdle}`}
            onClick={() => setEditing(true)}
            type="button"
          >
            {mostrar}
          </button>
        )}
        <span />
        {datalist}
      </div>
    );
  }

  if (isReadOnly) return <MetricRow field={field} shown={shown} />;

  const display =
    typeof shown === "number" && Number.isFinite(shown)
      ? formatValue(field, shown)
      : "—";

  return (
    <div className={s.propsRow}>
      <span className={s.propsLabel}>{field.label}</span>
      {editing ? (
        <input
          autoFocus
          className={s.propsInput}
          inputMode="decimal"
          list={suggestions.length > 0 ? listId : undefined}
          onBlur={() => {
            const parsed = Number(draft);
            if (Number.isFinite(parsed)) onWrite(field, parsed);
            setEditing(false);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          ref={inputRef}
          value={draft}
        />
      ) : (
        <button
          aria-label={`Editar ${field.label}`}
          className={`${s.propsInput} ${s.propsInputIdle}`}
          onClick={() => setEditing(true)}
          type="button"
        >
          {display}
        </button>
      )}
      <span className={s.propsUnit}>{field.unit ?? ""}</span>
      {datalist}
    </div>
  );
}

function MetricRow({ field, shown }: { field: FieldSpec; shown: number | string }) {
  const valor = typeof shown === "number" && Number.isFinite(shown) ? shown : null;
  return (
    <div className={s.propsRow} data-read="true">
      <span className={s.propsLabel}>{field.label}</span>
      <span className={s.propsMetric}>
        {valor !== null && field.kind === "number" ? formatValue(field, valor) : shown}
      </span>
      <span className={s.propsUnit}>{field.unit ?? ""}</span>
    </div>
  );
}
