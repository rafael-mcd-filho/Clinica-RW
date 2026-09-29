"use client";

import { useEffect, useRef, useState } from "react";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const STAGE = 288; // lado do quadro de recorte, em px (cabe num celular)
const OUTPUT = 512; // lado da foto salva
const MAX_ZOOM = 3;
const KEY_STEP = 12;

type Frame = { x: number; y: number; zoom: number };
type LoadedImage = { url: string; width: number; height: number };

/**
 * Enquadra a foto num quadrado antes de enviar: arrastar move, o controle
 * deslizante aproxima. O navegador reduz para 512×512 (WEBP, ~50 KB), então
 * o envio é rápido mesmo de uma foto de celular de vários MB.
 */
export function AvatarCropDialog({
  file,
  onClose,
  onConfirm,
}: {
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => Promise<boolean>;
}) {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>({ x: 0, y: 0, zoom: 1 });
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      if (probe.naturalWidth < 64 || probe.naturalHeight < 64) {
        setLoadError("A imagem é pequena demais. Use uma de pelo menos 64 px.");
        return;
      }
      const loaded = {
        url,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
      };
      setImage(loaded);
      setFrame(centered(loaded, 1));
    };
    probe.onerror = () => {
      if (!cancelled) {
        setLoadError(
          "Não foi possível abrir esta imagem. Use uma foto JPG, PNG ou WEBP.",
        );
      }
    };
    probe.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setImage(null);
      setLoadError(null);
    };
  }, [file]);

  const scale = image ? baseScale(image) * frame.zoom : 1;

  function update(next: Frame) {
    if (image) setFrame(clamp(image, next));
  }

  function setZoom(zoom: number) {
    if (!image) return;
    // Aproxima mantendo o centro do quadro no mesmo ponto da foto.
    const oldScale = baseScale(image) * frame.zoom;
    const newScale = baseScale(image) * zoom;
    const centerX = (STAGE / 2 - frame.x) / oldScale;
    const centerY = (STAGE / 2 - frame.y) / oldScale;
    update({
      zoom,
      x: STAGE / 2 - centerX * newScale,
      y: STAGE / 2 - centerY * newScale,
    });
  }

  async function confirm() {
    if (!image || !imageRef.current) return;
    setSaving(true);
    try {
      const blob = await renderCrop(imageRef.current, frame, image);
      if (!blob) {
        setLoadError("Não foi possível preparar a foto. Tente outra imagem.");
        return;
      }
      if (await onConfirm(blob)) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(file)}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Ajustar foto de perfil"
      description="Arraste para enquadrar e use o zoom para aproximar."
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!image || saving || Boolean(loadError)}
            onClick={confirm}
          >
            {saving ? "Salvando..." : "Salvar foto"}
          </Button>
        </div>
      }
    >
      <div className="grid justify-items-center gap-4">
        {loadError ? (
          <p role="alert" className="text-body-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        <div
          role="application"
          aria-label="Área de enquadramento. Use as setas para mover a foto."
          tabIndex={0}
          className="relative size-72 touch-none select-none overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          style={{ cursor: image ? "grab" : undefined }}
          onPointerDown={(event) => {
            if (!image) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
            event.currentTarget.style.cursor = "grabbing";
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointerId !== event.pointerId) return;
            update({
              ...frame,
              x: frame.x + (event.clientX - start.x),
              y: frame.y + (event.clientY - start.y),
            });
            drag.current = { ...start, x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.style.cursor = "grab";
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [KEY_STEP, 0],
              ArrowRight: [-KEY_STEP, 0],
              ArrowUp: [0, KEY_STEP],
              ArrowDown: [0, -KEY_STEP],
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            update({ ...frame, x: frame.x + move[0], y: frame.y + move[1] });
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem local (blob) que ainda não existe no servidor
            <img
              ref={imageRef}
              src={image.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              style={{
                width: image.width,
                height: image.height,
                transform: `translate(${frame.x}px, ${frame.y}px) scale(${scale})`,
              }}
            />
          ) : null}
          {/* Guia do círculo: é assim que a foto aparece no sistema. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_color-mix(in_srgb,var(--foreground)_45%,transparent)] ring-2 ring-white/80"
          />
        </div>

        <label className="flex w-72 items-center gap-3 text-muted-foreground">
          <MagnifyingGlassMinus
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="sr-only">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={frame.zoom}
            disabled={!image}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
          <MagnifyingGlassPlus className="size-4 shrink-0" aria-hidden="true" />
        </label>
      </div>
    </Modal>
  );
}

/** Escala em que a foto cobre o quadro inteiro, sem sobra. */
function baseScale(image: LoadedImage) {
  return Math.max(STAGE / image.width, STAGE / image.height);
}

function centered(image: LoadedImage, zoom: number): Frame {
  const scale = baseScale(image) * zoom;
  return {
    zoom,
    x: (STAGE - image.width * scale) / 2,
    y: (STAGE - image.height * scale) / 2,
  };
}

/** A foto nunca deixa buraco no quadro. */
function clamp(image: LoadedImage, frame: Frame): Frame {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, frame.zoom));
  const scale = baseScale(image) * zoom;
  const minX = STAGE - image.width * scale;
  const minY = STAGE - image.height * scale;
  return {
    zoom,
    x: Math.min(0, Math.max(minX, frame.x)),
    y: Math.min(0, Math.max(minY, frame.y)),
  };
}

async function renderCrop(
  element: HTMLImageElement,
  frame: Frame,
  image: LoadedImage,
): Promise<Blob | null> {
  const scale = baseScale(image) * frame.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    element,
    -frame.x / scale,
    -frame.y / scale,
    STAGE / scale,
    STAGE / scale,
    0,
    0,
    OUTPUT,
    OUTPUT,
  );
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
  // Navegadores sem WEBP no canvas devolvem PNG: aí vai JPG, bem menor.
  const webp = await toBlob("image/webp", 0.88);
  if (webp?.type === "image/webp") return webp;
  return toBlob("image/jpeg", 0.9);
}
