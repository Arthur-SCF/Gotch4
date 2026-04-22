import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MDEditor from "@uiw/react-md-editor";
import { toast } from "sonner";
import { useTheme } from "@/components/ThemeProvider";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

interface PayloadFormProps {
  open: boolean;
  onClose: () => void;
  categories: any[];
  payload?: any;
}

export default function PayloadForm({
  open,
  onClose,
  categories,
  payload,
}: PayloadFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!payload;
  const { mode } = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    content: "",
    description: "",
    categoryId: "",
    tags: "",
    programId: "none",
  });

  // Reset form when payload changes
  useEffect(() => {
    if (payload) {
      let tags = "";
      try {
        if (payload.tags) {
          const parsed = JSON.parse(payload.tags);
          tags = parsed.join(", ");
        }
      } catch {}

      setFormData({
        name: payload.name || "",
        content: payload.content || "",
        description: payload.description || "",
        categoryId: payload.categoryId?.toString() || "",
        tags,
        programId: payload.programId?.toString() || "none",
      });
    } else {
      setFormData({
        name: "",
        content: "",
        description: "",
        categoryId: "",
        tags: "",
        programId: "none",
      });
    }
  }, [payload, open]);

  // Fetch programs for linking
  const { data: programsResponse } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });

  const programs = programsResponse?.data || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch(`${API_URL}/api/payloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create payload");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      toast.success("Payload created successfully");
      onClose();
    },
    onError: () => {
      toast.error("Failed to create payload");
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch(`${API_URL}/api/payloads/${payload.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update payload");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      toast.success("Payload updated successfully");
      onClose();
    },
    onError: () => {
      toast.error("Failed to update payload");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.content || !formData.categoryId) {
      toast.error("Name, content, and category are required");
      return;
    }

    // Parse tags
    let tagsJson = null;
    if (formData.tags) {
      const tagsArray = formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);
      tagsJson = JSON.stringify(tagsArray);
    }

    const data = {
      name: formData.name,
      content: formData.content,
      description: formData.description || null,
      categoryId: parseInt(formData.categoryId),
      tags: tagsJson,
      programId: formData.programId && formData.programId !== "none" ? parseInt(formData.programId) : null,
    };

    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Payload" : "Create New Payload"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Basic XSS Alert"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.categoryId}
              onValueChange={(value) =>
                setFormData({ ...formData, categoryId: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    <div className="flex items-center gap-2">
                      {cat.color && (
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      {cat.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Payload content (supports {{WEBHOOK_URL}} and {{WEBHOOK_DOMAIN}} variables)"
              className="font-mono min-h-[120px]"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use <code className="bg-muted px-1 rounded">{"{{WEBHOOK_URL}}"}</code> and{" "}
              <code className="bg-muted px-1 rounded">{"{{WEBHOOK_DOMAIN}}"}</code> for
              dynamic replacement
            </p>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <div data-color-mode={mode}>
              <MDEditor
                value={formData.description}
                onChange={(val) =>
                  setFormData({ ...formData, description: val || "" })
                }
                height={200}
                preview="edit"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated tags
            </p>
          </div>

          <div>
            <Label htmlFor="program">Link to Program (Optional)</Label>
            <Select
              value={formData.programId}
              onValueChange={(value) =>
                setFormData({ ...formData, programId: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="No program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No program</SelectItem>
                {programs.map((prog: any) => (
                  <SelectItem key={prog.id} value={prog.id.toString()}>
                    {prog.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
