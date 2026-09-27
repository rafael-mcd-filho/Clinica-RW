"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  Camera,
  FloppyDisk as Save,
  Trash as Trash2,
  UploadSimple as Upload,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePatientPhoto, type PatientActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import { PatientCompletenessRing } from "@/components/patients/patient-completeness-ring";
import type { PatientCompleteness } from "@/lib/patients/completeness";

const initialState: PatientActionState = {};
// Mesmo teto e formatos que o servidor aceita (lib/storage/patient-photos).
const maxPhotoBytes = 2 * 1024 * 1024;
const acceptedPhotoTypes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

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
  const [zoomOpen, setZoomOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updatePatientPhoto.bind(null, patientId),
    initialState,
  );
  // Salvou: a foto nova volta do servidor com outro caminho (ou null, se foi
  // removida). É o sinal para largar a prévia local — antes ela ficava, e o
  // "Salvar foto" continuava na tela depois de salvo. Compara só o caminho:
  // a assinatura da URL renova sozinha e não é troca de foto.
  const photoPath = photoUrl?.split("?")[0] ?? null;
  const [syncedPhotoPath, setSyncedPhotoPath] = useState(photoPath);
  if (photoPath !== syncedPhotoPath) {
    setSyncedPhotoPath(photoPath);
    setSelectedPreview(null);
    setRemovePhoto(false);
  }
  const preview = removePhoto ? null : (selectedPreview ?? photoUrl);
  const hasChange = Boolean(selectedPreview) || removePhoto;
  const avatarBox = (
    <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-muted text-display font-semibold text-primary lg:size-24">
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
  // Com foto, o avatar vira alvo de clique e abre a imagem em tamanho cheio —
  // no círculo de 64/96px não dá para conferir o rosto. Sem foto são só as
  // iniciais, e aí não há nada para ampliar.
  const avatar = preview ? (
    <button
      type="button"
      onClick={() => setZoomOpen(true)}
      aria-label="Ampliar foto do paciente"
      title="Ampliar foto"
      className="cursor-zoom-in rounded-full transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {avatarBox}
    </button>
  ) : (
    avatarBox
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [router, state]);

  // A prévia é um blob em memória: solta ao trocar de arquivo ou sair.
  useEffect(() => {
    if (!selectedPreview) return;
    return () => URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  function clearFileInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Barra aqui o que o servidor recusaria: antes a prévia aparecia e o
    // erro só vinha depois de clicar em salvar.
    if (!acceptedPhotoTypes.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WEBP.");
      clearFileInput();
      return;
    }
    if (file.size > maxPhotoBytes) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      clearFileInput();
      return;
    }
    setSelectedPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  // Desistir de uma foto escolhida e ainda não salva volta para a foto atual.
  // Antes isso passava pelo "Remover", que também marcava a foto atual para
  // ser apagada.
  function discardSelection() {
    clearFileInput();
    setSelectedPreview(null);
  }

  function handleRemove() {
    clearFileInput();
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
            aria-label={
              preview ? "Trocar foto do paciente" : "Enviar foto do paciente"
            }
            title={
              preview
                ? "Trocar foto (PNG, JPG ou WEBP até 2 MB)"
                : "Enviar foto (PNG, JPG ou WEBP até 2 MB)"
            }
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
            {selectedPreview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={discardSelection}
              >
                <X className="size-4" aria-hidden="true" />
                Descartar
              </Button>
            ) : removePhoto ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemovePhoto(false)}
              >
                <ArrowCounterClockwise className="size-4" aria-hidden="true" />
                Desfazer
              </Button>
            ) : !preview ? (
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
                variant="destructive-ghost"
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
          {/* Só enquanto não há foto: é a orientação para o envio. Com foto,
              a regra fica no título do botão da câmera e não ocupa o
              cartão entre a foto e o nome. */}
          {!preview && !removePhoto ? (
            <p className="max-w-48 text-center text-xs text-muted-foreground">
              PNG, JPG ou WEBP até 2 MB.
            </p>
          ) : null}
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

      <Modal
        open={zoomOpen && Boolean(preview)}
        onClose={() => setZoomOpen(false)}
        title="Foto do paciente"
        className="max-w-2xl"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Foto ampliada do paciente"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        ) : null}
      </Modal>
    </form>
  );
}
