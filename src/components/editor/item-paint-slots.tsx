"use client";

import { isSlotMaterialName, type ItemNode, SLOT_MATERIAL_PREFIX } from "@pascal-app/core";
import { useFrame } from "@react-three/fiber";
import { createElement, useEffect, useRef, useState, type ComponentType } from "react";
import type { Group, Material, Mesh } from "three";

/**
 * Slot de reserva para los GLB cuyos materiales no fueron exportados con el
 * prefijo `slot_`. El editor solo puede pintar mallas etiquetadas con un slot;
 * sin esa etiqueta `itemPaint.resolveRole` devuelve `null` y el objeto queda
 * sin pintar aunque el usuario elija un material.
 */
const SLOT_FALLBACK_ID = "surface";
const SLOT_FALLBACK_MATERIAL_NAME = `${SLOT_MATERIAL_PREFIX}${SLOT_FALLBACK_ID}`;

type ItemCapture = {
  captured?: boolean;
};

type ItemUserData = {
  pascalItemMaterialCapture?: ItemCapture;
  slotId?: unknown;
};

/**
 * Envuelve el renderer de `item` y garantiza que toda malla del GLB tenga un
 * slot pintable. Al renombrar el material y borrar su captura, el renderer
 * original vuelve a capturar en el siguiente montaje y ya deriva el slot
 * `surface` del nombre. El `key` fuerza ese remontaje.
 *
 * El GLB entra por `Suspense`, así que la malla aún no existe cuando corren
 * los efectos del mount: se comprueba por frame hasta que aparece (una sola
 * vez por asset).
 */
export function createItemPaintSlotsRenderer<Node extends ItemNode>(
  Original: ComponentType<{ node: Node }>
): ComponentType<{ node: Node }> {
  return function ItemPaintSlotsRenderer({ node }: { node: Node }) {
    const groupRef = useRef<Group>(null);
    const aplicadoRef = useRef(false);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
      aplicadoRef.current = false;
    }, [node.asset?.src]);

    useFrame(() => {
      if (aplicadoRef.current) return;
      const root = groupRef.current;
      if (!root) return;

      let renamed = false;
      let modeloCapturado = false;
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const userData = mesh.userData as ItemUserData;
        // Solo tocamos mallas del GLB: el renderer propio ya las marcó con
        // su captura. Los nodos huésped tienen sus propios materiales/slots.
        if (!userData.pascalItemMaterialCapture?.captured) return;
        modeloCapturado = true;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials as Material[]) {
          if (!material || isSlotMaterialName(material.name ?? "")) continue;
          material.name = SLOT_FALLBACK_MATERIAL_NAME;
          renamed = true;
        }
        if (renamed) {
          delete userData.pascalItemMaterialCapture;
          userData.slotId = undefined;
        }
      });

      if (renamed) {
        aplicadoRef.current = true;
        setRevision((value) => value + 1);
      } else if (modeloCapturado) {
        // Todos los materiales ya tenían slot: no hace falta seguir sondeando.
        aplicadoRef.current = true;
      }
    });

    return createElement(
      "group",
      { key: revision, ref: groupRef },
      createElement(Original, { node })
    );
  };
}
