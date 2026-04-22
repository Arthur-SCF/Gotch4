import { useState } from "react";
import { toast } from "sonner";

/**
 * Hook for managing copy button state with animation
 * Provides visual feedback by tracking which button was recently clicked
 */
export function useCopyButton() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success(`Copied ${label} to clipboard`);

      // Reset after 2 seconds
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const isCopied = (id: string) => copiedId === id;

  return { copy, isCopied };
}
