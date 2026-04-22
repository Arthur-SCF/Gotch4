import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconPlus,
  IconTrash,
  IconCopy,
  IconExternalLink,
  IconSearch,
  IconLayoutGrid,
  IconLayoutList,
  IconSortAscending,
  IconSortDescending,
  IconCheck,
  IconNote,
  IconEye,
  IconEyeOff,
  IconFileZip,
  IconTemplate,
  IconUpload,
  IconChevronDown,
  IconChevronUp,
  IconRadar,
} from "@tabler/icons-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { getFileTypeInfo, getFileCategory } from "@/lib/utils/fileTypes";
import { FileUploadZone } from "@/components/FileUploadZone";
import { FilePreviewDrawer } from "@/components/FilePreviewDrawer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/files")({
  component: FilesPage,
});

interface ApiFile {
  id: number;
  filename: string;
  urlPath: string;
  mimetype: string;
  size: number;
  path: string;
  notes: string | null;
  isPublic: boolean;
  detectHit: boolean;
  programId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Program {
  id: number;
  name: string;
  status: string;
}

type SortField = "filename" | "size" | "createdAt" | "type";
type SortOrder = "asc" | "desc";
type ViewMode = "table" | "grid";

interface Template {
  id: string;
  name: string;
  filename: string;
  description: string;
  category: string;
  content: string;
}

interface TemplateCategory {
  name: string;
  description: string;
  templates: Template[];
}

function FilesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUploadMode, setIsUploadMode] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ApiFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [programFilter, setProgramFilter] = useState<string>("All");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Manual creation
  const [newFilename, setNewFilename] = useState("");
  const [newUrlPath, setNewUrlPath] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newMimetype, setNewMimetype] = useState("");

  // Upload
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const queryClient = useQueryClient();

  // Fetch files
  const { data: filesResponse, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/files`);
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const files = (filesResponse?.data || []) as ApiFile[];

  // Fetch programs
  const { data: programsResponse } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });

  const programs = (programsResponse?.data || []) as Program[];

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/templates`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    staleTime: Infinity, // Templates don't change often, cache forever
  });

  const templateCategories: TemplateCategory[] = templatesData?.categories || [];
  const allTemplates = templateCategories.flatMap((cat) => cat.templates);

  // Create file mutation
  const createMutation = useMutation({
    mutationFn: async (data: { filename: string; content: string; urlPath?: string; mimetype?: string }) => {
      const res = await apiFetch(`${API_URL}/api/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create file");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setIsCreateOpen(false);
      resetForm();
      toast.success("File created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Upload files mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const promises = files.map(async (file) => {
        const content = await file.text();
        const res = await apiFetch(`${API_URL}/api/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            content,
            urlPath: `/files/${file.name}`,
          }),
        });
        if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
        return res.json();
      });
      return Promise.all(promises);
    },
    onSuccess: (_, files) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setIsCreateOpen(false);
      resetForm();
      toast.success(`${files.length} file(s) uploaded successfully`);
    },
    onError: () => {
      toast.error("Failed to upload files");
    },
  });

  // Update file mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; content?: string; urlPath?: string; mimetype?: string }) => {
      const res = await apiFetch(`${API_URL}/api/files/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data.content, urlPath: data.urlPath, mimetype: data.mimetype }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update file");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("File updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/files/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete file");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("File deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete file");
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${API_URL}/api/files/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to bulk delete files");
      return res.json();
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setSelectedFiles([]);
      toast.success(`${ids.length} file(s) deleted successfully`);
    },
    onError: () => {
      toast.error("Failed to delete files");
    },
  });

  // Link file to program mutation
  const linkProgramMutation = useMutation({
    mutationFn: async ({ fileId, programId }: { fileId: number; programId: number | null }) => {
      const res = await apiFetch(`${API_URL}/api/files/${fileId}/program`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) throw new Error("Failed to link file to program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast.success("File linked to program successfully");
    },
    onError: () => {
      toast.error("Failed to link file to program");
    },
  });

  // Update file notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async ({ fileId, notes }: { fileId: number; notes: string }) => {
      const res = await apiFetch(`${API_URL}/api/files/${fileId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to update file notes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.success("Notes updated successfully");
    },
    onError: () => {
      toast.error("Failed to update notes");
    },
  });

  // Update file visibility mutation
  const updateVisibilityMutation = useMutation({
    mutationFn: async ({ fileId, isPublic }: { fileId: number; isPublic: boolean }) => {
      const res = await apiFetch(`${API_URL}/api/files/${fileId}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic }),
      });
      if (!res.ok) throw new Error("Failed to update file visibility");
      return res.json();
    },
    onSuccess: (_, { isPublic }) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.info(`File is now ${isPublic ? "public" : "private"}`, {
        description: "Note: Authentication is not yet implemented",
      });
    },
    onError: () => {
      toast.error("Failed to update file visibility");
    },
  });

  // Toggle file detection mutation
  const updateDetectMutation = useMutation({
    mutationFn: async ({ fileId, detectHit }: { fileId: number; detectHit: boolean }) => {
      const res = await apiFetch(`${API_URL}/api/files/${fileId}/detect`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectHit }),
      });
      if (!res.ok) throw new Error("Failed to update file detection");
      return res.json();
    },
    onSuccess: (_, { detectHit }) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast.info(detectHit ? "Detection enabled — HTTP hits will be logged" : "Detection disabled");
    },
    onError: () => {
      toast.error("Failed to update file detection");
    },
  });

  const resetForm = () => {
    setNewFilename("");
    setNewUrlPath("");
    setNewContent("");
    setNewMimetype("");
    setUploadFiles([]);
    setIsUploadMode(true);
    setSelectedTemplateId("");
    setShowAdvanced(false);
  };

  const openFilePreview = (file: ApiFile) => {
    setSelectedFile(file);
    setIsPreviewOpen(true);
  };

  const handleFileUpdate = (data: { content?: string; urlPath?: string; mimetype?: string }) => {
    if (selectedFile) {
      updateMutation.mutate({ id: selectedFile.id, ...data });
    }
  };

  const handleLinkProgram = (programId: number | null) => {
    if (selectedFile) {
      linkProgramMutation.mutate({ fileId: selectedFile.id, programId });
    }
  };

  const handleUpdateNotes = (notes: string) => {
    if (selectedFile) {
      updateNotesMutation.mutate({ fileId: selectedFile.id, notes });
    }
  };

  const handleUpdateVisibility = (isPublic: boolean) => {
    if (selectedFile) {
      updateVisibilityMutation.mutate({ fileId: selectedFile.id, isPublic });
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("No files selected");
      return;
    }

    try {
      const filesToDownload = files.filter((f) => selectedFiles.includes(f.id));

      // Download each file individually (client-side)
      for (const file of filesToDownload) {
        const res = await apiFetch(`${API_URL}/api/files/${file.id}/content`);
        const data = await res.json();

        const blob = new Blob([data.content], { type: file.mimetype });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Small delay between downloads to avoid browser blocking
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      toast.success(`Downloaded ${filesToDownload.length} file(s)`);
      setSelectedFiles([]);
    } catch (error) {
      toast.error("Failed to download files");
    }
  };

  const toggleFileSelection = (id: number) => {
    setSelectedFiles((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAllFiles = () => {
    if (selectedFiles.length === filteredAndSortedFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredAndSortedFiles.map((f) => f.id));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    // Filter by search
    if (searchQuery) {
      result = result.filter((f) =>
        f.filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (categoryFilter !== "All") {
      result = result.filter((f) => getFileCategory(f.filename) === categoryFilter);
    }

    // Filter by program
    if (programFilter !== "All") {
      if (programFilter === "Unlinked") {
        result = result.filter((f) => !f.programId);
      } else {
        result = result.filter((f) => f.programId === parseInt(programFilter));
      }
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "filename":
          comparison = a.filename.localeCompare(b.filename);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "type":
          comparison = getFileTypeInfo(a.filename).badge.localeCompare(
            getFileTypeInfo(b.filename).badge
          );
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [files, searchQuery, categoryFilter, sortField, sortOrder]);

  const categories = useMemo(() => {
    const cats = new Set(files.map((f) => getFileCategory(f.filename)));
    return ["All", ...Array.from(cats)];
  }, [files]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Copy URL to clipboard
  const copyFileUrl = async (file: ApiFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = `${API_URL}${file.urlPath}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(file.urlPath);
    toast.success("URL copied to clipboard");
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Quick visibility toggle
  const quickToggleVisibility = (file: ApiFile, e: React.MouseEvent) => {
    e.stopPropagation();
    updateVisibilityMutation.mutate({ fileId: file.id, isPublic: !file.isPublic });
  };

  // Quick detection toggle
  const quickToggleDetect = (file: ApiFile, e: React.MouseEvent) => {
    e.stopPropagation();
    updateDetectMutation.mutate({ fileId: file.id, detectHit: !file.detectHit });
  };

  // Load template
  const loadTemplate = (template: Template) => {
    setNewFilename(template.filename);
    setNewContent(template.content);
    setIsUploadMode(false);
  };

  // Calculate total size of selected files
  const selectedFilesSize = useMemo(() => {
    const selected = files.filter((f) => selectedFiles.includes(f.id));
    return selected.reduce((total, f) => total + f.size, 0);
  }, [files, selectedFiles]);

  // Drag and drop handlers with counter to prevent flickering
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter((prev) => prev + 1);

    // Check if dragging files (not other elements)
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter((prev) => {
      const newCount = prev - 1;
      // Only hide overlay when completely leaving the drop zone
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure we maintain the drag state
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Reset drag state
    setIsDragging(false);
    setDragCounter(0);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      uploadMutation.mutate(droppedFiles as any);
    }
  };

  return (
    <div
      className="flex flex-1 flex-col gap-4 p-4 sm:p-6 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <IconUpload className="size-16 mx-auto mb-4 text-primary animate-bounce" />
            <p className="text-2xl font-semibold">Drop files to upload</p>
            <p className="text-muted-foreground mt-2">Release to start uploading</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">File Management</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Upload and manage files for bug bounty testing
          </p>
        </div>
        <div className="flex gap-2">
          {selectedFiles.length > 0 && (
            <>
              <div className="hidden sm:flex items-center px-3 py-2 text-sm text-muted-foreground border rounded-md bg-muted/50">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} · {formatFileSize(selectedFilesSize)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDownload}
                className="w-full sm:w-auto"
              >
                <IconFileZip className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="w-full sm:w-auto"
              >
                <IconTrash className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <IconPlus className="mr-2 h-4 w-4" />
                New File
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New File</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Toggle Upload/Manual */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <Button
                    variant={isUploadMode ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setIsUploadMode(true)}
                    className="flex-1"
                  >
                    Upload Files
                  </Button>
                  <Button
                    variant={!isUploadMode ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setIsUploadMode(false)}
                    className="flex-1"
                  >
                    Manual Entry
                  </Button>
                </div>

                {isUploadMode ? (
                  <>
                    <FileUploadZone onFilesSelected={setUploadFiles} />
                    <Button
                      onClick={() => uploadMutation.mutate(uploadFiles)}
                      disabled={uploadFiles.length === 0 || uploadMutation.isPending}
                      className="w-full"
                    >
                      Upload {uploadFiles.length > 0 && `(${uploadFiles.length})`} File(s)
                    </Button>
                  </>
                ) : (
                  <div className="space-y-6">
                    {/* Template Selector - Direct Access */}
                    {allTemplates.length > 0 && (
                      <div className="pb-4 border-b">
                        <Select
                          value={selectedTemplateId}
                          open={templateSelectorOpen}
                          onOpenChange={setTemplateSelectorOpen}
                          onValueChange={(value) => {
                            const template = allTemplates.find(t => t.id === value);
                            if (template) {
                              setSelectedTemplateId(value);
                              loadTemplate(template);
                              setTemplateSelectorOpen(false);
                            }
                          }}
                        >
                          <SelectTrigger
                            className="w-full border-dashed hover:bg-muted/50 transition-colors"
                            onClick={() => setTemplateSelectorOpen(true)}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <IconTemplate className="size-4 flex-shrink-0 text-muted-foreground" />
                              {selectedTemplateId ? (
                                <div className="flex-1 text-left">
                                  <span className="font-medium text-foreground">
                                    {allTemplates.find(t => t.id === selectedTemplateId)?.name}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-muted-foreground flex-1">
                                  <span>Use a template</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {allTemplates.length}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </SelectTrigger>
                          <SelectContent className="max-h-[400px]">
                            {templateCategories.map((category) => (
                              <div key={category.name}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {category.name}
                                </div>
                                {category.templates.map((template) => (
                                  <SelectItem key={template.id} value={template.id}>
                                    <div className="flex flex-col gap-0.5 py-1">
                                      <div className="font-medium">{template.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {template.description}
                                      </div>
                                    </div>
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Main Form */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="filename">Filename *</Label>
                        <Input
                          id="filename"
                          placeholder="example.html"
                          value={newFilename}
                          onChange={(e) => setNewFilename(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>

                      <div>
                        <Label htmlFor="content">Content *</Label>
                        <Textarea
                          id="content"
                          placeholder="Enter file content..."
                          value={newContent}
                          onChange={(e) => setNewContent(e.target.value)}
                          className="mt-1.5 min-h-[300px] font-mono text-sm"
                        />
                      </div>

                      {/* Advanced Options - Collapsible */}
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showAdvanced ? (
                          <IconChevronUp className="size-4" />
                        ) : (
                          <IconChevronDown className="size-4" />
                        )}
                        Advanced options
                      </button>

                      {showAdvanced && (
                        <div className="space-y-3 pt-2">
                          <div>
                            <Label htmlFor="urlPath" className="text-sm">
                              Custom URL Path
                            </Label>
                            <Input
                              id="urlPath"
                              placeholder="/files/example.html"
                              value={newUrlPath}
                              onChange={(e) => setNewUrlPath(e.target.value)}
                              className="mt-1.5"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">
                              Default: /files/{newFilename || "{filename}"}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="newMimetype" className="text-sm">
                              Content-Type Override
                            </Label>
                            <Input
                              id="newMimetype"
                              placeholder="Auto-detected from filename"
                              value={newMimetype}
                              onChange={(e) => setNewMimetype(e.target.value)}
                              className="mt-1.5 font-mono"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">
                              Override the Content-Type header served to clients
                            </p>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={() =>
                          createMutation.mutate({
                            filename: newFilename,
                            content: newContent,
                            urlPath: newUrlPath || undefined,
                            mimetype: newMimetype || undefined,
                          })
                        }
                        disabled={!newFilename || !newContent || createMutation.isPending}
                        className="w-full"
                      >
                        Create File
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Program" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Programs</SelectItem>
            <SelectItem value="Unlinked">Unlinked</SelectItem>
            {programs.map((prog) => (
              <SelectItem key={prog.id} value={prog.id.toString()}>
                {prog.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === "table" ? "grid" : "table")}
          >
            {viewMode === "table" ? (
              <IconLayoutGrid className="size-4" />
            ) : (
              <IconLayoutList className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedFiles.length === filteredAndSortedFiles.length &&
                      filteredAndSortedFiles.length > 0
                    }
                    onCheckedChange={toggleAllFiles}
                  />
                </TableHead>
                <TableHead className="min-w-[200px]">
                  <button
                    onClick={() => handleSort("filename")}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Filename
                    {sortField === "filename" &&
                      (sortOrder === "asc" ? (
                        <IconSortAscending className="size-4" />
                      ) : (
                        <IconSortDescending className="size-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    onClick={() => handleSort("type")}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Type
                    {sortField === "type" &&
                      (sortOrder === "asc" ? (
                        <IconSortAscending className="size-4" />
                      ) : (
                        <IconSortDescending className="size-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Program</TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    onClick={() => handleSort("size")}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Size
                    {sortField === "size" &&
                      (sortOrder === "asc" ? (
                        <IconSortAscending className="size-4" />
                      ) : (
                        <IconSortDescending className="size-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    onClick={() => handleSort("createdAt")}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Created
                    {sortField === "createdAt" &&
                      (sortOrder === "asc" ? (
                        <IconSortAscending className="size-4" />
                      ) : (
                        <IconSortDescending className="size-4" />
                      ))}
                  </button>
                </TableHead>
                <TableHead className="min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchQuery || categoryFilter !== "All"
                        ? "No files match your filters"
                        : "No files yet. Create your first file!"}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedFiles.map((file) => {
                  const fileTypeInfo = getFileTypeInfo(file.filename, file.mimetype);
                  const Icon = fileTypeInfo.icon;
                  return (
                    <TableRow
                      key={file.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openFilePreview(file)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedFiles.includes(file.id)}
                          onCheckedChange={() => toggleFileSelection(file.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`size-5 ${fileTypeInfo.color} flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm truncate">{file.filename}</span>
                              {file.notes && (
                                <IconNote className="size-3.5 text-muted-foreground flex-shrink-0" title="Has notes" />
                              )}
                              {!file.isPublic && (
                                <IconEyeOff className="size-3.5 text-muted-foreground flex-shrink-0" title="Private file" />
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <code className="truncate">{file.urlPath}</code>
                              <button
                                onClick={(e) => copyFileUrl(file, e)}
                                className="hover:text-foreground transition-colors p-0.5"
                                title="Copy full URL"
                              >
                                {copiedUrl === file.urlPath ? (
                                  <IconCheck className="size-3 text-green-500" />
                                ) : (
                                  <IconCopy className="size-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">{fileTypeInfo.badge}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {file.programId ? (
                          <Badge variant="outline">
                            {programs.find((p) => p.id === file.programId)?.name ||
                              `Program #${file.programId}`}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unlinked</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {formatFileSize(file.size)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => quickToggleDetect(file, e)}
                            title={file.detectHit ? "Detection ON — disable" : "Detection OFF — enable"}
                          >
                            <IconRadar className={cn("size-4", file.detectHit && "text-green-500")} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => quickToggleVisibility(file, e)}
                            title={file.isPublic ? "Make private" : "Make public"}
                          >
                            {file.isPublic ? (
                              <IconEye className="size-4" />
                            ) : (
                              <IconEyeOff className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(window.location.origin + file.urlPath, '_blank');
                            }}
                            title="Open in new tab"
                          >
                            <IconExternalLink className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteFileId(file.id)}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedFiles.map((file) => {
            const fileTypeInfo = getFileTypeInfo(file.filename, file.mimetype);
            const Icon = fileTypeInfo.icon;
            return (
              <Card
                key={file.id}
                className={cn(
                  "p-4 cursor-pointer hover:shadow-md transition-shadow relative",
                  selectedFiles.includes(file.id) && "ring-2 ring-primary"
                )}
                onClick={() => openFilePreview(file)}
              >
                {/* Quick Actions - Top Right */}
                <div className="absolute top-2 right-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={(e) => quickToggleDetect(file, e)}
                    title={file.detectHit ? "Detection ON — disable" : "Detection OFF — enable"}
                  >
                    <IconRadar className={cn("size-3.5", file.detectHit ? "text-green-500" : "text-muted-foreground")} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={(e) => quickToggleVisibility(file, e)}
                    title={file.isPublic ? "Make private" : "Make public"}
                  >
                    {file.isPublic ? (
                      <IconEye className="size-3.5 text-muted-foreground" />
                    ) : (
                      <IconEyeOff className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(window.location.origin + file.urlPath, '_blank');
                    }}
                    title="Open in new tab"
                  >
                    <IconExternalLink className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedFiles.includes(file.id)}
                    onCheckedChange={() => toggleFileSelection(file.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`size-8 ${fileTypeInfo.color} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm truncate">{file.filename}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <code className="text-xs text-muted-foreground truncate">{file.urlPath}</code>
                          <button
                            onClick={(e) => copyFileUrl(file, e)}
                            className="hover:text-foreground transition-colors p-0.5"
                            title="Copy full URL"
                          >
                            {copiedUrl === file.urlPath ? (
                              <IconCheck className="size-3 text-green-500" />
                            ) : (
                              <IconCopy className="size-3 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {fileTypeInfo.badge}
                      </Badge>
                      {file.notes && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          <IconNote className="size-3 mr-0.5" />
                          Notes
                        </Badge>
                      )}
                      {!file.isPublic && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          <IconEyeOff className="size-3 mr-0.5" />
                          Private
                        </Badge>
                      )}
                      {file.detectHit && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-green-600 border-green-500">
                          <IconRadar className="size-3 mr-0.5" />
                          Detecting
                        </Badge>
                      )}
                      {file.programId && (
                        <Badge variant="outline" className="text-xs">
                          {programs.find((p) => p.id === file.programId)?.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* File Preview Drawer */}
      <FilePreviewDrawer
        file={selectedFile}
        open={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedFile(null);
        }}
        onUpdate={handleFileUpdate}
        onLinkProgram={handleLinkProgram}
        onUpdateNotes={handleUpdateNotes}
        onUpdateVisibility={handleUpdateVisibility}
        programs={programs}
      />

      {/* Single File Delete Confirmation */}
      <AlertDialog open={deleteFileId !== null} onOpenChange={(open) => { if (!open) setDeleteFileId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the file from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteFileId !== null) { deleteMutation.mutate(deleteFileId); setDeleteFileId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk File Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedFiles.length} selected file{selectedFiles.length !== 1 ? "s" : ""} from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { bulkDeleteMutation.mutate(selectedFiles); setShowBulkDeleteConfirm(false); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
