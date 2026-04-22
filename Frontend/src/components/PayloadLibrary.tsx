import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  IconSearch,
  IconPlus,
  IconFileImport,
  IconFileExport,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import CategorySidebar from "@/components/CategorySidebar";
import PayloadCard from "@/components/PayloadCard";
import PayloadDrawer from "@/components/PayloadDrawer";
import PayloadForm from "@/components/PayloadForm";
import ImportDialog from "@/components/ImportDialog";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

export default function PayloadLibrary() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");

  const queryClient = useQueryClient();

  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; color: string }) => {
      const res = await apiFetch(`${API_URL}/api/payload-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create category");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payload-categories"] });
      setIsCreateCategoryOpen(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      setNewCategoryColor("#6366f1");
      toast.success("Category created");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["payload-categories"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/payload-categories`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });

  // Fetch payloads with filters
  const { data: payloadResponse, isLoading } = useQuery({
    queryKey: ["payloads", selectedCategory, searchQuery, showFavoritesOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("categoryId", selectedCategory.toString());
      if (searchQuery) params.append("search", searchQuery);
      if (showFavoritesOnly) params.append("favorite", "true");
      const res = await apiFetch(`${API_URL}/api/payloads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch payloads");
      return res.json();
    },
  });

  const payloads = payloadResponse?.data || [];

  // Export payloads
  const handleExport = async () => {
    try {
      const res = await apiFetch(`${API_URL}/api/payloads/export`);
      if (!res.ok) throw new Error("Failed to export payloads");
      const data = await res.json();

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payloads-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Payloads exported successfully");
    } catch (error) {
      toast.error("Failed to export payloads");
      console.error(error);
    }
  };

  const handlePayloadClick = (payload: any) => {
    setSelectedPayload(payload);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedPayload(null);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Left Sidebar - Categories */}
      <div className="w-full lg:w-64 flex-shrink-0">
        <CategorySidebar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onCreateCategory={() => setIsCreateCategoryOpen(true)}
        />
      </div>

      {/* Main Content - Payload Grid */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search payloads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="icon"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title={showFavoritesOnly ? "Show all" : "Show favorites only"}
              className="shrink-0"
            >
              {showFavoritesOnly ? (
                <IconStarFilled className="size-4" />
              ) : (
                <IconStar className="size-4" />
              )}
            </Button>
            <Button variant="outline" onClick={() => setIsCreateOpen(true)} className="flex-1 sm:flex-initial">
              <IconPlus className="size-4 sm:mr-2" />
              <span className="sm:inline">New</span>
            </Button>
            <Button variant="outline" onClick={() => setIsImportOpen(true)} className="hidden sm:flex">
              <IconFileImport className="size-4 mr-2" />
              Import
            </Button>
            <Button variant="outline" onClick={handleExport} className="hidden sm:flex">
              <IconFileExport className="size-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="icon" onClick={() => setIsImportOpen(true)} className="sm:hidden shrink-0">
              <IconFileImport className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleExport} className="sm:hidden shrink-0">
              <IconFileExport className="size-4" />
            </Button>
          </div>
        </div>

        {/* Payload Grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading payloads...</p>
            </div>
          ) : payloads.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-muted-foreground mb-2">No payloads found</p>
                {searchQuery && (
                  <Button variant="link" onClick={() => setSearchQuery("")}>
                    Clear search
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 pb-4">
              {payloads.map((payload: any) => (
                <PayloadCard
                  key={payload.id}
                  payload={payload}
                  onClick={() => handlePayloadClick(payload)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payload Detail Drawer */}
      <PayloadDrawer
        payload={selectedPayload}
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
      />

      {/* Create Payload Dialog */}
      <PayloadForm
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        categories={categories}
      />

      {/* Import Dialog */}
      <ImportDialog open={isImportOpen} onClose={() => setIsImportOpen(false)} />

      {/* Create Category Dialog */}
      <Dialog open={isCreateCategoryOpen} onOpenChange={setIsCreateCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                placeholder="e.g. Open Redirect"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategoryName.trim()) {
                    createCategoryMutation.mutate({
                      name: newCategoryName.trim(),
                      description: newCategoryDescription.trim(),
                      color: newCategoryColor,
                    });
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Input
                id="cat-desc"
                placeholder="Optional description"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="cat-color"
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="h-8 w-12 rounded border cursor-pointer"
                />
                <span className="text-xs text-muted-foreground font-mono">{newCategoryColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
              onClick={() =>
                createCategoryMutation.mutate({
                  name: newCategoryName.trim(),
                  description: newCategoryDescription.trim(),
                  color: newCategoryColor,
                })
              }
            >
              {createCategoryMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
