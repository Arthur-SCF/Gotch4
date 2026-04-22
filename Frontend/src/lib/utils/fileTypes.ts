import {
  IconFileText,
  IconFileCode,
  IconPhoto,
  IconVideo,
  IconMusic,
  IconFileZip,
  IconFile,
  IconBrandHtml5,
  IconBrandCss3,
  IconBrandJavascript,
  IconBrandPython,
  IconJson,
} from "@tabler/icons-react";

export interface FileTypeInfo {
  icon: any;
  color: string;
  badge: string;
}

export const getFileTypeInfo = (filename: string, _mimetype?: string): FileTypeInfo => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  // Check by extension first
  const extensionMap: Record<string, FileTypeInfo> = {
    // Web
    html: { icon: IconBrandHtml5, color: "text-orange-500", badge: "HTML" },
    htm: { icon: IconBrandHtml5, color: "text-orange-500", badge: "HTML" },
    css: { icon: IconBrandCss3, color: "text-blue-500", badge: "CSS" },
    js: { icon: IconBrandJavascript, color: "text-yellow-500", badge: "JavaScript" },
    jsx: { icon: IconBrandJavascript, color: "text-yellow-500", badge: "JSX" },
    ts: { icon: IconFileCode, color: "text-blue-600", badge: "TypeScript" },
    tsx: { icon: IconFileCode, color: "text-blue-600", badge: "TSX" },
    json: { icon: IconJson, color: "text-gray-500", badge: "JSON" },
    xml: { icon: IconFileCode, color: "text-orange-400", badge: "XML" },

    // Programming
    py: { icon: IconBrandPython, color: "text-blue-400", badge: "Python" },
    java: { icon: IconFileCode, color: "text-red-500", badge: "Java" },
    c: { icon: IconFileCode, color: "text-gray-600", badge: "C" },
    cpp: { icon: IconFileCode, color: "text-blue-500", badge: "C++" },
    go: { icon: IconFileCode, color: "text-cyan-500", badge: "Go" },
    rs: { icon: IconFileCode, color: "text-orange-600", badge: "Rust" },
    php: { icon: IconFileCode, color: "text-purple-500", badge: "PHP" },
    rb: { icon: IconFileCode, color: "text-red-600", badge: "Ruby" },

    // Shell/Config
    sh: { icon: IconFileCode, color: "text-green-600", badge: "Shell" },
    bash: { icon: IconFileCode, color: "text-green-600", badge: "Bash" },
    yml: { icon: IconFileText, color: "text-red-400", badge: "YAML" },
    yaml: { icon: IconFileText, color: "text-red-400", badge: "YAML" },
    toml: { icon: IconFileText, color: "text-gray-500", badge: "TOML" },
    env: { icon: IconFileText, color: "text-yellow-600", badge: "ENV" },

    // Documents
    txt: { icon: IconFileText, color: "text-gray-600", badge: "Text" },
    md: { icon: IconFileText, color: "text-blue-400", badge: "Markdown" },
    pdf: { icon: IconFileText, color: "text-red-500", badge: "PDF" },
    doc: { icon: IconFileText, color: "text-blue-600", badge: "Word" },
    docx: { icon: IconFileText, color: "text-blue-600", badge: "Word" },

    // Images
    jpg: { icon: IconPhoto, color: "text-purple-500", badge: "JPEG" },
    jpeg: { icon: IconPhoto, color: "text-purple-500", badge: "JPEG" },
    png: { icon: IconPhoto, color: "text-green-500", badge: "PNG" },
    gif: { icon: IconPhoto, color: "text-pink-500", badge: "GIF" },
    svg: { icon: IconPhoto, color: "text-orange-500", badge: "SVG" },
    webp: { icon: IconPhoto, color: "text-blue-500", badge: "WebP" },

    // Video
    mp4: { icon: IconVideo, color: "text-red-500", badge: "MP4" },
    avi: { icon: IconVideo, color: "text-blue-500", badge: "AVI" },
    mov: { icon: IconVideo, color: "text-purple-500", badge: "MOV" },

    // Audio
    mp3: { icon: IconMusic, color: "text-green-500", badge: "MP3" },
    wav: { icon: IconMusic, color: "text-blue-500", badge: "WAV" },

    // Archives
    zip: { icon: IconFileZip, color: "text-yellow-600", badge: "ZIP" },
    tar: { icon: IconFileZip, color: "text-orange-600", badge: "TAR" },
    gz: { icon: IconFileZip, color: "text-orange-600", badge: "GZ" },
    rar: { icon: IconFileZip, color: "text-purple-600", badge: "RAR" },
  };

  return extensionMap[ext] || {
    icon: IconFile,
    color: "text-gray-500",
    badge: ext.toUpperCase() || "File",
  };
};

export const getFileCategory = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const categories: Record<string, string[]> = {
    "Code": ["html", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "go", "rs", "php", "rb", "sh", "bash"],
    "Documents": ["txt", "md", "pdf", "doc", "docx"],
    "Images": ["jpg", "jpeg", "png", "gif", "svg", "webp"],
    "Video": ["mp4", "avi", "mov"],
    "Audio": ["mp3", "wav"],
    "Archives": ["zip", "tar", "gz", "rar"],
    "Config": ["json", "xml", "yml", "yaml", "toml", "env"],
  };

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) return category;
  }

  return "Other";
};

export const canPreview = (filename: string): boolean => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const previewableExtensions = [
    "html", "htm", "css", "js", "jsx", "ts", "tsx", "json", "xml",
    "txt", "md", "py", "java", "c", "cpp", "go", "rs", "php", "rb",
    "sh", "bash", "yml", "yaml", "toml", "env"
  ];
  return previewableExtensions.includes(ext);
};

export const getLanguageForHighlight = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const languageMap: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    xml: "xml",
    py: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    go: "go",
    rs: "rust",
    php: "php",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
  };

  return languageMap[ext] || "text";
};
