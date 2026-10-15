import {
  AppWindow,
  BetweenHorizontalStart,
  Box,
  Boxes,
  Braces,
  BrickWall,
  Building2,
  ChevronsUpDown,
  Circle,
  CircleDot,
  Columns3,
  Compass,
  Crosshair,
  DoorOpen,
  Droplet,
  Fan,
  Fence,
  Flame,
  Footprints,
  Hammer,
  Home,
  Landmark,
  Layers,
  Layers3,
  Map,
  Minus,
  Package,
  Paintbrush,
  PanelTop,
  Plug,
  Ruler,
  Rows3,
  Save,
  Scan,
  Share2,
  Sofa,
  Sparkles,
  Square,
  Sun,
  Triangle,
  Warehouse,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icono por tipo de nodo.
 *
 * El paquete declara sus iconos como rutas webp (`/icons/wall.webp` y 23 más),
 * y las renderiza en el menú flotante de acciones y en el menú 2D. Copiar esos
 * archivos desde el prototipo significaba heredar sus recursos gráficos; este
 * mapa las reemplaza por el set que ya usa el proyecto.
 *
 * Los tipos sin entrada propia caen en `Box`.
 */
export const KIND_ICON: Record<string, LucideIcon> = {
  // Estructura
  wall: BrickWall,
  slab: Layers3,
  ceiling: PanelTop,
  column: Columns3,
  roof: Warehouse,
  "roof-segment": Triangle,
  fence: Fence,
  stair: BetweenHorizontalStart,
  "stair-segment": Footprints,
  elevator: ChevronsUpDown,
  zone: Boxes,

  // Aberturas
  door: DoorOpen,
  window: AppWindow,

  // Mobiliario y equipamiento
  item: Box,
  cabinet: Package,
  "cabinet-module": Boxes,
  shelf: Rows3,
  "solar-panel": Zap,
  "hvac-equipment": Fan,
  "turbine-vent": Fan,
  "liquid-line": Droplet,

  // Instalaciones
  "duct-fitting": Plug,
  "duct-segment": Square,
  "duct-terminal": CircleDot,
  "pipe-fitting": Plug,
  "pipe-segment": Square,
  "pipe-trap": Circle,
  chimney: Flame,
  downspout: Droplet,
  gutter: Minus,
  "ridge-vent": Wind,
  "box-vent": Wind,
  "eyebrow-vent": Sparkles,
  skylight: Sun,
  cupola: Landmark,
  dormer: Home,
  spawn: Crosshair,

  // Contenedores
  site: Map,
  building: Building2,
  level: Layers,

  // Auxiliares del editor
  guide: Ruler,
  measurement: Ruler,
  scan: Scan,
  lineset: Share2,
};

/** Iconos de las herramientas de la pestaña Construir. */
export const TOOL_ICON: Record<string, LucideIcon> = {
  wall: BrickWall,
  door: DoorOpen,
  window: AppWindow,
  slab: Layers3,
  column: Columns3,
  ceiling: PanelTop,
  stair: BetweenHorizontalStart,
  roof: Warehouse,
  zone: Boxes,
};

export { Boxes, Braces, Compass, Hammer, Paintbrush, Save, Sofa, X };
