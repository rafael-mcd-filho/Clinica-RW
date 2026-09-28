"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function DocumentPreviewPages({
  file,
  count,
  paperSize,
}: {
  file: string;
  count: number;
  paperSize: "A4" | "LETTER";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="mx-auto w-full max-w-[38rem]">
      <Document
        file={file}
        loading={
          <p className="text-caption text-muted-foreground">
            Carregando PDF...
          </p>
        }
        error={
          <p role="alert" className="text-body-sm text-destructive">
            Não foi possível exibir as páginas. Use “Ampliar PDF” para conferir
            o arquivo.
          </p>
        }
      >
        <ol className="grid gap-5">
          {Array.from({ length: count }, (_, index) => (
            <li key={`${file}-${index}`}>
              <p className="mb-2 text-center text-caption font-medium text-muted-foreground">
                {index ? "Quebra de página · " : ""}Página {index + 1} de{" "}
                {count}
              </p>
              <PreviewPage
                number={index + 1}
                width={width}
                paperSize={paperSize}
              />
            </li>
          ))}
        </ol>
      </Document>
    </div>
  );
}

function PreviewPage({
  number,
  width,
  paperSize,
}: {
  number: number;
  width: number;
  paperSize: "A4" | "LETTER";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(number === 1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="bg-white shadow-md"
      style={{
        width,
        aspectRatio: paperSize === "LETTER" ? "612 / 792" : "595.28 / 841.89",
      }}
    >
      {visible ? (
        <Page
          pageNumber={number}
          width={width}
          renderTextLayer
          renderAnnotationLayer={false}
          loading={
            <p className="p-4 text-caption text-slate-600">
              Renderizando página {number}...
            </p>
          }
        />
      ) : null}
    </div>
  );
}
