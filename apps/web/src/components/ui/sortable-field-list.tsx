"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export type SortableField = {
  id: string;
  label: string;
};

type SortableFieldListProps = {
  defaultFields?: SortableField[];
  name: string;
  onFieldsChange?: (fields: SortableField[]) => void;
};

export function SortableFieldList({
  defaultFields,
  name,
  onFieldsChange,
}: SortableFieldListProps) {
  const [fields, setFields] = useState<SortableField[]>(
    defaultFields?.length
      ? defaultFields
      : [
          { id: crypto.randomUUID(), label: "Queixa principal" },
          { id: crypto.randomUUID(), label: "Exame físico" },
          { id: crypto.randomUUID(), label: "Conduta" },
        ],
  );
  const [parent] = useAutoAnimate();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = useMemo(() => fields.map((field) => field.id), [fields]);

  useEffect(() => {
    onFieldsChange?.(fields);
  }, [fields, onFieldsChange]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((current) => {
      const oldIndex = current.findIndex((field) => field.id === active.id);
      const newIndex = current.findIndex((field) => field.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  return (
    <div className="grid gap-3">
      <input
        name={name}
        type="hidden"
        value={fields
          .map((field) => field.label.trim())
          .filter(Boolean)
          .join("\n")}
      />
      <DndContext
        collisionDetection={closestCenter}
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div ref={parent} className="grid gap-2">
            {fields.map((field) => (
              <SortableFieldRow
                key={field.id}
                field={field}
                onRemove={() =>
                  setFields((current) =>
                    current.filter((item) => item.id !== field.id),
                  )
                }
                onRename={(label) =>
                  setFields((current) =>
                    current.map((item) =>
                      item.id === field.id ? { ...item, label } : item,
                    ),
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        onClick={() =>
          setFields((current) => [
            ...current,
            { id: crypto.randomUUID(), label: "Novo campo" },
          ])
        }
      >
        <Plus className="size-4" />
        Adicionar campo
      </Button>
    </div>
  );
}

function SortableFieldRow({
  field,
  onRemove,
  onRename,
}: {
  field: SortableField;
  onRemove: () => void;
  onRename: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 rounded-md border border-border bg-card p-2"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Reordenar campo"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </Button>
      <Input
        value={field.label}
        onChange={(event) => onRename(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remover campo"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
