"use client";

import { pdfjs, Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfViewer({
  file,
  page = 1,
}: {
  file: string | File | ArrayBuffer;
  page?: number;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-border bg-card p-3">
      <Document file={file} loading="Carregando PDF...">
        <Page pageNumber={page} width={720} />
      </Document>
    </div>
  );
}
