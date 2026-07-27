import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { useTheme } from "@/components/ThemeProvider";
import { useCopyButton } from "@/hooks/useCopyButton";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  /** Extra classes for the wrapper (e.g. rounding, max-height). */
  className?: string;
  /** Bound the height and scroll inside, e.g. "24rem" or "60vh". */
  maxHeight?: string;
  fontSize?: string;
  /** When set, renders a hover "copy all" button with this stable id. */
  copyId?: string;
  copyLabel?: string;
}

/**
 * Shared code renderer with syntax highlighting.
 *
 * Fixes two long-standing issues with the raw react-syntax-highlighter usage:
 *  1. Theme match — the highlight theme follows the app light/dark mode and the
 *     background is the theme's `muted` token instead of a fixed dark colour, so
 *     it no longer looks out of place on light/other themes.
 *  2. Selectable text — inside a vaul drawer, pointerdown is captured for
 *     drag-to-dismiss which kills native text selection. Stopping propagation
 *     and forcing `user-select: text` lets you select and copy a portion of the
 *     code (not just the whole block via the copy button).
 */
export function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
  className,
  maxHeight,
  fontSize = "0.8125rem",
  copyId,
  copyLabel = "code",
}: CodeBlockProps) {
  const { mode } = useTheme();
  const { copy, isCopied } = useCopyButton();
  const style = mode === "dark" ? oneDark : oneLight;

  const selectable: React.CSSProperties = {
    userSelect: "text",
    WebkitUserSelect: "text",
  };

  return (
    <div
      data-vaul-no-drag
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "group relative overflow-hidden rounded-md border bg-muted",
        className,
      )}
    >
      {copyId && (
        <button
          type="button"
          onClick={() => copy(code, copyId, copyLabel)}
          aria-label={`Copy ${copyLabel}`}
          className="absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-md border bg-background/80 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          {isCopied(copyId) ? (
            <IconCheck className="size-3.5 text-emerald-500" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
        </button>
      )}
      <SyntaxHighlighter
        language={language}
        style={style}
        showLineNumbers={showLineNumbers}
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "0.75rem",
          fontSize,
          maxHeight,
          overflow: "auto",
          ...selectable,
        }}
        codeTagProps={{ style: { background: "transparent", ...selectable } }}
        lineNumberStyle={{ userSelect: "none", opacity: 0.5, minWidth: "2.25em" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
