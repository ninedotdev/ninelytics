
import { useEffect, useId, useState } from "react";
import { codeToHtml } from "shiki";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language = "html", className }: CodeBlockProps) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    codeToHtml(code.trim(), {
      lang: language,
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
    }).then(setHtml);
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        #cb-${id} { background: #f6f8fa; }
        .dark #cb-${id} { background: #0d1117; }
        #cb-${id} .shiki,
        #cb-${id} pre { background: transparent !important; margin: 0; padding: 1rem; }
        #cb-${id} .shiki span { color: var(--shiki-light); }
        .dark #cb-${id} .shiki span { color: var(--shiki-dark); }
      `}} />
      <div
        id={`cb-${id}`}
        className={cn("relative group rounded-lg border overflow-hidden", className)}
      >
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-2 right-2 z-10 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
          onClick={handleCopy}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </Button>
        {html ? (
          <div
            className="text-sm overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="p-4 text-sm overflow-x-auto text-foreground">
            <code>{code.trim()}</code>
          </pre>
        )}
      </div>
    </>
  );
}
