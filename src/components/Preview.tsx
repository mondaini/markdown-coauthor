import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Preview({ doc }: { doc: string }) {
  return (
    <article className="preview px-8 py-5 pb-[40vh] max-w-[72ch]">
      <Markdown remarkPlugins={[remarkGfm]}>{doc}</Markdown>
    </article>
  );
}
