"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { updatePatientPhoto, type PatientActionState } from "../actions";
import { Button } from "@/components/ui/button";

const initialState: PatientActionState = {};

export function PatientPhotoForm({
  patientId,
  photoUrl,
  initials,
  canEdit,
}: {
  patientId: string;
  photoUrl: string | null;
  initials: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [state, formAction, pending] = useActionState(
    updatePatientPhoto.bind(null, patientId),
    initialState,
  );
  const preview = removePhoto ? null : (selectedPreview ?? photoUrl);
  const hasChange = Boolean(selectedPreview) || removePhoto;

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [router, state]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  function handleRemove() {
    if (inputRef.current) inputRef.current.value = "";
    setSelectedPreview(null);
    setRemovePhoto(Boolean(photoUrl));
  }

  return (
    <form
      action={formAction}
      className="grid min-w-0 justify-items-center gap-3"
    >
      <div className="relative">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-muted text-heading-lg font-semibold text-primary sm:size-20 lg:size-24">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Foto do paciente"
              className="size-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-0 right-0 rounded-full text-primary"
            aria-label="Trocar foto do paciente"
          >
            <Camera className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <>
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleChange}
            className="hidden"
          />
          <input
            type="hidden"
            name="remove_photo"
            value={removePhoto ? "true" : "false"}
          />
          <div className="flex flex-wrap justify-center gap-2">
            {!preview ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden="true" />
                Enviar foto
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Remover
              </Button>
            )}
          </div>
          {hasChange ? (
            <Button type="submit" size="sm" disabled={pending}>
              <Save className="size-4" aria-hidden="true" />
              {pending ? "Salvando..." : "Salvar foto"}
            </Button>
          ) : null}
          <p className="max-w-48 text-center text-xs text-muted-foreground">
            PNG, JPG ou WEBP até 2 MB.
          </p>
        </>
      ) : null}
    </form>
  );
}
