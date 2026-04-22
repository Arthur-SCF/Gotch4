import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FileContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string | null;
  content: string | null;
}

export function FileContentDialog({
  open,
  onOpenChange,
  filename,
  content,
}: FileContentDialogProps) {
  if (!filename || !content) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>File Content: {filename}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <div className="text-sm font-medium mb-1">Content</div>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-w-full font-mono">
              {content}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
