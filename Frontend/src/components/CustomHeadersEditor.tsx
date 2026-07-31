import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HEADER_TEMPLATES, parseHeaders, serializeHeaders } from "@/lib/headerTemplates";

interface CustomHeadersEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function CustomHeadersEditor({ value, onChange }: CustomHeadersEditorProps) {
  const applyTemplate = (id: string) => {
    const template = HEADER_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    onChange(serializeHeaders({ ...parseHeaders(value), ...template.headers }));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Custom response headers served with this file. For special cases only — where the default
        CORS behavior blocks an exploit (e.g. Safari CORP). Leave empty to keep the default
        per-origin behavior. One <code>Name: value</code> per line.
      </p>

      <div>
        <Label className="text-sm">Apply a template</Label>
        <Select value="" onValueChange={applyTemplate}>
          <SelectTrigger className="mt-1.5 w-full">
            <SelectValue placeholder="Choose a preset…" />
          </SelectTrigger>
          <SelectContent className="max-w-[92vw] sm:max-w-[520px]">
            {HEADER_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex flex-col gap-0.5 py-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground whitespace-normal">{t.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Cross-Origin-Resource-Policy: cross-origin\nAccess-Control-Allow-Origin: *"}
        className="min-h-[160px] font-mono text-sm resize-none"
        spellCheck={false}
      />
    </div>
  );
}
