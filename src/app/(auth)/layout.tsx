import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#FAF7F2] flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
