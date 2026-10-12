
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";

function cleanAssistantGreeting(text) {
  if (typeof text !== "string") return "";

  // Remove the repeated greeting from old saved answers too.
  return text
    .replace(
      /^\s*Hello!\s*I'm Knowra,\s*your academic study assistant\.?\s*/i,
      ""
    )
    .trim();
}

export default function MarkdownMessage({ text, role }) {
  const content =
    role === "assistant" ? cleanAssistantGreeting(text) : text || "";

  return (
    <div className={`knowra-markdown ${role === "user" ? "knowra-markdown-user" : "knowra-markdown-ai"}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
