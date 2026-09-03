import React, { useState, useCallback } from "react";

// Static imports — deps are now installed via pnpm add. Fallback is defensive for runtime errors.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// fallback simple render (mirrors old App.tsx logic) when deps throw
function FallbackMarkdown({ text }: { text: string }) {
  const renderInline = (t: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const parts = t.split(/(`[^`]+`)/g);
    parts.forEach((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        out.push(
          <code
            key={i}
            style={{
              fontFamily: "var(--ds-font-family-code)",
              fontSize: "12px",
              background: "var(--dsw-alias-bg-layer-3)",
              padding: "1px 5px",
              borderRadius: "4px",
            }}
          >
            {part.slice(1, -1)}
          </code>,
        );
      } else {
        out.push(<React.Fragment key={i}>{part}</React.Fragment>);
      }
    });
    return out;
  };
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const body = block.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
          return (
            <div className="terminal" key={i} style={{ margin: "8px 0" }}>
              <pre>{body}</pre>
            </div>
          );
        }
        return (
          <span key={i} style={{ whiteSpace: "pre-wrap" }}>
            {renderInline(block)}
          </span>
        );
      })}
    </>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }, [text]);
  return (
    <button className="md-copy-btn" onClick={onCopy} aria-label="Copy code block" title="Copy code">
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

// react-markdown code component with Copy + language label
function CodeComponent(props: { inline?: boolean; className?: string; children?: React.ReactNode }) {
  const { inline, className, children } = props;
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1] ?? "";
  const codeText = String(children ?? "").replace(/\n$/, "");
  if (inline) {
    return (
      <code className={className} style={{ fontFamily: "var(--ds-font-family-code)", fontSize: "0.92em", background: "var(--dsw-alias-bg-layer-3)", padding: "1px 5px", borderRadius: "4px" }}>
        {children}
      </code>
    );
  }
  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span className="md-code-lang" aria-label={`language ${lang || "text"}`}>
          {lang || "text"}
        </span>
        <CopyButton text={codeText} />
      </div>
      <pre className="md-code-pre">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text, renderMath }: { text: string; renderMath?: boolean }) {
  const [depsFailed, setDepsFailed] = useState(false);
  if (!text) return null;
  if (depsFailed) return <FallbackMarkdown text={text} />;

  const remarkPlugins: unknown[] = [remarkGfm];
  const rehypePlugins: unknown[] = [rehypeHighlight as unknown];
  if (renderMath) {
    remarkPlugins.push(remarkMath as unknown);
    rehypePlugins.push(rehypeKatex as unknown);
  }

  try {
    return (
      <div className="md-root">
        <ReactMarkdown
          remarkPlugins={remarkPlugins as never}
          rehypePlugins={rehypePlugins as never}
          components={{
            code: CodeComponent as never,
            a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
              // eslint-disable-next-line jsx-a11y/anchor-has-content
              <a {...props} target={props.href?.startsWith("#") ? undefined : "_blank"} rel={props.href?.startsWith("#") ? undefined : "noreferrer noopener"} />
            ),
            table: (props: React.HTMLAttributes<HTMLTableElement>) => (
              <div className="md-table-wrap">
                <table {...props} />
              </div>
            ),
          }}
          // allow html? keep false for safety; GFM handles tables
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  } catch (e) {
    console.warn("[markdown] render failed, falling back", e);
    // Avoid infinite loop: next render uses fallback
    setDepsFailed(true);
    return <FallbackMarkdown text={text} />;
  }
}

export default Markdown;
