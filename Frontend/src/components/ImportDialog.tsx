import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconFileImport, IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ImportDialog({ open, onClose }: ImportDialogProps) {
  const queryClient = useQueryClient();
  const [importData, setImportData] = useState<any>(null);
  const [mode, setMode] = useState<string>("merge");
  const [results, setResults] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setResults(null);

    // Read and parse the file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        // Validate format
        if (!data.version || !data.categories || !data.payloads) {
          toast.error("Invalid import file format");
          setImportData(null);
          return;
        }

        setImportData(data);
      } catch (error) {
        toast.error("Failed to parse JSON file");
        setImportData(null);
      }
    };

    reader.readAsText(selectedFile);
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importData) throw new Error("No data to import");

      const res = await apiFetch(`${API_URL}/api/payloads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...importData,
          mode,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to import");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      queryClient.invalidateQueries({ queryKey: ["payload-categories"] });
      setResults(data.results);
      toast.success("Import completed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to import payloads");
    },
  });

  const handleImport = () => {
    if (!importData) {
      toast.error("Please select a file first");
      return;
    }

    if (mode === "replace") {
      // Show warning for replace mode
      if (
        !confirm(
          "⚠️ WARNING: Replace mode will DELETE all existing payloads and categories. Are you sure?"
        )
      ) {
        return;
      }
    }

    importMutation.mutate();
  };

  const handleClose = () => {
    setImportData(null);
    setResults(null);
    setMode("merge");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Payloads</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Selection */}
          <div>
            <Label htmlFor="file">Select JSON File</Label>
            <input
              id="file"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="mt-2 block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                cursor-pointer"
            />
          </div>

          {/* Import Mode */}
          {importData && !results && (
            <div>
              <Label htmlFor="mode">Import Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    Merge (Add new, skip duplicates)
                  </SelectItem>
                  <SelectItem value="merge-update">
                    Merge and Update (Add new, update existing)
                  </SelectItem>
                  <SelectItem value="replace">
                    Replace All (⚠️ Delete everything, import fresh)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {mode === "merge" &&
                  "New payloads will be added. Existing payloads with the same name and category will be skipped."}
                {mode === "merge-update" &&
                  "New payloads will be added. Existing payloads with the same name and category will be updated."}
                {mode === "replace" &&
                  "⚠️ All existing payloads and categories will be DELETED and replaced with imported data."}
              </p>
            </div>
          )}

          {/* Preview */}
          {importData && !results && (
            <div className="bg-muted p-4 rounded space-y-2">
              <h4 className="font-semibold text-sm">Import Preview</h4>
              <div className="text-sm space-y-1">
                <p>
                  <strong>Categories:</strong> {importData.categories?.length || 0}
                </p>
                <p>
                  <strong>Payloads:</strong> {importData.payloads?.length || 0}
                </p>
                <p>
                  <strong>Export Date:</strong>{" "}
                  {importData.exportDate
                    ? new Date(importData.exportDate).toLocaleString()
                    : "Unknown"}
                </p>
              </div>

              {mode === "replace" && (
                <div className="flex items-start gap-2 mt-3 p-2 bg-destructive/10 rounded">
                  <IconAlertCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    <strong>Warning:</strong> Replace mode will permanently delete all
                    existing data before importing. This cannot be undone.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded space-y-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <IconCheck className="size-5" />
                <h4 className="font-semibold">Import Successful</h4>
              </div>
              <div className="text-sm space-y-1 text-green-700 dark:text-green-300">
                <p>Categories created: {results.categoriesCreated}</p>
                <p>Categories updated: {results.categoriesUpdated}</p>
                <p>Payloads created: {results.payloadsCreated}</p>
                <p>Payloads updated: {results.payloadsUpdated}</p>
                <p>Payloads skipped: {results.payloadsSkipped}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              onClick={handleImport}
              disabled={!importData || importMutation.isPending}
            >
              <IconFileImport className="size-4 mr-2" />
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
