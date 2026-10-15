"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  rangeFor,
  readPath,
  type FieldGroup,
  type FieldSpec,
} from "@/lib/editor/node-fields";
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
};

/**
 * El registro del paquete etiqueta todo en inglés ("Wall", "Slab"). El
 * prototipo consultaba el registro primero y por eso nunca llegaba a su mapa
 * en español: el panel salía en inglés. Acá va el español primero.
 */
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? nodeRegistry.get(kind)?.presentation?.label ?? kind;
}

export function PropertiesPanel() {
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
    <aside aria-label="Propiedades del elemento seleccionado" className={s.props}>
      <header className={s.propsHead}>
        <Icon className="h-[26px] w-[26px] shrink-0 opacity-85" />
        <div className="min-w-0 flex-1">
          <p className={s.propsKind}>{kindLabel(node.type)}</p>
          <p className={s.propsSubid}>{node.type}</p>
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

  const shown = displayValue(node, field);
  const isReadOnly = field.kind === "metric" || !field.path;

  useEffect(() => {
    if (!editing) return;
    setDraft(
      typeof shown === "number"
        ? String(Number(shown.toFixed(field.precision ?? 3)))
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
    if (options.length === 0) return <MetricRow field={field} shown={shown} />;
    return (
      <div className={s.propsRow}>
        <span className={s.propsLabel}>{field.label}</span>
        <select
          aria-label={field.label}
          className={s.propsSelect}
          onChange={(e) => onWrite(field, e.target.value)}
          value={String(shown)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span />
      </div>
    );
  }

  if (field.kind === "text" || field.kind === "color") {
    const raw = readPath(node, field.path ?? []);
    if (typeof raw !== "string") return <MetricRow field={field} shown={shown} />;
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
              value={/^#[0-9a-f]{6}$/i.test(raw) ? raw : "#ffffff"}
            />
            <span className={s.propsColorTxt}>{raw}</span>
          </span>
          <span />
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
            {shown}
          </button>
        )}
        <span />
      </div>
    );
  }

  if (isReadOnly) return <MetricRow field={field} shown={shown} />;

  const range = rangeFor(node, field);
  // `displayValue` devuelve "—" cuando la propiedad todavía no existe en el
  // nodo (es opcional: un muro nuevo no tiene `thickness` hasta que lo
  // editás). `Number("—")` es NaN, y un `value={NaN}` en un range hace saltar
  // el warning de React. El texto ya muestra "—"; el slider no va hasta que
  // exista un número.
  const valor = typeof shown === "number" && Number.isFinite(shown) ? shown : null;
  const display = valor !== null ? formatValue(field, valor) : "—";

  return (
    <div className={`${s.propsRow} ${s.propsRowNum}`}>
      <span className={s.propsLabel}>{field.label}</span>
      {editing ? (
        <input
          autoFocus
          className={s.propsInput}
          inputMode="decimal"
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
      {range && valor !== null && (
        <input
          aria-label={`Ajustar ${field.label}`}
          className={s.propsRange}
          max={range.max}
          min={range.min}
          onChange={(e) => onWrite(field, Number(e.target.value))}
          step={field.step ?? 0.01}
          type="range"
          value={valor}
        />
      )}
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
