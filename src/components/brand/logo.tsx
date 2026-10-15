import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type LogoVariant = "badge" | "mark" | "primary" | "white";

export interface LogoProps {
  /**
   * - "badge": The official logo with white squircle background (from white-bg asset)
   * - "mark": The official logo with transparent background (adapts to light/dark mode)
   * - "primary": The logo mark inside the brand primary background container
   * - "white": Pure white mark for dark backgrounds
   */
  variant?: LogoVariant;
  /** Size preset or explicit pixel size */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  alt?: string;
}

const sizeMap = {
  xs: 18,
  sm: 24,
  md: 36,
  lg: 42,
  xl: 48,
};

export function Logo({
  variant = "badge",
  size = "md",
  className,
  imageClassName,
  priority = false,
  alt = "Potencia Logo",
}: LogoProps) {
  const pixelSize = typeof size === "number" ? size : sizeMap[size] ?? 36;

  if (variant === "mark") {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center shrink-0",
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        <Image
          src="/logo.png"
          alt={alt}
          width={pixelSize}
          height={pixelSize}
          priority={priority}
          className={cn(
            "h-full w-full object-contain dark:invert transition-all",
            imageClassName
          )}
        />
      </div>
    );
  }

  if (variant === "white") {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center shrink-0",
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        <Image
          src="/logo-white.png"
          alt={alt}
          width={pixelSize}
          height={pixelSize}
          priority={priority}
          className={cn("h-full w-full object-contain", imageClassName)}
        />
      </div>
    );
  }

  if (variant === "primary") {
    const markSize = Math.round(pixelSize * 0.65);
    return (
      <div
        className={cn(
          "relative flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/25 shrink-0 overflow-hidden",
          className
        )}
        style={{ width: pixelSize, height: pixelSize }}
      >
        <Image
          src="/logo-white.png"
          alt={alt}
          width={markSize}
          height={markSize}
          priority={priority}
          className={cn("object-contain", imageClassName)}
        />
      </div>
    );
  }

  // Default: "badge" (Logo with white background)
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-lg bg-white shadow-xs border border-border/40 shrink-0 overflow-hidden p-0.5",
        className
      )}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <Image
        src="/logo-white-bg.png"
        alt={alt}
        width={pixelSize}
        height={pixelSize}
        priority={priority}
        className={cn("h-full w-full object-contain rounded-md", imageClassName)}
      />
    </div>
  );
}
