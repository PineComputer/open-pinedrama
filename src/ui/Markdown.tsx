// The text the agent returns (bibles, breakdowns, a screenplay rewrite's review), set as a document
// by react-markdown (CommonMark, with GitHub's tables through remark-gfm). It renders no HTML from
// the text, so nothing in it can run. A link, or a backquoted path, opens only a file the studio
// saved (`links`, by its path in the session); any other target is shown, not followed. Headings
// step down one level under the screen's own. Very long text is cut short, with a note.
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const LIMIT = 200_000;

/** anchor: the id a link elsewhere scrolls to and focuses (openInAgent.tsx), so the text takes focus without a tab stop. */
export function Markdown({ text, links, className = "document", anchor }: { text: string; links?: Map<string, string>; className?: string; anchor?: string }) {
  const cut = text.length > LIMIT;
  const saved = (target: string | undefined) => (target ? links?.get(target.replace(/^\.\//, "")) : undefined);
  const components: Components = {
    h1: "h2",
    h2: "h3",
    h3: "h4",
    a: ({ href, children }) => {
      const url = saved(href);
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="link">
          {children}
        </a>
      ) : (
        <span className="named" title={href}>
          {children}
        </span>
      );
    },
    code: ({ children, className: language }) => {
      const url = !language && typeof children === "string" ? saved(children) : undefined;
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="link">
          <code>{children}</code>
        </a>
      ) : (
        <code>{children}</code>
      );
    },
    // A fenced block keeps its lines as written, in monospace, as a rewrite's line table needs.
    pre: ({ children }) => <pre className="fenced">{children}</pre>,
  };
  return (
    <div className={className} {...(anchor ? { id: anchor, tabIndex: -1 } : {})}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {cut ? text.slice(0, LIMIT) : text}
      </ReactMarkdown>
      {cut && <p className="quiet">…</p>}
    </div>
  );
}
