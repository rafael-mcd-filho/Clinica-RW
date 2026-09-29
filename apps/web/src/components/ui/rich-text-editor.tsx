"use client";

import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  TextB as Bold,
  TextItalic as Italic,
  ListBullets as List,
  ListNumbers as ListOrdered,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { richTextContentClassName } from "@/components/clinical/rich-text-view";
import { Button } from "@/components/ui/button";
import {
  richTextToHtml,
  serializeRichText,
  type RichTextNode,
} from "@/lib/clinical/rich-text-format";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  id?: string;
  ariaLabelledBy?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  minHeightClassName?: string;
  name: string;
  output?: "html" | "text";
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
};

// O valor salvo é texto (é o que o prontuário e os resumos mostram). Antes o
// editor gravava `getText()`: negrito, itálico e listas sumiam ao salvar, e ao
// reabrir o texto voltava cru. Agora a formatação vai em marcações simples
// que o próprio editor lê de volta (lib/clinical/rich-text-format). O que não
// cabe nesse formato (títulos, citações, sublinhado, tachado, links) fica
// desligado, em vez de aparecer só pelo atalho e se perder ao salvar.
const editorExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
  }),
];

export function RichTextEditor({
  id,
  ariaLabelledBy,
  defaultValue,
  disabled,
  minHeightClassName = "min-h-32",
  name,
  output = "text",
  onChange,
  placeholder,
  required,
  invalid = false,
}: RichTextEditorProps) {
  const [serialized, setSerialized] = useState(defaultValue ?? "");
  const [isEmpty, setIsEmpty] = useState(!defaultValue);
  const editor = useEditor({
    content: defaultValue ? richTextToHtml(defaultValue) : "",
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {}),
        "aria-invalid": String(invalid),
        // O projeto não usa o plugin de tipografia (`prose`), e o reset do
        // Tailwind tira marcador e recuo das listas: a lista era criada mas
        // não aparecia. Os estilos ficam aqui, explícitos.
        class: cn(
          minHeightClassName,
          "max-w-none rounded-b-md border-x border-b border-border bg-card px-3 py-2 text-reading font-normal outline-none focus:ring-2 focus:ring-primary/15",
          richTextContentClassName,
        ),
        "aria-placeholder": placeholder ?? "",
        "data-placeholder": placeholder ?? "",
      },
    },
    extensions: editorExtensions,
    immediatelyRender: false,
    onCreate: ({ editor: currentEditor }) => {
      setIsEmpty(currentEditor.isEmpty);
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue =
        output === "html"
          ? currentEditor.getHTML()
          : serializeRichText(currentEditor.getJSON() as RichTextNode);
      setSerialized(nextValue);
      setIsEmpty(currentEditor.isEmpty);
      onChange?.(nextValue);
    },
  });

  // O editor não re-renderiza o componente a cada seleção/transação: sem
  // isso, clicar em Negrito antes de digitar não acendia o botão, e parecia
  // que o clique não tinha pegado.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
    }),
  });

  useEffect(() => {
    if (!editor || editor.isEditable === !disabled) return;
    // `false`: trocar se é editável não é alteração do texto. Sem isso o
    // Tiptap emitia "update" ao abrir a ficha, ela ficava "Pendente" e o
    // salvamento automático disparava sem ninguém ter digitado.
    editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-invalid", String(invalid));
  }, [editor, invalid]);

  return (
    <div>
      <input name={name} required={required} type="hidden" value={serialized} />
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        className="flex flex-wrap gap-1 rounded-t-md border border-border bg-muted/35 p-1"
      >
        <ToolbarButton
          active={active?.bold}
          disabled={disabled || !editor}
          label="Negrito"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={active?.italic}
          disabled={disabled || !editor}
          label="Itálico"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={active?.bulletList}
          disabled={disabled || !editor}
          label="Lista com marcadores"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={active?.orderedList}
          disabled={disabled || !editor}
          label="Lista numerada"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
      </div>
      <div className="relative">
        <EditorContent editor={editor} />
        {placeholder && isEmpty ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 px-3 py-2 text-reading font-normal text-muted-foreground"
          >
            {placeholder}
          </span>
        ) : null}
      </div>
    </div>
  );
}
function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      aria-label={label}
      aria-pressed={Boolean(active)}
      title={label}
      className={active ? "bg-primary-muted text-primary" : undefined}
      disabled={disabled}
      size="icon"
      variant="ghost"
      // Sem isso o clique tira o foco do texto antes do comando rodar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span aria-hidden="true" className="contents">
        {children}
      </span>
    </Button>
  );
}
