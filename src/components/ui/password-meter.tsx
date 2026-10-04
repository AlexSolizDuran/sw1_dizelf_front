"use client";

import React from "react";
import { Check, X } from "lucide-react";

interface PasswordMeterProps {
  password: string;
}

export function PasswordMeter({ password }: PasswordMeterProps) {
  if (!password) return null;

  const rules = [
    { label: "Mínimo 8 caracteres", met: password.length >= 8 },
    { label: "Una letra mayúscula", met: /[A-Z]/.test(password) },
    { label: "Una letra minúscula", met: /[a-z]/.test(password) },
    { label: "Un número (0-9)", met: /[0-9]/.test(password) },
    { label: "Un símbolo especial (!@#$%...)", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = rules.filter((r) => r.met).length;

  // Colores por nivel de fortaleza
  const getStrengthMeta = () => {
    if (score <= 2) return { label: "Débil", color: "bg-red-500", text: "text-red-600" };
    if (score <= 4) return { label: "Moderada", color: "bg-amber-500", text: "text-amber-600" };
    return { label: "Segura", color: "bg-emerald-600", text: "text-emerald-700" };
  };

  const meta = getStrengthMeta();

  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[#6B5E55] font-medium">Fortaleza:</span>
        <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 h-1.5">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`h-full rounded-full transition-colors duration-200 ${
              level <= score ? meta.color : "bg-[#E6DFD7]"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 text-[11px] text-[#7A6D63]">
        {rules.map((rule, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            {rule.met ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-[#A89D95] shrink-0" />
            )}
            <span className={rule.met ? "text-emerald-800 font-medium" : "text-[#8A7D75]"}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
