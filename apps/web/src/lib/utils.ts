import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Sem registrar os tokens de --text-* de globals.css, o merge os interpreta
// como cores: "text-control text-foreground" perdia o tamanho do controle.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "caption",
        "label",
        "control",
        "table",
        "body-sm",
        "body",
        "reading",
        "heading-sm",
        "heading",
        "heading-lg",
        "display",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initialsFromName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "P") + (parts[1]?.[0] ?? "")).toUpperCase();
}
