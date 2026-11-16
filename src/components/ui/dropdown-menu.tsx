"use client";

import React, { useEffect, useRef } from "react";

export interface DropdownOption {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  options: DropdownOption[];
  align?: "left" | "right";
  label: string;
}

/** Menú flotante accesible para los 3 puntos de cada card. */
export function DropdownMenu({
  open,
  onClose,
  options,
  align = "right",
  label,
}: DropdownMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`absolute top-11 z-30 w-44 bg-white rounded-xl border border-[#EAE3DA] py-1.5 ${
        align === "right" ? "right-3" : "left-3"
      }`}
    >
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          role="menuitem"
          onClick={() => {
            opt.onSelect();
            onClose();
          }}
          className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-left transition-colors ${
            opt.danger
              ? "text-red-600 hover:bg-red-50"
              : "text-[#4A3E36] hover:bg-[#FAF7F2]"
          }`}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
