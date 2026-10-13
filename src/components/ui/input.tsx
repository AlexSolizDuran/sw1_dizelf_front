"use client";

import React, { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
  isPassword?: boolean;
  rightAction?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      icon,
      error,
      isPassword = false,
      rightAction,
      className = "",
      type = "text",
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {(label || rightAction) && (
          <div className="flex items-center justify-between text-xs font-medium text-[#6B5E55]">
            {label && <label>{label}</label>}
            {rightAction && <div className="text-xs">{rightAction}</div>}
          </div>
        )}

        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-[#8A7C73] pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}

          <input
            ref={ref}
            type={resolvedType}
            className={`w-full bg-[#FAF9F7] text-[#2B2A28] placeholder-[#A3978E] text-sm border-b-2 border-[#E5DFD7] focus:border-[#8C432A] py-2.5 transition-colors duration-150 outline-none ${
              icon ? "pl-9" : "pl-3"
            } ${isPassword ? "pr-10" : "pr-3"} ${
              error ? "border-red-500 focus:border-red-600" : ""
            } ${className}`}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 text-[#8A7C73] hover:text-[#5A4E46] p-1 focus:outline-none"
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {error && <span className="text-xs text-red-600 mt-0.5">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
