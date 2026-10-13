"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed select-none";

  const sizeStyles = {
    sm: "text-xs px-3 py-1.5 rounded-md gap-1.5",
    md: "text-sm px-4 py-2.5 rounded-md gap-2",
    lg: "text-base px-6 py-3 rounded-lg gap-2.5",
  };

  const variantStyles = {
    primary:
      "bg-[#8C432A] text-white hover:bg-[#783721] active:bg-[#682F1B] focus:ring-[#8C432A] shadow-sm",
    secondary:
      "bg-[#2B2A28] text-white hover:bg-[#1C1B1A] active:bg-black focus:ring-[#2B2A28] shadow-sm",
    outline:
      "border border-[#DED7CE] text-[#4A3E38] bg-white hover:bg-[#F9F7F4] active:bg-[#F3EFE9] focus:ring-[#8C432A]",
    ghost:
      "text-[#5A4E46] hover:bg-[#EFEAE3] active:bg-[#E7E0D7] focus:ring-[#8C432A]",
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
