"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

interface Category {
  id: number;
  name: string;
  color?: string;
  order: number;
  _count?: { payloads: number };
}

interface CategorySidebarProps {
  categories: Category[];
  selectedCategory: number | null;
  onSelectCategory: (categoryId: number | null) => void;
  onCreateCategory?: () => void;
}

// ---------- Sortable item ----------
function SortableCategoryItem({
  category,
  isSelected,
  onSelect,
  onDelete,
}: {
  category: Category;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center rounded-md text-sm transition-colors",
        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {/* Drag handle — only visible on desktop hover */}
      <button
        {...attributes}
        {...listeners}
        className="hidden lg:flex items-center justify-center pl-1 pr-0.5 py-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
        tabIndex={-1}
      >
        <IconGripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Main button */}
      <button
        onClick={onSelect}
        className="flex-1 text-left px-2 py-2 whitespace-nowrap truncate"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {category.color && (
              <div
                className="size-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: category.color }}
              />
            )}
            <span className="truncate">{category.name}</span>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {category._count?.payloads || 0}
          </Badge>
        </div>
      </button>

      {/* Delete button — only visible on desktop hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="hidden lg:flex items-center justify-center pr-1.5 py-2 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-all shrink-0"
        tabIndex={-1}
      >
        <IconTrash className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------- Main component ----------
export default function CategorySidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  onCreateCategory,
}: CategorySidebarProps) {
  const queryClient = useQueryClient();
  const [ordered, setOrdered] = useState<Category[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  // Sync local order state when categories prop changes
  useEffect(() => {
    setOrdered([...categories].sort((a, b) => a.order - b.order));
  }, [categories]);

  const totalPayloads = categories.reduce(
    (sum, cat) => sum + (cat._count?.payloads || 0),
    0
  );

  const sensors = useSensors(useSensor(PointerSensor));

  // Reorder mutation — sends updated order for all items after a drag
  const reorderMutation = useMutation({
    mutationFn: async (items: Category[]) => {
      await Promise.all(
        items.map((cat, index) =>
          apiFetch(`${API_URL}/api/payload-categories/${cat.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: index }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payload-categories"] });
    },
    onError: () => {
      toast.error("Failed to save category order");
      queryClient.invalidateQueries({ queryKey: ["payload-categories"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/payload-categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete category");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payload-categories"] });
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      if (selectedCategory === pendingDelete?.id) onSelectCategory(null);
      toast.success(`Category "${pendingDelete?.name}" deleted`);
      setPendingDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete category");
      setPendingDelete(null);
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrdered((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      reorderMutation.mutate(next);
      return next;
    });
  };

  return (
    <>
      <Card className="p-3 sm:p-4 lg:h-full overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto">
        <div className="hidden lg:flex items-center justify-between mb-3">
          <h3 className="font-semibold">Categories</h3>
          {onCreateCategory && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreateCategory}>
              <IconPlus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex lg:flex-col gap-2 lg:space-y-0.5 lg:gap-0">
          {/* All */}
          <button
            onClick={() => onSelectCategory(null)}
            className={cn(
              "whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex-shrink-0",
              selectedCategory === null ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span>All</span>
              <Badge variant="secondary">{totalPayloads}</Badge>
            </div>
          </button>

          {/* Sortable list — desktop only gets DnD */}
          <div className="hidden lg:block">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ordered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {ordered.map((category) => (
                  <SortableCategoryItem
                    key={category.id}
                    category={category}
                    isSelected={selectedCategory === category.id}
                    onSelect={() => onSelectCategory(category.id)}
                    onDelete={() => setPendingDelete(category)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Mobile — plain list, no DnD */}
          <div className="lg:hidden flex gap-2">
            {ordered.map((category) => (
              <button
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                className={cn(
                  "whitespace-nowrap text-left px-3 py-2 rounded-md text-sm transition-colors flex-shrink-0",
                  selectedCategory === category.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  {category.color && (
                    <div className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                  )}
                  <span>{category.name}</span>
                  <Badge variant="secondary">{category._count?.payloads || 0}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the category and{" "}
              <strong>all {pendingDelete?._count?.payloads || 0} payload(s)</strong> inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
