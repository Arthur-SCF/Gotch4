import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IconCopy,
  IconEdit,
  IconTrash,
  IconStar,
  IconStarFilled,
  IconCheck,
} from "@tabler/icons-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import PayloadForm from "@/components/PayloadForm";
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
import { toast } from "sonner";
import { useCopyButton } from "@/hooks/useCopyButton";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

interface PayloadDrawerProps {
  payload: any;
  open: boolean;
  onClose: () => void;
}

export default function PayloadDrawer({
  payload: initialPayload,
  open,
  onClose,
}: PayloadDrawerProps) {
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { copy, isCopied } = useCopyButton();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Fetch the current payload data so it updates when mutations invalidate
  const { data: payload = initialPayload } = useQuery({
    queryKey: ["payload", initialPayload?.id],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/payloads/${initialPayload.id}`);
      if (!res.ok) throw new Error("Failed to fetch payload");
      return res.json();
    },
    enabled: open && !!initialPayload?.id,
    initialData: initialPayload,
  });

  // Fetch webhook config for variable replacement
  const { data: webhookConfig } = useQuery({
    queryKey: ["webhook-config"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/config/webhook-url`);
      if (!res.ok) throw new Error("Failed to fetch webhook config");
      return res.json();
    },
  });

  // Detect all variables in content (uppercase only to avoid SSTI confusion)
  // Pattern: {{VARIABLE_NAME}} where name is uppercase letters, numbers, underscores
  const detectVariables = (content: string): string[] => {
    const regex = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
    const matches = content.matchAll(regex);
    const variables = new Set<string>();
    for (const match of matches) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  };

  const detectedVariables = payload ? detectVariables(payload.content) : [];
  const hasVariables = detectedVariables.length > 0;

  // Initialize variable values with defaults
  useEffect(() => {
    if (webhookConfig && payload && detectedVariables.length > 0) {
      const defaults: Record<string, string> = {};

      detectedVariables.forEach((varName) => {
        // Set defaults for known variables
        if (varName === "WEBHOOK_URL") {
          defaults[varName] = webhookConfig.webhookUrl;
        } else if (varName === "WEBHOOK_DOMAIN") {
          defaults[varName] = webhookConfig.webhookDomain;
        } else {
          // Unknown variables start empty (user must fill them)
          defaults[varName] = variableValues[varName] || "";
        }
      });

      setVariableValues((prev) => ({ ...defaults, ...prev }));
    }
  }, [webhookConfig, payload?.content]);

  // Fetch categories for edit form
  const { data: categories = [] } = useQuery({
    queryKey: ["payload-categories"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/payload-categories`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: isEditOpen,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/payloads/${payload.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete payload");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      toast.success("Payload deleted successfully");
      onClose();
    },
    onError: () => {
      toast.error("Failed to delete payload");
    },
  });

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/payloads/${payload.id}/favorite`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error("Failed to toggle favorite");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all payload queries to update everywhere
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      queryClient.invalidateQueries({ queryKey: ["payload", payload.id] });
      toast.success(
        payload.isFavorite ? "Removed from favorites" : "Added to favorites"
      );
    },
    onError: () => {
      toast.error("Failed to update favorite");
    },
  });

  if (!payload) return null;

  // Replace all detected variables
  const replaceVariables = (content: string): string => {
    let result = content;
    detectedVariables.forEach((varName) => {
      const value = variableValues[varName] || `{{${varName}}}`;
      const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });
    return result;
  };

  const processedContent = replaceVariables(payload.content);

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleEditComplete = () => {
    setIsEditOpen(false);
    queryClient.invalidateQueries({ queryKey: ["payloads"] });
    queryClient.invalidateQueries({ queryKey: ["payload", payload.id] });
  };

  // Parse tags
  let tags: string[] = [];
  try {
    if (payload.tags) {
      tags = JSON.parse(payload.tags);
    }
  } catch {}

  return (
    <>
      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DrawerContent className="max-w-5xl mx-auto h-[90vh] flex flex-col">
          <DrawerHeader className="border-b pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <DrawerTitle className="text-2xl">{payload.name}</DrawerTitle>
                {payload.category && (
                  <div className="flex items-center gap-2 mt-2">
                    {payload.category.color && (
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: payload.category.color }}
                      />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {payload.category.name}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleFavoriteMutation.mutate()}
                  disabled={toggleFavoriteMutation.isPending}
                >
                  {payload.isFavorite ? (
                    <IconStarFilled className="size-4 text-yellow-500" />
                  ) : (
                    <IconStar className="size-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsEditOpen(true)}
                >
                  <IconEdit className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-hidden p-6">
            <Tabs defaultValue="content" className="h-full flex flex-col">
              <TabsList className="mb-4">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="content" className="mt-0">
                  <div className="space-y-4">
                    {/* Copy Buttons */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() =>
                          copy(payload.content, "raw", "raw payload")
                        }
                        variant="outline"
                        className="flex-1 group"
                      >
                        <span className="inline-flex items-center transition-transform group-hover:scale-110">
                          {isCopied("raw") ? (
                            <>
                              <IconCheck className="size-4 mr-2" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <IconCopy className="size-4 mr-2" />
                              Copy Raw
                            </>
                          )}
                        </span>
                      </Button>
                      {hasVariables && (
                        <Button
                          onClick={() =>
                            copy(processedContent, "processed", "processed payload")
                          }
                          className="flex-1 group"
                        >
                          <span className="inline-flex items-center transition-transform group-hover:scale-110">
                            {isCopied("processed") ? (
                              <>
                                <IconCheck className="size-4 mr-2" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <IconCopy className="size-4 mr-2" />
                                Copy Processed
                              </>
                            )}
                          </span>
                        </Button>
                      )}
                    </div>

                    {/* Raw Content */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Raw Content</h4>
                      <SyntaxHighlighter
                        language="javascript"
                        style={oneDark}
                        customStyle={{
                          borderRadius: "0.5rem",
                          padding: "1rem",
                        }}
                        showLineNumbers
                      >
                        {payload.content}
                      </SyntaxHighlighter>
                    </div>

                    {/* Variables Section - Only show if variables detected */}
                    {hasVariables && (
                      <div className="border-2 border-primary/40 rounded-lg p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <span className="size-2 rounded-full bg-primary animate-pulse" />
                          Variables ({detectedVariables.length})
                        </h4>
                        <div className="space-y-3">
                          {detectedVariables.map((varName) => {
                            const isKnownVar = varName === "WEBHOOK_URL" || varName === "WEBHOOK_DOMAIN";
                            const placeholder = isKnownVar
                              ? `Default from config`
                              : `Enter value for ${varName}`;

                            return (
                              <div key={varName}>
                                <Label htmlFor={`var-${varName}`} className="text-sm flex items-center gap-1">
                                  {varName.replace(/_/g, " ")}
                                  {!isKnownVar && <span className="text-orange-500 text-xs">* Custom</span>}
                                </Label>
                                <Input
                                  id={`var-${varName}`}
                                  value={variableValues[varName] || ""}
                                  onChange={(e) =>
                                    setVariableValues((prev) => ({ ...prev, [varName]: e.target.value }))
                                  }
                                  placeholder={placeholder}
                                  className="mt-1"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Replaces <code className="bg-muted px-1 rounded">{`{{${varName}}}`}</code>
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {/* Live Preview */}
                        {Object.values(variableValues).some((v) => v) && (
                          <div className="mt-4 pt-4 border-t border-primary/20">
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <span className="text-primary">→</span>
                              Processed Preview
                            </h4>
                            <SyntaxHighlighter
                              language="javascript"
                              style={oneDark}
                              customStyle={{
                                borderRadius: "0.5rem",
                                padding: "1rem",
                              }}
                              showLineNumbers
                            >
                              {processedContent}
                            </SyntaxHighlighter>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="info" className="mt-0">
                  <div className="space-y-4">
                    {payload.description && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Description</h4>
                        <MarkdownRenderer content={payload.description} />
                      </div>
                    )}

                    {tags.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag: string, index: number) => (
                            <Badge key={index} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {payload.program && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">
                          Linked Program
                        </h4>
                        <Badge>{payload.program.name}</Badge>
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-semibold mb-2">Metadata</h4>
                      <div className="text-sm space-y-1 text-muted-foreground">
                        <p>
                          Created:{" "}
                          {new Date(payload.createdAt).toLocaleString()}
                        </p>
                        <p>
                          Updated:{" "}
                          {new Date(payload.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit Dialog */}
      {isEditOpen && (
        <PayloadForm
          open={isEditOpen}
          onClose={handleEditComplete}
          categories={categories}
          payload={payload}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payload</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{payload.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
