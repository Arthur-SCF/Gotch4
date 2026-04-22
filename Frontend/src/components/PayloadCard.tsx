import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCopy, IconStar, IconStarFilled, IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCopyButton } from "@/hooks/useCopyButton";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";

interface PayloadCardProps {
  payload: any;
  onClick: () => void;
}

export default function PayloadCard({ payload, onClick }: PayloadCardProps) {
  const queryClient = useQueryClient();
  const { copy, isCopied } = useCopyButton();
  const [showVariables, setShowVariables] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Fetch webhook config
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

  const detectedVariables = detectVariables(payload.content);
  const hasVariables = detectedVariables.length > 0;

  // Initialize variable values with defaults
  useEffect(() => {
    if (webhookConfig && detectedVariables.length > 0) {
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
  }, [webhookConfig, payload.content]);

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
      queryClient.invalidateQueries({ queryKey: ["payloads"] });
      toast.success(
        payload.isFavorite ? "Removed from favorites" : "Added to favorites"
      );
    },
    onError: () => {
      toast.error("Failed to update favorite");
    },
  });

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

  const handleCopyRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    copy(payload.content, `payload-raw-${payload.id}`, "raw payload");
  };

  const handleCopyProcessed = (e: React.MouseEvent) => {
    e.stopPropagation();
    copy(processedContent, `payload-processed-${payload.id}`, "processed payload");
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate();
  };

  const toggleVariables = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVariables(!showVariables);
  };

  // Parse tags
  let tags: string[] = [];
  try {
    if (payload.tags) {
      tags = JSON.parse(payload.tags);
    }
  } catch {
    // If parsing fails, ignore
  }

  return (
    <Card
      className="p-4 hover:border-primary transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{payload.name}</h4>
          {payload.category && (
            <div className="flex items-center gap-1 mt-1">
              {payload.category.color && (
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: payload.category.color }}
                />
              )}
              <span className="text-xs text-muted-foreground">
                {payload.category.name}
              </span>
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 flex-shrink-0"
          onClick={handleToggleFavorite}
        >
          {payload.isFavorite ? (
            <IconStarFilled className="size-4 text-yellow-500" />
          ) : (
            <IconStar className="size-4" />
          )}
        </Button>
      </div>

      <pre className="text-xs font-mono bg-muted p-2 rounded overflow-auto max-h-24 whitespace-pre-wrap break-all mb-2 discrete-scrollbar">
        {payload.content}
      </pre>

      {/* Variables Section - Only show if variables detected */}
      {hasVariables && (
        <div className="mb-2 border-2 border-primary/40 rounded-md bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={toggleVariables}
            className="w-full px-2 py-1.5 flex items-center justify-between text-xs font-medium hover:bg-primary/10 transition-colors rounded-t-md"
          >
            <span className="flex items-center gap-1.5 text-foreground font-semibold">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Variables {showVariables ? "" : `(${detectedVariables.length})`}
            </span>
            {showVariables ? (
              <IconChevronUp className="size-3" />
            ) : (
              <IconChevronDown className="size-3" />
            )}
          </button>

          {showVariables && (
            <div className="p-2 space-y-2 border-t">
              {detectedVariables.map((varName) => {
                const isKnownVar = varName === "WEBHOOK_URL" || varName === "WEBHOOK_DOMAIN";
                const placeholder = isKnownVar
                  ? `Default from config`
                  : `Enter value for ${varName}`;

                return (
                  <div key={varName}>
                    <Label htmlFor={`var-${varName}-${payload.id}`} className="text-xs text-muted-foreground">
                      {varName.replace(/_/g, " ")}
                      {!isKnownVar && <span className="text-orange-500 ml-1">*</span>}
                    </Label>
                    <Input
                      id={`var-${varName}-${payload.id}`}
                      value={variableValues[varName] || ""}
                      onChange={(e) =>
                        setVariableValues((prev) => ({ ...prev, [varName]: e.target.value }))
                      }
                      className="h-7 text-xs"
                      placeholder={placeholder}
                    />
                  </div>
                );
              })}
              {detectedVariables.length > 0 && (
                <div className="mt-2 pt-2 border-t border-primary/20">
                  <p className="text-xs font-medium mb-1 flex items-center gap-1">
                    <span className="text-primary">→</span>
                    Preview:
                  </p>
                  <pre className="text-xs font-mono bg-background p-2 rounded overflow-auto max-h-20 whitespace-pre-wrap break-all">
                    {processedContent}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 3).map((tag: string, index: number) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 group" onClick={handleCopyRaw}>
          <span className="inline-flex items-center transition-transform group-hover:scale-110">
            {isCopied(`payload-raw-${payload.id}`) ? (
              <>
                <IconCheck className="size-3 mr-1" />
                Copied!
              </>
            ) : (
              <>
                <IconCopy className="size-3 mr-1" />
                Copy Raw
              </>
            )}
          </span>
        </Button>
        {hasVariables && (
          <Button size="sm" variant="default" className="flex-1 group" onClick={handleCopyProcessed}>
            <span className="inline-flex items-center transition-transform group-hover:scale-110">
              {isCopied(`payload-processed-${payload.id}`) ? (
                <>
                  <IconCheck className="size-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <IconCopy className="size-3 mr-1" />
                  Copy Processed
                </>
              )}
            </span>
          </Button>
        )}
      </div>
    </Card>
  );
}
