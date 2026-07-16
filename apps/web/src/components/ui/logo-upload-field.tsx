"use client";

import { useRef, useState } from "react";
import {
  ImageBroken as ImageOff,
  UploadSimple as Upload,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type LogoUploadFieldProps = {
  /** File input name read by the server action. */
  name?: string;
  currentUrl?: string | null;
  /** Hidden field carrying the existing URL so the server keeps it untouched. */
  currentFieldName?: string;
  /** Hidden field flag telling the server to clear the stored logo. */
  removeFieldName?: string;
};

/**
 * Logo picker with live preview, "change" and "remove" controls. Submits the
 * selected file under `name` plus hidden fields so the server action knows
 * whether to keep, replace or clear the existing logo.
 */
export function LogoUploadField({
  name = "logo",
  currentUrl = null,
  currentFieldName = "current_logo_url",
  removeFieldName = "remove_logo",
}: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [removed, setRemoved] = useState(false);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPreview(URL.createObjectURL(file));
    setRemoved(false);
  }

  function handleRemove() {
    setPreview(null);
    setRemoved(true);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Pré-visualização da logo"
            className="size-full object-contain"
          />
        ) : (
          <ImageOff
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="grid gap-2">
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleChange}
          className="hidden"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            {preview ? "Trocar logo" : "Enviar logo"}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
            >
              <X className="size-4" aria-hidden="true" />
              Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP ou SVG até 2 MB.
        </p>
      </div>

      <input type="hidden" name={currentFieldName} value={currentUrl ?? ""} />
      <input
        type="hidden"
        name={removeFieldName}
        value={removed ? "true" : "false"}
      />
    </div>
  );
}
