import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconCopy, IconTrash, IconCheck } from "@tabler/icons-react";
import { useCopyButton } from "@/hooks/useCopyButton";

// Encoding functions
function urlEncodePartial(text: string): string {
  return text.replace(/[^A-Za-z0-9\-_.~]/g, (char) => {
    return "%" + char.charCodeAt(0).toString(16).toUpperCase();
  });
}

function urlEncodeFull(text: string): string {
  return Array.from(text)
    .map((char) => "%" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return "Error: Invalid URL encoding";
  }
}

function urlDecodeDouble(text: string): string {
  try {
    return decodeURIComponent(decodeURIComponent(text));
  } catch {
    return "Error: Invalid double URL encoding";
  }
}

function base64Encode(text: string): string {
  try {
    return btoa(text);
  } catch {
    return "Error: Unable to encode";
  }
}

function base64Decode(text: string): string {
  try {
    return atob(text);
  } catch {
    return "Error: Invalid Base64";
  }
}

function htmlEncode(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function htmlDecode(text: string): string {
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.textContent || "";
}

function unicodeEscape(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code > 127) {
        return "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
      }
      return char;
    })
    .join("");
}

function hexEncode(text: string): string {
  return Array.from(text)
    .map((char) => "\\x" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

async function hash(text: string, algorithm: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "Error: Unable to hash";
  }
}

interface OutputResult {
  label: string;
  value: string;
  description?: string;
}

export default function EncoderDecoder() {
  const [inputText, setInputText] = useState("");
  const [encodeOutputs, setEncodeOutputs] = useState<OutputResult[]>([]);
  const [decodeOutputs, setDecodeOutputs] = useState<OutputResult[]>([]);
  const [hashOutputs, setHashOutputs] = useState<OutputResult[]>([]);
  const { copy, isCopied } = useCopyButton();

  useEffect(() => {
    if (!inputText) {
      setEncodeOutputs([]);
      setDecodeOutputs([]);
      setHashOutputs([]);
      return;
    }

    // Calculate all encodings
    Promise.all([
      hash(inputText, "SHA-256"),
      hash(inputText, "SHA-1"),
      hash(inputText, "SHA-384"),
      hash(inputText, "SHA-512"),
    ]).then(([sha256, sha1, sha384, sha512]) => {
      // Encode operations
      setEncodeOutputs([
        {
          label: "URL (Partial)",
          value: urlEncodePartial(inputText),
          description: "Encode special characters only",
        },
        {
          label: "URL (Full)",
          value: urlEncodeFull(inputText),
          description: "Encode every character",
        },
        {
          label: "Base64",
          value: base64Encode(inputText),
          description: "Standard Base64 encoding",
        },
        {
          label: "HTML Entities",
          value: htmlEncode(inputText),
          description: "Convert to HTML entities",
        },
        {
          label: "Unicode Escape",
          value: unicodeEscape(inputText),
          description: "\\uXXXX format for non-ASCII",
        },
        {
          label: "Hex Escape",
          value: hexEncode(inputText),
          description: "\\xXX format for all characters",
        },
      ]);

      // Decode operations
      setDecodeOutputs([
        {
          label: "URL Decode",
          value: urlDecode(inputText),
          description: "Decode URL encoding",
        },
        {
          label: "URL Decode (Double)",
          value: urlDecodeDouble(inputText),
          description: "Decode twice for double-encoded",
        },
        {
          label: "Base64 Decode",
          value: base64Decode(inputText),
          description: "Decode Base64 string",
        },
        {
          label: "HTML Decode",
          value: htmlDecode(inputText),
          description: "Decode HTML entities",
        },
      ]);

      // Hash operations
      setHashOutputs([
        {
          label: "SHA-256",
          value: sha256,
          description: "SHA-256 hash (recommended)",
        },
        {
          label: "SHA-1",
          value: sha1,
          description: "SHA-1 hash (deprecated)",
        },
        {
          label: "SHA-384",
          value: sha384,
          description: "SHA-384 hash",
        },
        {
          label: "SHA-512",
          value: sha512,
          description: "SHA-512 hash",
        },
      ]);
    });
  }, [inputText]);

  const clearInput = () => {
    setInputText("");
    setEncodeOutputs([]);
    setDecodeOutputs([]);
    setHashOutputs([]);
  };

  const renderOutputs = (outputs: OutputResult[], category: string) => {
    if (outputs.length === 0) {
      return (
        <Card className="h-full flex items-center justify-center p-8">
          <p className="text-muted-foreground text-center">
            Enter text in the input field to see {category.toLowerCase()} results
          </p>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {outputs.map((output, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-sm">{output.label}</h4>
                {output.description && (
                  <p className="text-xs text-muted-foreground">
                    {output.description}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="group"
                onClick={() => copy(output.value, `${category}-${index}`, output.label)}
              >
                <span className="transition-transform group-hover:scale-125">
                  {isCopied(`${category}-${index}`) ? (
                    <IconCheck className="size-4" />
                  ) : (
                    <IconCopy className="size-4" />
                  )}
                </span>
              </Button>
            </div>
            <pre className="text-sm font-mono bg-muted p-2 rounded overflow-x-auto break-all whitespace-pre-wrap">
              {output.value}
            </pre>
          </Card>
        ))}
      </div>
    );
  };

  const charCount = inputText.length;
  const byteCount = new Blob([inputText]).size;

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Input Section */}
      <div className="w-full lg:w-2/5 flex flex-col min-h-[200px] lg:min-h-0">
        <Card className="flex-1 flex flex-col p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Input</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {charCount} chars · {byteCount} bytes
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearInput}
                disabled={!inputText}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          </div>
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to encode/decode..."
            className="flex-1 resize-none font-mono text-sm"
          />
        </Card>
      </div>

      {/* Outputs Section with Tabs */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="encode" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="encode" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Encode ({encodeOutputs.length})</span>
              <span className="sm:hidden">Encode</span>
            </TabsTrigger>
            <TabsTrigger value="decode" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Decode ({decodeOutputs.length})</span>
              <span className="sm:hidden">Decode</span>
            </TabsTrigger>
            <TabsTrigger value="hash" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Hash ({hashOutputs.length})</span>
              <span className="sm:hidden">Hash</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="encode" className="flex-1 overflow-y-auto mt-4">
            {renderOutputs(encodeOutputs, "encode")}
          </TabsContent>

          <TabsContent value="decode" className="flex-1 overflow-y-auto mt-4">
            {renderOutputs(decodeOutputs, "decode")}
          </TabsContent>

          <TabsContent value="hash" className="flex-1 overflow-y-auto mt-4">
            {renderOutputs(hashOutputs, "hash")}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
