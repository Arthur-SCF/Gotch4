import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="bg-muted/50 p-6 rounded-lg border border-border/50">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings with softer burgundy/rose tones
          h1: ({ node, ...props }) => (
            <h1
              className="text-3xl font-bold mt-6 mb-4 bg-gradient-to-r from-rose-700/90 to-red-800/80 dark:from-rose-500/80 dark:to-red-600/70 bg-clip-text text-transparent"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-2xl font-bold mt-5 mb-3 text-rose-700/90 dark:text-rose-400/80"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-xl font-semibold mt-4 mb-2 text-rose-600/80 dark:text-rose-300/70"
              {...props}
            />
          ),
          h4: ({ node, ...props }) => (
            <h4
              className="text-lg font-semibold mt-3 mb-2 text-rose-500/70 dark:text-rose-300/60"
              {...props}
            />
          ),
          h5: ({ node, ...props }) => (
            <h5
              className="text-base font-semibold mt-2 mb-1 text-rose-500/60 dark:text-rose-300/50"
              {...props}
            />
          ),
          h6: ({ node, ...props }) => (
            <h6
              className="text-sm font-semibold mt-2 mb-1 text-muted-foreground/80"
              {...props}
            />
          ),

          // Paragraphs
          p: ({ node, ...props }) => (
            <p className="mb-4 leading-7 text-foreground" {...props} />
          ),

          // Lists with better styling
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-2" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-foreground leading-7" {...props} />
          ),

          // Inline code with accent
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            let language = match ? match[1] : "";

            // Map security-specific language aliases to supported ones
            const languageMap: Record<string, string> = {
              'burp': 'http',
              'shell': 'bash',
            };

            language = languageMap[language] || language;

            return !inline && language ? (
              <div className="my-4 rounded-lg overflow-hidden border border-border shadow-lg">
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black px-4 py-2 flex items-center justify-between border-b border-gray-700">
                  <span className="text-xs text-gray-300 font-mono uppercase tracking-wider">
                    {match ? match[1] : 'code'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Bug Bounty PoC
                  </span>
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  className="!mt-0 !mb-0 !bg-gray-950"
                  showLineNumbers
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code
                className="bg-rose-50/50 dark:bg-rose-950/20 text-rose-800/90 dark:text-rose-200/80 px-1.5 py-0.5 rounded text-sm font-mono border border-rose-200/40 dark:border-rose-900/30"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Pre blocks (for code without language)
          pre: ({ children }) => {
            return (
              <div className="my-4 rounded-lg overflow-hidden border border-border">
                <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm font-mono">
                  {children}
                </pre>
              </div>
            );
          },

          // Links with hover effect (softer rose)
          a: ({ node, ...props }) => (
            <a
              className="text-rose-600/90 dark:text-rose-400/80 hover:text-rose-700 dark:hover:text-rose-300 underline underline-offset-2 font-medium transition-colors duration-200"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),

          // Blockquotes with left border (softer rose)
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-rose-500/40 dark:border-rose-500/30 pl-4 py-2 my-4 italic text-muted-foreground bg-rose-50/30 dark:bg-rose-950/10 rounded-r"
              {...props}
            />
          ),

          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="my-6 border-t-2 border-border" {...props} />
          ),

          // Tables with styling
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table
                className="min-w-full border-collapse border border-border rounded-lg overflow-hidden"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-rose-100/50 dark:bg-rose-950/20" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-border" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-muted/50 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-border px-4 py-2 text-left font-semibold text-foreground"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="border border-border px-4 py-2 text-foreground"
              {...props}
            />
          ),

          // Task lists (softer accent)
          input: ({ node, ...props }) => {
            if ((props as any).type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  disabled
                  className="mr-2 accent-rose-600/70"
                  {...props}
                />
              );
            }
            return <input {...props} />;
          },

          // Strong and emphasis
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-foreground" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-foreground" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
