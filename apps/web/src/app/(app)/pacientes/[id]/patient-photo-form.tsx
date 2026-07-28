"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  FloppyDisk as Save,
  Trash as Trash2,
  UploadSimple as Upload,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePatientPhoto, type PatientActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PatientCompletenessRing } from "@/components/patients/patient-completeness-ring";
import type { PatientCompleteness } from "@/lib/patients/completeness";

const initialState: PatientActionState = {};

export function PatientPhotoForm({
  patientId,
  photoUrl,
  initials,
  canEdit,
  completeness,
  deceased,
}: {
  patientId: string;
  photoUrl: string | null;
  initials: string;
  canEdit: boolean;
  completeness: PatientCompleteness | null;
  deceased: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [state, formAction, pending] = useActionState(
    updatePatientPhoto.bind(null, patientId),
    initialState,
  );
  const preview = removePhoto ? null : (selectedPreview ?? photoUrl);
  const hasChange = Boolean(selectedPreview) || removePhoto;
  const avatar = (
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
  );

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
        {completeness || deceased ? (
          <PatientCompletenessRing
            deceased={deceased}
            percentage={completeness?.percentage ?? 0}
            missing={completeness?.missing ?? []}
          >
            {avatar}
          </PatientCompletenessRing>
        ) : (
          avatar
        )}
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
                onClick={() => setConfirmingRemoval(true)}
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
          <ConfirmDialog
            open={confirmingRemoval}
            onClose={() => setConfirmingRemoval(false)}
            title="Remover foto do paciente?"
            description="A foto será marcada para remoção e apagada quando você salvar."
            confirmLabel="Remover foto"
            destructive
            onConfirm={handleRemove}
          />
        </>
      ) : null}
    </form>
  );
}
