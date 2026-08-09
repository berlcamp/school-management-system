"use client";

/**
 * Browser-side file → pixels, for the scan panel.
 *
 * Kept apart from `decode.ts` on purpose: the decoder is pure and testable in
 * node, and everything that needs a DOM lives here. A scanner that emits one
 * multi-page PDF for a whole class is the common case in a school, so a file
 * expands to *pages*, not to a single image.
 *
 * Pages are rasterised at a fixed target width rather than the file's native
 * resolution — the decoder downsamples anything larger anyway, and a 600 DPI
 * A4 scan is 35 megapixels of nothing useful.
 */

import type { RgbaImage } from "./decode";

/** Target raster width in pixels: ~170 DPI across A4, comfortably enough. */
const TARGET_WIDTH = 1400;

export interface LoadedPage {
  /** Human label for the review list, e.g. "class-scan.pdf — page 3". */
  label: string;
  image: RgbaImage;
}

export class UnsupportedFileError extends Error {}

/** Rasterise one uploaded file into one page per sheet it contains. */
export async function fileToPages(file: File): Promise<LoadedPage[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return pdfToPages(file);
  }
  if (file.type.startsWith("image/")) {
    return [{ label: file.name, image: await imageFileToImageData(file) }];
  }
  throw new UnsupportedFileError(
    `${file.name} is neither an image nor a PDF. Upload a scan or a photo of the answer sheets.`,
  );
}

async function imageFileToImageData(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not open a canvas.");

    // White underlay: a transparent PNG would otherwise read as solid black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

async function pdfToPages(file: File): Promise<LoadedPage[]> {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pages: LoadedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("This browser could not open a canvas.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      pages.push({
        label:
          doc.numPages > 1 ? `${file.name} — page ${pageNumber}` : file.name,
        image: context.getImageData(0, 0, canvas.width, canvas.height),
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return pages;
}

type PdfJsModule = typeof import("pdfjs-dist");
let pdfJsPromise: Promise<PdfJsModule> | null = null;

/**
 * Load pdf.js lazily and point it at its worker.
 *
 * Lazy because it is a large library that only a PDF upload needs — an image
 * upload should not pay for it. If the worker cannot be resolved by the bundler
 * the failure is turned into an instruction the teacher can act on, rather than
 * an unhandled rejection that leaves the upload spinning.
 */
function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
      } catch {
        throw new UnsupportedFileError(
          "PDF support could not start in this browser. Save the scan as JPEG or PNG images and upload those instead.",
        );
      }
      return pdfjs;
    })();
  }
  return pdfJsPromise;
}
