import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconDownload, IconCopy, IconEdit, IconX, IconCheck, IconNote, IconEye, IconEyeOff, IconExternalLink } from "@tabler/icons-react";
import { toast } from "sonner";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { getFileTypeInfo, canPreview, getLanguageForHighlight } from "@/lib/utils/fileTypes";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProgramLinkSelector } from "@/components/ProgramLinkSelector";
import { useCopyButton } from "@/hooks/useCopyButton";

interface FilePreviewDrawerProps {
  file: any | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (data: { content?: string; urlPath?: string; mimetype?: string }) => void;
  onLinkProgram: (programId: number | null) => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateVisibility: (isPublic: boolean) => void;
  programs: any[];
}

export function FilePreviewDrawer({
  file,
  open,
  onClose,
  onUpdate,
  onLinkProgram,
  onUpdateNotes,
  onUpdateVisibility,
  programs,
}: FilePreviewDrawerProps) {
  const [content, setContent] = useState("");
  const [urlPath, setUrlPath] = useState("");
  const [mimetype, setMimetype] = useState("");
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isMobile = useIsMobile();
  const { copy, isCopied } = useCopyButton();

  useEffect(() => {
    if (file && open) {
      loadFileContent();
      setUrlPath(file.urlPath);
      setMimetype(file.mimetype);
      setNotes(file.notes || "");
      setIsPublic(file.isPublic);
      setIsEditing(false);
      setIsEditingNotes(false);
    }
  }, [file, open]);

  const loadFileContent = async () => {
    if (!file) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/files/${file.id}/content`);
      const data = await res.json();
      setContent(data.content);
    } catch (error) {
      toast.error("Failed to load file content");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    onUpdate({
      content,
      urlPath: urlPath !== file.urlPath ? urlPath : undefined,
      mimetype: mimetype !== file.mimetype ? mimetype : undefined,
    });
    setIsEditing(false);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: file.mimetype });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("File downloaded");
  };

  const handleCopyUrl = () => {
    const url = `${API_URL}${file.urlPath}`;
    copy(url, "file-url", "URL");
  };

  const handleSaveNotes = () => {
    onUpdateNotes(notes);
    setIsEditingNotes(false);
  };

  const handleToggleVisibility = () => {
    const newVisibility = !isPublic;
    setIsPublic(newVisibility); // Optimistic update
    onUpdateVisibility(newVisibility);
  };

  if (!file) return null;

  const fileTypeInfo = getFileTypeInfo(file.filename, file.mimetype);
  const Icon = fileTypeInfo.icon;
  const canShowPreview = canPreview(file.filename);
  const language = getLanguageForHighlight(file.filename);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <Drawer open={open} onOpenChange={onClose} direction={isMobile ? "bottom" : "right"}>
      <DrawerContent
        className="h-full max-h-[96vh]"
        resizable={!isMobile}
        defaultWidth={50}
        minWidth={30}
        maxWidth={90}
        storageKey="file-preview-drawer-width"
      >
        <DrawerHeader className="gap-1 border-b pb-4">
          <DrawerTitle className="flex items-center gap-2">
            <Icon className={`size-5 ${fileTypeInfo.color}`} />
            <span className="truncate font-mono">{file.filename}</span>
          </DrawerTitle>
          <DrawerDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{fileTypeInfo.badge}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {new Date(file.createdAt).toLocaleString()}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden px-4 pb-4 flex flex-col gap-4">
          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyUrl}
            >
              {isCopied("file-url") ? (
                <IconCheck className="size-4 mr-2" />
              ) : (
                <IconCopy className="size-4 mr-2" />
              )}
              Copy URL
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(window.location.origin + file.urlPath, '_blank')}
            >
              <IconExternalLink className="size-4 mr-2" />
              Open in New Tab
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
            >
              <IconDownload className="size-4 mr-2" />
              Download
            </Button>
            <Button
              size="sm"
              variant={isPublic ? "outline" : "default"}
              onClick={handleToggleVisibility}
              title={isPublic ? "Make Private (Auth required)" : "Make Public (Auth required)"}
            >
              {isPublic ? (
                <>
                  <IconEye className="size-4 mr-2" />
                  Public
                </>
              ) : (
                <>
                  <IconEyeOff className="size-4 mr-2" />
                  Private
                </>
              )}
            </Button>
            {!isEditing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
              >
                <IconEdit className="size-4 mr-2" />
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSave}>
                  <IconCheck className="size-4 mr-2" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setUrlPath(file.urlPath);
                    setMimetype(file.mimetype);
                    loadFileContent();
                  }}
                >
                  <IconX className="size-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
          </div>

          {/* URL Path */}
          <div>
            <Label htmlFor="urlPath">URL Path</Label>
            <Input
              id="urlPath"
              value={urlPath}
              onChange={(e) => setUrlPath(e.target.value)}
              disabled={!isEditing}
              className="font-mono text-sm"
            />
          </div>

          {/* Content-Type */}
          <div>
            <Label htmlFor="mimetype">Content-Type</Label>
            <Input
              id="mimetype"
              value={mimetype}
              onChange={(e) => setMimetype(e.target.value)}
              disabled={!isEditing}
              className="font-mono text-sm"
              placeholder="text/html"
            />
          </div>

          {/* Program Link */}
          <ProgramLinkSelector
            programs={programs}
            selectedProgramId={file.programId}
            onProgramChange={onLinkProgram}
            disabled={isEditing}
          />

          {/* Tabs for Content and Notes */}
          <Tabs defaultValue="content" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="notes">
                <IconNote className="size-4 mr-1" />
                Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="flex-1 overflow-hidden flex flex-col mt-4">
              {isEditing ? (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 resize-none font-mono text-sm"
                />
              ) : isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : canShowPreview ? (
                <div className="flex-1 overflow-auto rounded-md border">
                  <SyntaxHighlighter
                    language={language}
                    style={vscDarkPlus}
                    showLineNumbers
                    customStyle={{
                      margin: 0,
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {content}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full border rounded-md">
                  <p className="text-muted-foreground text-sm">
                    Preview not available for this file type
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="notes" className="flex-1 overflow-auto mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">File Notes</div>
                {!isEditingNotes ? (
                  <Button size="sm" variant="ghost" onClick={() => setIsEditingNotes(true)}>
                    <IconEdit className="size-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleSaveNotes}>
                      <IconCheck className="size-4 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotes(file.notes || "");
                        setIsEditingNotes(false);
                      }}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              {isEditingNotes ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this file..."
                  className="min-h-[200px] font-mono text-sm resize-none"
                />
              ) : notes ? (
                <div className="text-sm whitespace-pre-wrap p-4 bg-muted rounded-md">
                  {notes}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                  No notes yet. Click the edit button to add notes about this file.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
