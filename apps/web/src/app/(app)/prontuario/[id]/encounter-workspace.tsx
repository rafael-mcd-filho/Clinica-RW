"use client";

import { useRef, useState } from "react";
import {
  ArrowBendUpRight,
  CalendarCheck,
  Certificate,
  ClipboardText,
  FileText,
  Flask,
  Pill,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import {
  documentTypeLabels,
  type ClinicalDocumentType,
} from "@/lib/clinical/document-types";
import type { DocumentVariableValues } from "@/lib/clinical/document-templates";
import type { RenderContext } from "@/lib/pdf/clinical-document";
import {
  DocumentPanel,
  type ClinicalDocument,
  type ClinicalDocumentTemplate,
} from "./document-panel";

// Os documentos que saem na maioria das consultas, a um clique do painel.
const shortcutTypes: Array<{ type: ClinicalDocumentType; icon: Icon }> = [
  { type: "prescription", icon: Pill },
  { type: "exam_request", icon: Flask },
  { type: "medical_certificate", icon: Certificate },
  { type: "attendance_declaration", icon: CalendarCheck },
  { type: "referral", icon: ArrowBendUpRight },
];

/**
 * Área de trabalho do atendimento: a ficha (e os documentos) à esquerda, em
 * largura de leitura, e o painel clínico do paciente fixo à direita —
 * alergias, medicamentos e histórico ficam à vista enquanto se escreve, em
 * vez de num bloco no topo que some ao rolar.
 */
export function EncounterWorkspace({
  ficha,
  aside,
  encounterId,
  templates,
  documents,
  allowedTypes,
  variables,
  renderContext,
  timeZone,
  allergies,
}: {
  ficha: React.ReactNode;
  aside: React.ReactNode;
  encounterId: string;
  templates: ClinicalDocumentTemplate[];
  documents: ClinicalDocument[];
  allowedTypes: ClinicalDocumentType[];
  variables: DocumentVariableValues;
  renderContext: RenderContext;
  timeZone: string;
  allergies: string | null;
}) {
  const [tab, setTab] = useState("ficha");
  const [documentType, setDocumentType] = useState<ClinicalDocumentType>();
  // Trocar a chave recria o formulário de documento já no tipo escolhido.
  const [documentPanelKey, setDocumentPanelKey] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const shortcuts = shortcutTypes.filter((item) =>
    allowedTypes.includes(item.type),
  );

  function openDocument(type: ClinicalDocumentType) {
    setDocumentType(type);
    setDocumentPanelKey((value) => value + 1);
    setTab("documentos");
    tabsRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div
        ref={tabsRef}
        className="min-w-0 scroll-mt-[calc(var(--app-sticky-offset,0rem)+1rem)]"
      >
        <Tabs
          ariaLabel="Áreas do prontuário"
          value={tab}
          onValueChange={setTab}
          keepMounted
          items={[
            {
              id: "ficha",
              label: "Ficha do atendimento",
              icon: <ClipboardText aria-hidden="true" />,
              content: ficha,
            },
            {
              id: "documentos",
              label: `Documentos (${documents.length})`,
              icon: <FileText aria-hidden="true" />,
              content: (
                <DocumentPanel
                  key={documentPanelKey}
                  initialType={documentType}
                  encounterId={encounterId}
                  templates={templates}
                  documents={documents}
                  variables={variables}
                  renderContext={renderContext}
                  timeZone={timeZone}
                  showHeader={false}
                  allowedTypes={allowedTypes}
                  allergies={allergies}
                />
              ),
            },
          ]}
        />
      </div>

      <aside
        aria-label="Contexto clínico do paciente"
        className="grid min-w-0 content-start gap-4 xl:sticky xl:top-[calc(var(--app-sticky-offset,0rem)+1rem)] xl:max-h-[calc(100svh-var(--app-sticky-offset,0rem)-2rem)] xl:overflow-y-auto xl:overscroll-contain"
      >
        {aside}
        {shortcuts.length ? (
          <Card>
            <CardHeader className="px-4 py-3">
              <h2 className="text-label font-semibold">Emitir documento</h2>
            </CardHeader>
            <CardContent className="grid gap-0.5 p-2">
              {shortcuts.map(({ type, icon: ShortcutIcon }) => (
                <Button
                  key={type}
                  type="button"
                  variant="ghost"
                  className="justify-start text-secondary-foreground"
                  onClick={() => openDocument(type)}
                >
                  <ShortcutIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {documentTypeLabels[type]}
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
