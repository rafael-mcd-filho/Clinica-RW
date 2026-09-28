"use client";

import { useRef, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { ConsentSignature } from "@/lib/clinical/consent";

export function ConsentSignatureInput({
  value,
  onChange,
  disabled,
}: {
  value: ConsentSignature;
  onChange: (value: ConsentSignature) => void;
  disabled?: boolean;
}) {
  const drawing = useRef<number | null>(null);
  const strokes = value.method === "drawn" ? value.strokes : [];
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }
  function endDrawing() {
    drawing.current = null;
    if (value.method === "drawn")
      onChange({
        method: "drawn",
        strokes: strokes.filter((stroke) => stroke.length >= 2),
      });
  }
  return (
    <div className="grid gap-3">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Forma de assinatura"
      >
        <Button
          type="button"
          size="sm"
          variant={value.method === "drawn" ? "primary" : "secondary"}
          aria-pressed={value.method === "drawn"}
          disabled={disabled}
          onClick={() => {
            if (value.method !== "drawn")
              onChange({ method: "drawn", strokes: [] });
          }}
        >
          Desenhar assinatura
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.method === "typed" ? "primary" : "secondary"}
          aria-pressed={value.method === "typed"}
          disabled={disabled}
          onClick={() => {
            if (value.method !== "typed")
              onChange({ method: "typed", name: "" });
          }}
        >
          Assinar com nome digitado
        </Button>
      </div>
      {value.method === "typed" ? (
        <label className="grid gap-2 text-label font-medium">
          Digite seu nome completo para assinar
          <Input
            value={value.name}
            maxLength={160}
            disabled={disabled}
            onChange={(event) =>
              onChange({ method: "typed", name: event.target.value })
            }
            autoComplete="off"
          />
        </label>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            Assine com o dedo, caneta ou mouse na área abaixo. Você também pode
            usar o nome digitado.
          </p>
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            role="img"
            aria-label="Área para desenhar a assinatura"
            className="aspect-[25/6] h-auto w-full touch-none rounded-md border border-border bg-white text-slate-950"
            onPointerDown={(event) => {
              if (
                disabled ||
                drawing.current !== null ||
                strokes.length >= 100 ||
                strokes.flat().length >= 2048 ||
                event.button !== 0
              )
                return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = event.pointerId;
              onChange({
                method: "drawn",
                strokes: [...strokes, [point(event)]],
              });
            }}
            onPointerMove={(event) => {
              if (
                disabled ||
                drawing.current !== event.pointerId ||
                !strokes.length ||
                strokes.flat().length >= 2048
              )
                return;
              onChange({
                method: "drawn",
                strokes: [
                  ...strokes.slice(0, -1),
                  [...strokes[strokes.length - 1], point(event)],
                ],
              });
            }}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
          >
            <SignaturePaths signature={value} />
          </svg>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="justify-self-start"
            onClick={() => onChange({ method: "drawn", strokes: [] })}
          >
            Limpar assinatura
          </Button>
        </>
      )}
    </div>
  );
}

export function SignaturePaths({ signature }: { signature: ConsentSignature }) {
  if (signature.method !== "drawn") return null;
  return signature.strokes.map((stroke, index) => (
    <path
      key={index}
      d={stroke
        .map((p, i) => `${i ? "L" : "M"}${p.x * 1000},${p.y * 240}`)
        .join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}
