import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
  IconPlus,
  IconTrash,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconLayoutGrid,
  IconLayoutList,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTarget,
  IconClock,
  IconFileText,
  IconBug,
} from "@tabler/icons-react";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventDetailsDialog } from "@/components/EventDetailsDialog";
import { FileContentDialog } from "@/components/FileContentDialog";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { getMethodColor, getStatusColor } from "@/lib/utils/colors";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useTheme } from "@/components/ThemeProvider";

export const Route = createFileRoute("/programs")({
  component: ProgramsPage,
});

interface Program {
  id: number;
  name: string;
  description: string | null;
  scope: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
  _count?: {
    events: number;
    files: number;
  };
}

interface ProgramWithDetails extends Program {
  events: any[];
  files: any[];
}

function ProgramsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedProgramDetails, setSelectedProgramDetails] = useState<ProgramWithDetails | null>(null);
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isFileContentOpen, setIsFileContentOpen] = useState(false);
  const [selectedFileContent, setSelectedFileContent] = useState<{ filename: string; content: string } | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPlatform, setImportPlatform] = useState<string>("");

  const isMobile = useIsMobile();
  const { mode } = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scope: "",
    notes: "",
    status: "active"
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch programs
  const { data: programsResponse, isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/programs`);
      if (!res.ok) throw new Error("Failed to fetch programs");
      return res.json();
    },
  });

  const programs = (programsResponse?.data || []) as Program[];

  // Create program mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiFetch(`${API_URL}/api/programs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create program");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setIsCreateOpen(false);
      resetForm();
      toast.success("Program created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update program mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await apiFetch(`${API_URL}/api/programs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update program");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      queryClient.invalidateQueries({ queryKey: ["program"] });
      setIsEditOpen(false);
      setSelectedProgram(null);
      resetForm();
      toast.success("Program updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete program mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/programs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setIsDeleteDialogOpen(false);
      setProgramToDelete(null);
      toast.success("Program deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete program");
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_URL}/api/programs/${id}/favorite`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error("Failed to toggle favorite");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      queryClient.invalidateQueries({ queryKey: ["program"] });
      toast.success("Favorite updated");
    },
    onError: () => {
      toast.error("Failed to update favorite");
    },
  });

  // Link event to program mutation
  const linkEventToProgramMutation = useMutation({
    mutationFn: async ({ eventId, programId }: { eventId: number; programId: number | null }) => {
      const res = await apiFetch(`${API_URL}/api/events/${eventId}/program`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) throw new Error("Failed to link event to program");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast.success("Event linked to program successfully");
    },
    onError: () => {
      toast.error("Failed to link event to program");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      scope: "",
      notes: "",
      status: "active"
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEditDialog = (program: Program) => {
    setSelectedProgram(program);
    setFormData({
      name: program.name,
      description: program.description || "",
      scope: program.scope || "",
      notes: program.notes || "",
      status: program.status
    });
    setIsEditOpen(true);
  };

  const viewProgramDetails = async (program: Program) => {
    try {
      const res = await apiFetch(`${API_URL}/api/programs/${program.id}`);
      const details = await res.json();
      setSelectedProgramDetails(details);
      setIsDetailOpen(true);
    } catch (error) {
      toast.error("Failed to load program details");
    }
  };

  const viewEventDetails = (event: any) => {
    setSelectedEvent(event);
    setIsEventDetailOpen(true);
  };

  const viewFileContent = async (file: any) => {
    try {
      const res = await apiFetch(`${API_URL}/api/files/${file.id}/content`);
      const data = await res.json();
      setSelectedFileContent({ filename: data.filename, content: data.content });
      setIsFileContentOpen(true);
    } catch (error) {
      toast.error("Failed to load file content");
    }
  };

  const confirmDelete = (program: Program, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setProgramToDelete(program);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (programToDelete) {
      deleteMutation.mutate(programToDelete.id);
    }
  };

  const toggleFavorite = (program: Program, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate(program.id);
  };


  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Bug Bounty Programs</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Organize your bug bounty targets with linked events and files
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="flex border rounded-md p-1">
            <Button
              size="sm"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              onClick={() => setViewMode("table")}
              className="h-8 px-3"
            >
              <IconLayoutList className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              onClick={() => setViewMode("grid")}
              className="h-8 px-3"
            >
              <IconLayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {/* Import Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <IconDownload className="mr-2 h-4 w-4" />
                Import
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Import from Platform</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setImportPlatform("yeswehack"); setIsImportOpen(true); }}>
                YesWeHack
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setImportPlatform("hackerone"); setIsImportOpen(true); }}>
                HackerOne
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setImportPlatform("bugcrowd"); setIsImportOpen(true); }}>
                Bugcrowd
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setImportPlatform("intigriti"); setIsImportOpen(true); }}>
                Intigriti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Create Button */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} className="w-full sm:w-auto">
                <IconPlus className="mr-2 h-4 w-4" />
                New Program
              </Button>
            </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Program</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Program Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Acme Corp Bug Bounty"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="scope">Scope (one per line)</Label>
                <Textarea
                  id="scope"
                  placeholder="*.example.com&#10;https://example.com&#10;https://api.example.com/*"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  className="min-h-[100px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter URLs and wildcards, one per line
                </p>
              </div>
              <div>
                <Label htmlFor="description">Description (Markdown supported)</Label>
                <div data-color-mode={mode}>
                  <MDEditor
                    value={formData.description}
                    onChange={(val) => setFormData({ ...formData, description: val || "" })}
                    height={200}
                    preview="edit"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes (Markdown supported)</Label>
                <div data-color-mode={mode}>
                  <MDEditor
                    value={formData.notes}
                    onChange={(val) => setFormData({ ...formData, notes: val || "" })}
                    height={200}
                    preview="edit"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
              >
                Create Program
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading programs...</div>
        </div>
      ) : programs.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-12 px-4 border rounded-lg bg-muted/20">
          <IconTarget className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No programs yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Start organizing your bug bounty targets by creating a program or importing from your favorite platform
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={openCreateDialog} className="w-full sm:w-auto">
              <IconPlus className="mr-2 h-4 w-4" />
              Create First Program
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <IconDownload className="mr-2 h-4 w-4" />
                  Import from Platform
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Select Platform</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setImportPlatform("yeswehack"); setIsImportOpen(true); }}>
                  YesWeHack
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setImportPlatform("hackerone"); setIsImportOpen(true); }}>
                  HackerOne
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setImportPlatform("bugcrowd"); setIsImportOpen(true); }}>
                  Bugcrowd
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setImportPlatform("intigriti"); setIsImportOpen(true); }}>
                  Intigriti
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* Table View */
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="min-w-[150px]">Name</TableHead>
                <TableHead className="hidden md:table-cell min-w-[200px]">Scope</TableHead>
                <TableHead className="hidden md:table-cell min-w-[100px]">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Events</TableHead>
                <TableHead className="hidden lg:table-cell">Files</TableHead>
                <TableHead className="hidden xl:table-cell">Updated</TableHead>
                <TableHead className="min-w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((program) => (
                <TableRow
                  key={program.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => viewProgramDetails(program)}
                >
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => toggleFavorite(program, e)}
                    >
                      {program.isFavorite ? (
                        <IconStarFilled className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <IconStar className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{program.name}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-[160px] sm:max-w-xs">
                    {program.scope ? (
                      <div className="font-mono text-xs truncate" title={program.scope}>
                        {program.scope.split('\n')[0]}
                        {program.scope.split('\n').length > 1 && (
                          <span className="text-muted-foreground ml-1">
                            (+{program.scope.split('\n').length - 1} more)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge className={getStatusColor(program.status)}>
                      {program.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    {program._count?.events || 0}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    {program._count?.files || 0}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <IconClock className="h-3 w-3" />
                      {new Date(program.updatedAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(program);
                        }}
                        title="Edit program"
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => confirmDelete(program, e)}
                        title="Delete program"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((program) => (
            <Card
              key={program.id}
              className="p-4 cursor-pointer hover:shadow-md hover:border-primary/50 transition-all relative"
              onClick={() => viewProgramDetails(program)}
            >
              {/* Favorite Star - Top Right */}
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 p-0"
                onClick={(e) => toggleFavorite(program, e)}
              >
                {program.isFavorite ? (
                  <IconStarFilled className="h-4 w-4 text-yellow-500" />
                ) : (
                  <IconStar className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>

              {/* Program Name */}
              <h3 className="font-semibold text-lg mb-2 pr-8 truncate">{program.name}</h3>

              {/* Status Badge */}
              <div className="mb-3">
                <Badge className={getStatusColor(program.status)}>
                  {program.status}
                </Badge>
              </div>

              {/* Scope Preview */}
              {program.scope ? (
                <div className="mb-3 p-2 bg-muted rounded text-xs font-mono">
                  <div className="truncate">{program.scope.split('\n')[0]}</div>
                  {program.scope.split('\n').length > 1 && (
                    <div className="text-muted-foreground mt-1">
                      +{program.scope.split('\n').length - 1} more scope items
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground text-center">
                  No scope defined
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap gap-4 mb-3 text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <IconBug className="h-4 w-4" />
                  <span>{program._count?.events || 0} events</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <IconFileText className="h-4 w-4" />
                  <span>{program._count?.files || 0} files</span>
                </div>
              </div>

              {/* Last Updated */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <IconClock className="h-3 w-3" />
                Updated {new Date(program.updatedAt).toLocaleDateString()}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(program);
                  }}
                >
                  <IconEdit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => confirmDelete(program, e)}
                >
                  <IconTrash className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Program</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Program Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-scope">Scope (one per line)</Label>
              <Textarea
                id="edit-scope"
                placeholder="*.example.com&#10;https://example.com&#10;https://api.example.com/*"
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                className="min-h-[100px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter URLs and wildcards, one per line
              </p>
            </div>
            <div>
              <Label htmlFor="edit-description">Description (Markdown supported)</Label>
              <div data-color-mode={mode}>
                <MDEditor
                  value={formData.description}
                  onChange={(val) => setFormData({ ...formData, description: val || "" })}
                  height={200}
                  preview="edit"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes (Markdown supported)</Label>
              <div data-color-mode={mode}>
                <MDEditor
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val || "" })}
                  height={200}
                  preview="edit"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  selectedProgram &&
                  updateMutation.mutate({ id: selectedProgram.id, data: formData })
                }
                disabled={!formData.name || updateMutation.isPending}
              >
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Drawer */}
      <Drawer open={isDetailOpen} onOpenChange={setIsDetailOpen} direction={isMobile ? "bottom" : "right"}>
        <DrawerContent
          className="h-full max-h-[96vh]"
          resizable={!isMobile}
          defaultWidth={40}
          minWidth={20}
          maxWidth={90}
          storageKey="program-details-drawer-width"
        >
          <DrawerHeader className="gap-1">
            <DrawerTitle className="flex items-center gap-2">
              {selectedProgramDetails?.name}
              {selectedProgramDetails && (
                <Badge className={getStatusColor(selectedProgramDetails.status)}>
                  {selectedProgramDetails.status}
                </Badge>
              )}
            </DrawerTitle>
            <DrawerDescription>
              Program details, events, and files
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            {selectedProgramDetails && (
              <Tabs defaultValue="info" className="h-full flex flex-col">
                <TabsList>
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="events">
                    Events ({selectedProgramDetails.events.length})
                  </TabsTrigger>
                  <TabsTrigger value="files">
                    Files ({selectedProgramDetails.files.length})
                  </TabsTrigger>
                </TabsList>

                {/* Info Tab */}
                <TabsContent value="info" className="flex-1 overflow-y-auto mt-4">
                  <div className="space-y-4">
                    {selectedProgramDetails.scope && (
                      <div>
                        <div className="text-sm font-medium mb-2">Scope</div>
                        <pre className="text-sm bg-muted p-3 rounded font-mono whitespace-pre-wrap">
                          {selectedProgramDetails.scope}
                        </pre>
                      </div>
                    )}
                    {selectedProgramDetails.description && (
                      <div>
                        <div className="text-sm font-medium mb-2">Description</div>
                        <MarkdownRenderer content={selectedProgramDetails.description} />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Notes Tab */}
                <TabsContent value="notes" className="flex-1 overflow-y-auto mt-4">
                  {selectedProgramDetails.notes ? (
                    <MarkdownRenderer content={selectedProgramDetails.notes} />
                  ) : (
                    <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                      No notes yet
                    </div>
                  )}
                </TabsContent>

                {/* Events Tab */}
                <TabsContent value="events" className="flex-1 overflow-y-auto mt-4">
                  {selectedProgramDetails.events.length === 0 ? (
                    <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                      No events linked to this program yet
                    </div>
                  ) : (
                    <div className="border rounded overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead>Full URL</TableHead>
                            <TableHead>IP Address</TableHead>
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProgramDetails.events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell>
                                <Badge className={getMethodColor(event.method)}>
                                  {event.method}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm max-w-md truncate">
                                {event.fullUrl}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {event.ipAddress || "N/A"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {new Date(event.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => viewEventDetails(event)}
                                    title="View details"
                                  >
                                    <IconEye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate({ to: '/security/events' })}
                                    title="Go to events page"
                                  >
                                    <IconExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Files Tab */}
                <TabsContent value="files" className="flex-1 overflow-y-auto mt-4">
                  {selectedProgramDetails.files.length === 0 ? (
                    <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                      No files linked to this program yet
                    </div>
                  ) : (
                    <div className="border rounded overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Filename</TableHead>
                            <TableHead>URL Path</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProgramDetails.files.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell className="font-mono">{file.filename}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {file.urlPath}
                              </TableCell>
                              <TableCell>{file.mimetype}</TableCell>
                              <TableCell>
                                {new Date(file.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => viewFileContent(file)}
                                    title="View content"
                                  >
                                    <IconEye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate({ to: '/files' })}
                                    title="Go to files page"
                                  >
                                    <IconExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{programToDelete?.name}</strong>?
              {programToDelete && (
                <div className="mt-3 p-3 bg-muted rounded-md space-y-2">
                  <p className="text-sm font-medium text-foreground">This will affect:</p>
                  <ul className="text-sm space-y-1">
                    <li className="flex items-center gap-2">
                      <IconBug className="h-4 w-4 text-muted-foreground" />
                      {programToDelete._count?.events || 0} linked events (will be unlinked)
                    </li>
                    <li className="flex items-center gap-2">
                      <IconFileText className="h-4 w-4 text-muted-foreground" />
                      {programToDelete._count?.files || 0} linked files (will be unlinked)
                    </li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Events and files will not be deleted, only unlinked from this program.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Program
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import from Platform Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Import from {importPlatform.charAt(0).toUpperCase() + importPlatform.slice(1)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-md">
              <div className="flex gap-2 text-sm text-blue-600 dark:text-blue-400">
                <IconBug className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-medium mb-1">Coming Soon!</p>
                  <p className="text-xs opacity-90">
                    This feature is currently under development. You'll soon be able to import
                    programs directly from {importPlatform.charAt(0).toUpperCase() + importPlatform.slice(1)} using your API credentials.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="api-token">API Token</Label>
              <Input
                id="api-token"
                placeholder="Enter your API token..."
                disabled
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your API token will be used to fetch programs from {importPlatform.charAt(0).toUpperCase() + importPlatform.slice(1)}
              </p>
            </div>

            <div>
              <Label>Select Programs to Import</Label>
              <div className="mt-2 p-4 border rounded-md bg-muted/20 text-center text-sm text-muted-foreground">
                Programs will appear here after connecting your account
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button disabled className="flex-1">
                <IconDownload className="mr-2 h-4 w-4" />
                Import Selected
              </Button>
              <Button variant="outline" onClick={() => setIsImportOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EventDetailsDialog
        open={isEventDetailOpen}
        onOpenChange={setIsEventDetailOpen}
        event={selectedEvent}
        programs={programs}
        onLinkProgram={(eventId, programId) => {
          linkEventToProgramMutation.mutate({ eventId, programId });
        }}
      />

      <FileContentDialog
        open={isFileContentOpen}
        onOpenChange={setIsFileContentOpen}
        filename={selectedFileContent?.filename || null}
        content={selectedFileContent?.content || null}
      />
    </div>
  );
}
