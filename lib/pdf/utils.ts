/**
 * Shared PDF/print utilities for DepEd school forms.
 * Uses HTML-to-print via iframe (browser print dialog).
 */

export function printHTMLContent(htmlContent: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  let isCleanedUp = false;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  let afterPrintHandler: (() => void) | null = null;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    try {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }

      if (afterPrintHandler && iframe.contentWindow) {
        try {
          iframe.contentWindow.removeEventListener(
            "afterprint",
            afterPrintHandler,
          );
        } catch (e) {
          // Ignore errors when removing listener
        }
      }

      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch (error) {
      console.warn("Error cleaning up iframe:", error);
    }
  };

  const printIframe = () => {
    if (isCleanedUp) return;

    try {
      if (!iframe.contentWindow || !iframe.parentNode) {
        cleanup();
        return;
      }

      cleanupTimeout = setTimeout(() => {
        cleanup();
      }, 5000);

      afterPrintHandler = () => {
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        cleanup();
      };

      try {
        iframe.contentWindow.addEventListener("afterprint", afterPrintHandler, {
          once: true,
        });
        iframe.contentWindow.print();
      } catch (error) {
        console.error("Error setting up print listener:", error);
        cleanup();
      }
    } catch (error) {
      console.error("Error printing:", error);
      cleanup();
    }
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    try {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      iframe.onload = () => {
        setTimeout(() => {
          if (
            !hasPrinted &&
            !isCleanedUp &&
            iframe.contentWindow &&
            iframe.parentNode
          ) {
            hasPrinted = true;
            printIframe();
          }
        }, 250);
      };

      setTimeout(() => {
        if (
          !hasPrinted &&
          !isCleanedUp &&
          iframe.parentNode &&
          iframe.contentWindow
        ) {
          hasPrinted = true;
          printIframe();
        }
      }, 1000);
    } catch (error) {
      console.error("Error writing to iframe:", error);
      cleanup();
    }
  } else {
    cleanup();
  }
}

/** Shared DepEd header HTML for school forms */
export const DEPED_HEADER_HTML = `
<div class="deped-header">
  <div class="header-row">
    <span class="header-left">Republic of the Philippines</span>
    <span class="header-center">
      <div class="school-name">Department of Education</div>
    </span>
    <span class="header-right"></span>
  </div>
</div>
`;

/** DepEd logo paths for printables - Left: deped_logo_1.png, Right: deped_logo_2.png */
export const DEPED_LOGO_LEFT = "/deped_logo_1.png";
export const DEPED_LOGO_RIGHT = "/deped_logo_2.png";

/** CSS for DepEd header with logos (left and right). Include in printable style blocks. */
export const DEPED_HEADER_LOGOS_STYLES = `
.deped-header-with-logos {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 15px;
  border-bottom: 2px solid #000;
  padding-bottom: 8px;
}
.deped-logo-left-wrap,
.deped-logo-right-wrap {
  flex-shrink: 0;
  width: 90px;
}
.deped-logo-img {
  width: 90px;
  height: 90px;
  object-fit: contain;
}
.deped-header-center {
  flex: 1;
  text-align: center;
  min-width: 0;
}
`;

/** Wraps center content with DepEd logos on left and right. Use for all printables. */
export function buildDepEdHeaderWithLogos(centerContent: string): string {
  return `<div class="deped-header-with-logos">
  <div class="deped-logo-left-wrap"><img src="${DEPED_LOGO_LEFT}" alt="DepEd" class="deped-logo-img" onerror="this.style.display='none'"></div>
  <div class="deped-header-center">${centerContent}</div>
  <div class="deped-logo-right-wrap"><img src="${DEPED_LOGO_RIGHT}" alt="DepEd" class="deped-logo-img" onerror="this.style.display='none'"></div>
</div>`;
}

/** Shared base styles for DepEd forms */
export const DEPED_BASE_STYLES = `
@page {
  size: 8.5in 13in;
  margin-top: 0.5in;
  margin-bottom: 0.5in;
  margin-left: 0.75in;
  margin-right: 0.75in;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.4;
  color: #000;
  background: #fff;
}
.header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
.school-name { font-size: 14pt; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; }
.school-address { font-size: 10pt; margin-bottom: 3px; }
.form-title { font-size: 12pt; font-weight: bold; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
.info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
.info-table td { padding: 6px; border: 1px solid #000; font-size: 10pt; }
.info-label { font-weight: bold; width: 25%; background-color: #f0f0f0; }
.text-center { text-align: center; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;
