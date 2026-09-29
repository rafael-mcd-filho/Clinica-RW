"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CircleNotch,
  Trash as Trash2,
  UploadSimple as Upload,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePatientPhoto, type PatientActionState } from "../actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const initialState: PatientActionState = {};
// Mesmo teto e formatos que o servidor aceita (lib/storage/patient-photos).
const maxPhotoBytes = 2 * 1024 * 1024;
const acceptedPhotoTypes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

const cameraButtonClassName =
  "absolute bottom-0.5 right-0.5 flex size-8 items-center justify-center rounded-full border-2 border-card bg-card text-primary shadow-[var(--shadow-soft)] transition-[background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-primary-muted active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Foto do paciente: só o avatar e a câmera, como na ficha.
 *
 * Escolher o arquivo já envia — não há mais "Salvar foto" embaixo do nome.
 * Com foto, a câmera abre um menu (trocar ou remover); sem foto, abre direto
 * a escolha do arquivo. Clicar na foto amplia.
 */
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
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const removeRef = useRef<HTMLInputElement>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updatePatientPhoto.bind(null, patientId),
    initialState,
  );
  // A foto nova volta do servidor com outro caminho: é o sinal para largar a
  // prévia local. Compara só o caminho — a assinatura da URL renova sozinha.
  const photoPath = photoUrl?.split("?")[0] ?? null;
  const [syncedPhotoPath, setSyncedPhotoPath] = useState(photoPath);
  if (photoPath !== syncedPhotoPath) {
    setSyncedPhotoPath(photoPath);
    setSelectedPreview(null);
  }
  // Envio recusado: a prévia volta para a foto atual.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.error) setSelectedPreview(null);
  }
  const preview = selectedPreview ?? photoUrl;

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
    if (inputRef.current) inputRef.current.value = "";
    if (removeRef.current) removeRef.current.value = "false";
  }, [router, state]);

  // A prévia é um blob em memória: solta ao trocar de arquivo ou sair.
  useEffect(() => {
    if (!selectedPreview) return;
    return () => URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Barra aqui o que o servidor recusaria, antes de enviar.
    if (!acceptedPhotoTypes.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WEBP.");
      event.target.value = "";
      return;
    }
    if (file.size > maxPhotoBytes) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      event.target.value = "";
      return;
    }
    setSelectedPreview(URL.createObjectURL(file));
    if (removeRef.current) removeRef.current.value = "false";
    formRef.current?.requestSubmit();
  }

  function removePhoto() {
    if (removeRef.current) removeRef.current.value = "true";
    setSelectedPreview(null);
    formRef.current?.requestSubmit();
  }

  const avatarBox = (
    <span className="relative flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-primary-muted text-display font-semibold text-primary shadow-[var(--shadow-soft)]">
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
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/35">
          <CircleNotch
            className="size-6 animate-spin text-white"
            aria-hidden="true"
          />
          <span className="sr-only">Salvando foto…</span>
        </span>
      ) : null}
    </span>
  );

  return (
    <form ref={formRef} action={formAction} className="relative">
      {preview ? (
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Ampliar foto do paciente"
          title="Ampliar foto"
          className="block cursor-zoom-in rounded-full transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {avatarBox}
        </button>
      ) : (
        avatarBox
      )}

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
            ref={removeRef}
            type="hidden"
            name="remove_photo"
            defaultValue="false"
          />
          {preview ? (
            <DropdownMenu
              trigger={<Camera className="size-4" aria-hidden="true" />}
              triggerLabel="Foto do paciente"
              triggerClassName={cn(cameraButtonClassName, "size-8 p-0")}
              align="start"
            >
              {(close) => (
                <>
                  <DropdownMenuItem
                    icon={Upload}
                    onSelect={() => {
                      close();
                      inputRef.current?.click();
                    }}
                  >
                    Trocar foto
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={Trash2}
                    variant="destructive"
                    onSelect={() => {
                      close();
                      setConfirmingRemoval(true);
                    }}
                  >
                    Remover foto
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenu>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className={cameraButtonClassName}
              aria-label="Enviar foto do paciente"
              title="Enviar foto (PNG, JPG ou WEBP até 2 MB)"
            >
              <Camera className="size-4" aria-hidden="true" />
            </button>
          )}
          <ConfirmDialog
            open={confirmingRemoval}
            onClose={() => setConfirmingRemoval(false)}
            title="Remover foto do paciente?"
            description="A foto será apagada da ficha. Você pode enviar outra quando quiser."
            confirmLabel="Remover foto"
            destructive
            onConfirm={removePhoto}
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
