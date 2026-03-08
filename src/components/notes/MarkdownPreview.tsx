import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MarkdownPreviewProps = {
  markdown: string
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  if (!markdown.trim()) {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-border bg-panel-muted px-6 py-10 text-sm text-muted-foreground">
        Start writing markdown to preview the published reading surface.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto border border-border bg-background px-5 py-5">
      <div className="markdown-preview prose-reset max-w-none text-sm leading-7 text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-4 text-3xl font-semibold tracking-tight">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-3 mt-8 text-2xl font-semibold tracking-tight">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-3 mt-6 text-xl font-semibold tracking-tight">{children}</h3>,
            p: ({ children }) => <p className="mb-4 text-muted-foreground">{children}</p>,
            ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6 text-muted-foreground">{children}</ul>,
            ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6 text-muted-foreground">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="mb-4 border-l-2 border-border pl-4 italic text-muted-foreground">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="border border-border bg-panel px-1.5 py-0.5 text-[12px] text-foreground">
                {children}
              </code>
            ),
            pre: ({ children }) => <pre className="mb-4 overflow-x-auto border border-border bg-panel">{children}</pre>,
            hr: () => <hr className="my-6 border-border" />,
            a: ({ href, children }) => (
              <a href={href} className="text-foreground underline underline-offset-4" target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            table: ({ children }) => <table className="mb-4 w-full border-collapse border border-border">{children}</table>,
            th: ({ children }) => <th className="border border-border bg-panel px-3 py-2 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2 text-muted-foreground">{children}</td>,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}