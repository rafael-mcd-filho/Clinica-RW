"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  TextB as Bold,
  TextItalic as Italic,
  ListBullets as List,
  ListNumbers as ListOrdered,
  Paragraph as Pilcrow,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  defaultValue?: string | null;
  disabled?: boolean;
  minHeightClassName?: string;
  name: string;
  output?: "html" | "text";
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

export function RichTextEditor({
  defaultValue,
  disabled,
  minHeightClassName = "min-h-32",
  name,
  output = "text",
  onChange,
  placeholder,
  required,
}: RichTextEditorProps) {
  const [serialized, setSerialized] = useState(defaultValue ?? "");
  const [isEmpty, setIsEmpty] = useState(!defaultValue);
  const editor = useEditor({
    content: defaultValue ? plainTextToHtml(defaultValue) : "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          minHeightClassName,
          "prose prose-sm max-w-none rounded-b-md border-x border-b border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15",
        ),
        "aria-placeholder": placeholder ?? "",
        "data-placeholder": placeholder ?? "",
      },
    },
    extensions: [StarterKit],
    immediatelyRender: false,
    onCreate: ({ editor: currentEditor }) => {
      setIsEmpty(currentEditor.isEmpty);
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue =
        output === "html" ? currentEditor.getHTML() : currentEditor.getText();
      setSerialized(nextValue);
      setIsEmpty(currentEditor.isEmpty);
      onChange?.(nextValue);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div>
      <input name={name} required={required} type="hidden" value={serialized} />
      <div className="flex flex-wrap gap-1 rounded-t-md border border-border bg-muted/35 p-1">
        <ToolbarButton
          active={editor?.isActive("bold")}
          disabled={disabled || !editor}
          label="Negrito"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("italic")}
          disabled={disabled || !editor}
          label="Itálico"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("bulletList")}
          disabled={disabled || !editor}
          label="Lista"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("orderedList")}
          disabled={disabled || !editor}
          label="Lista numerada"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive("paragraph")}
          disabled={disabled || !editor}
          label="Parágrafo"
          onClick={() => editor?.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="size-4" />
        </ToolbarButton>
      </div>
      <div className="relative">
        <EditorContent editor={editor} />
        {placeholder && isEmpty ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 px-3 py-2 text-sm text-muted-foreground"
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
      className={active ? "bg-primary-muted text-primary" : undefined}
      disabled={disabled}
      size="icon"
      variant="ghost"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
