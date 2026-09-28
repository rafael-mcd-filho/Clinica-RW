import { richTextToHtml } from "@/lib/clinical/rich-text-format";
import { cn } from "@/lib/utils";

/**
 * Estilo do texto formatado (negrito, itálico e listas), igual no editor e na
 * leitura. O projeto não usa o plugin de tipografia (`prose`), e o reset do
 * Tailwind tira marcador e recuo das listas, então os estilos ficam explícitos.
 */
export const richTextContentClassName =
  "[&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5 [&_li>p]:my-0 [&_li::marker]:text-muted-foreground [&_strong]:font-semibold";

/**
 * Mostra, formatado, o texto salvo pelo editor (`**negrito**`, `- item`...).
 * Sem isso a leitura exibia as marcações cruas. Texto puro antigo continua
 * aparecendo como parágrafos.
 */
export function RichTextView({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <div
      className={cn(richTextContentClassName, className)}
      // richTextToHtml escapa o texto antes de montar as tags: só p, br,
      // strong, em, ul, ol e li chegam ao HTML.
      dangerouslySetInnerHTML={{ __html: richTextToHtml(value) }}
    />
  );
}
