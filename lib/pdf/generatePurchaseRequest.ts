import { PurchaseOrder } from "@/types";

interface GeneratePurchaseRequestParams {
  purchaseOrder: PurchaseOrder;
}

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  if (num === 0) return "zero";
  if (num < 20) return ones[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return tens[ten] + (one > 0 ? " " + ones[one] : "");
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return (
      ones[hundred] +
      " hundred" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1000000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    return (
      numberToWords(thousand) +
      " thousand" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1000000000) {
    const million = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    return (
      numberToWords(million) +
      " million" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  return "";
}

// Helper function to format amount in words
function formatAmountInWords(amount: number): string {
  const wholePart = Math.floor(amount);
  const decimalPart = Math.round((amount - wholePart) * 100);

  let words = numberToWords(wholePart).toUpperCase();

  if (decimalPart > 0) {
    words += ` & ${decimalPart}/100`;
  }

  return words;
}

// Helper function to calculate total amount
function calculateTotalAmount(lots: PurchaseOrder["lots"]): number {
  if (!lots || lots.length === 0) return 0;
  return lots.reduce((total, lot) => {
    const lotTotal = lot.items.reduce((itemTotal, item) => {
      return itemTotal + (item.total_amount || 0);
    }, 0);
    return total + lotTotal;
  }, 0);
}

// Get environment variables for City Mayor and Budget Officer
const getCityMayorName = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_CITY_MAYOR_NAME || "SAM NORMAN G. FUENTES";
  }
  return process.env.CITY_MAYOR_NAME || "SAM NORMAN G. FUENTES";
};

const getCityMayorPosition = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_CITY_MAYOR_POSITION || "City Mayor";
  }
  return process.env.CITY_MAYOR_POSITION || "City Mayor";
};

const getBudgetOfficerName = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BUDGET_OFFICER_NAME || "";
  }
  return process.env.BUDGET_OFFICER_NAME || "";
};

const getBudgetOfficerPosition = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_BUDGET_OFFICER_POSITION || "Budget Officer";
  }
  return process.env.BUDGET_OFFICER_POSITION || "Budget Officer";
};

// Common header HTML
const getCommonHeader = () => {
  return `
    <div class="header">
      <div class="header-logos">
        <div class="header-logo-left">
          <img src="/ozamiz_medical.png" alt="Logo 1" onerror="this.style.display='none'">
          <img src="/ozamiz_medical.png" alt="Logo 2" onerror="this.style.display='none'">
        </div>
        <div class="header-logo-right">
          <img src="/ozamiz_medical.png" alt="Logo 3" onerror="this.style.display='none'">
          <img src="/ozamiz_medical.png" alt="Logo 4" onerror="this.style.display='none'">
        </div>
      </div>
      <div class="header-text">
        <div class="header-line">REPUBLIC OF THE PHILIPPINES</div>
        <div class="header-line">OFFICE OF THE CITY MAYOR</div>
        <div class="header-line">CITY OF OZAMIZ</div>
        <div class="header-line">TELEFAX NO. (088) 521 - 1390</div>
        <div class="header-line">MOBILE NO. (0917) 777 - 6100</div>
        <div class="header-line">EMAIL: ASENSOOZAMIZMAYOR@GMAIL.COM</div>
      </div>
    </div>
  `;
};

// Common CSS styles
const getCommonStyles = () => {
  return `
    @page {
      size: 8.5in 13in;
      margin-top: 0.3in;
      margin-bottom: 0.3in;
      margin-left: 0.5in;
      margin-right: 0.5in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.2;
      color: #000;
      background: #fff;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .header-center {
      text-align: center;
      flex: 1;
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .logo {
      width: 80px;
      height: 80px;
    }
    
    .header-title {
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .header-subtitle {
      font-size: 12pt;
      font-weight: bold;
      color: #1e3a8a;
    }
    
    .header-info {
      font-size: 10pt;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      margin-top: 5px;
    }
    
    table th,
    table td {
      border: 1px solid #000;
      padding: 4px;
      vertical-align: top;
    }
    
    table th {
      background-color: #e5e7eb;
      font-weight: bold;
      text-align: center;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .text-bold {
      font-weight: bold;
    }
    
    .signature-section {
      margin-top: 30px;
      font-size: 11pt;
    }
    
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
    }
    
    .signature-box {
      width: 30%;
      text-align: center;
    }
    
    .signature-line {
      border-bottom: 1px solid #000;
      margin-top: 40px;
      margin-bottom: 3px;
    }
    
    .signature-name {
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .signature-title {
      font-size: 10pt;
      font-style: italic;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  `;
};

// Helper function to safely print HTML content in an iframe
function printHTMLContent(htmlContent: string): void {
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
  let cleanupTimeout: NodeJS.Timeout | null = null;
  let afterPrintHandler: (() => void) | null = null;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    try {
      // Clear timeout if it exists
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }

      // Remove event listener before cleanup
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

      // Remove iframe from DOM
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch (error) {
      // Ignore cleanup errors
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

      // Fallback cleanup timeout in case afterprint doesn't fire
      cleanupTimeout = setTimeout(() => {
        cleanup();
      }, 5000);

      // Create handler function
      afterPrintHandler = () => {
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        cleanup();
      };

      // Listen for afterprint event to clean up immediately
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

      // Fallback in case onload doesn't fire
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

export function generatePRPrint({
  purchaseOrder,
}: GeneratePurchaseRequestParams): void {
  const formattedDate = purchaseOrder.date
    ? new Date(purchaseOrder.date).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    : "";

  const totalAmount = calculateTotalAmount(purchaseOrder.lots);
  const amountFormatted = totalAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Generate lots table rows
  let lotsTableRows = "";

  purchaseOrder.lots.forEach((lot) => {
    // Add lot header rows
    lotsTableRows += `
      <tr>
      <td class="text-center"></td>
      <td class="text-center"></td>
      <td class="text-center">${lot.lot_number || ""}<br>${lot.description || ""}</td>
      <td class="text-center"></td>
      <td class="text-center"></td>
      <td class="text-center"></td>
      </tr>
    `;

    // Add items
    lot.items.forEach((item) => {
      lotsTableRows += `
        <tr>
          <td class="text-center">${item.quantity || ""}</td>
          <td class="text-center">${item.unit || ""}</td>
          <td>${item.description || ""}</td>
          <td class="text-center"></td>
          <td class="text-right">${(item.unit_price || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
          <td class="text-right">${(item.total_amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
        </tr>
      `;
    });
  });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Request - ${purchaseOrder.pr_number}</title>
  <style>
    ${getCommonStyles()}
  </style>
</head>
<body>
<table style="border: 1px solid #000;">
  <!-- Header Row -->
  <tr>
    <td colspan="6" style="border: none; padding: 10px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">PURCHASE REQUEST</div>
          <div style="font-size: 12pt; font-weight: bold;">LOCAL GOVERNMENT UNIT OF OZAMIZ CITY</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
    </td>
  </tr>

  <!-- Department/PR Info Rows -->
  <tr>
    <td style="width: 8.33%;"><strong>Department</strong></td>
    <td style="width: 16.67%;">${purchaseOrder.office_division || "OCM"}</td>
    <td style="width: 8.33%;"><strong>PR No.</strong></td>
    <td colspan="3" style="width: 16.67%;">${purchaseOrder.pr_number || ""}</td>
  </tr>
  <tr>
    <td><strong>Section</strong></td>
    <td></td>
    <td><strong>SAI No.</strong></td>
    <td colspan="3"></td>
  </tr>
  <tr>
    <td></td>
    <td></td>
    <td><strong>ALOBS No.</strong></td>
    <td colspan="3"></td>
  </tr>
  <tr>
    <td></td>
    <td></td>
    <td><strong>Date</strong></td>
    <td colspan="3">${formattedDate}</td>
  </tr>

  <!-- Items Table Header -->
  <tr>
    <th style="width: 8%;">Quantity</th>
    <th style="width: 8%;">Unit of<br>Issue</th>
    <th style="width: 40%;">Item Description</th>
    <th style="width: 10%;">Stock<br>No.</th>
    <th style="width: 12%;">Estimated Unit<br>Cost</th>
    <th style="width: 12%;">Estimated Cost</th>
  </tr>

  <!-- Items Rows -->
  ${lotsTableRows}
  
  <!-- Nothing Follows Row -->
  <tr>
    <td colspan="6" style="font-style: italic; text-align: center;">*NOTHING FOLLOWS*</td>
  </tr>
  
  <!-- Grand Total Row -->
  <tr>
    <td colspan="5" class="text-right"><strong>Grand-Total</strong></td>
    <td class="text-right"><strong>${amountFormatted}</strong></td>
  </tr>

  <!-- Purpose Row -->
  <tr>
    <td colspan="6" style="border: 1px solid #000; padding: 10px;padding-bottom: 30px;">
      <strong>PURPOSE: ${purchaseOrder.purpose || purchaseOrder.particulars || ""}</strong>
    </td>
  </tr>

  <!-- Signature Section -->
  <tr>
    <td style="width: 16.67%; text-align: center; vertical-align: middle;"></td>
    <td colspan="2" style="width: 33.33%; text-align: center;"><strong>Requested By</strong></td>
    <td colspan="3" style="width: 33.33%; text-align: center;"><strong>Approved By</strong></td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Signature</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;padding-bottom: 50px;">
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;padding-bottom: 50px;">
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Printed Name</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${purchaseOrder.requester_name}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${purchaseOrder.approver_name}</div>
    </td>
  </tr>
  <tr>
    <td></td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${purchaseOrder.requester_position}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${purchaseOrder.approver_position || getCityMayorPosition()}</div>
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Date</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
    </td>
  </tr>
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

export function generateOBRPrint({
  purchaseOrder,
}: GeneratePurchaseRequestParams): void {
  const totalAmount = calculateTotalAmount(purchaseOrder.lots);
  const amountFormatted = totalAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Build particulars text
  const particularsText =
    purchaseOrder.purpose || purchaseOrder.particulars || "";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Obligation Request - ${purchaseOrder.pr_number}</title>
  <style>
    ${getCommonStyles()}
  </style>
</head>
<body>
<table style="border: 1px solid #000;">
  <!-- Header Row -->
  <tr>
    <td colspan="5" style="border: none; padding: 10px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
          <div class="header-subtitle" style="color: #1e3a8a;">OFFICE OF THE CITY MAYOR</div>
          <div style="font-size: 10pt; font-weight: bold;">CITY OF OZAMIZ</div>
          <div class="header-info">TELEFAX NO. (088)521-1390</div>
          <div class="header-info">MOBILE NO. (0917) 777 6100</div>
          <div class="header-info">EMAIL: ASENSOOZAMIZMAYOR@GMAIL.COM</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
    </td>
  </tr>

  <!-- OBLIGATION REQUEST Title Row -->
  <tr>
    <th colspan="4" style="font-size: 11pt;">OBLIGATION REQUEST</th>
    <th style="width: 15%;">No.</th>
  </tr>

  <!-- Payee/Office Info Rows -->
  <tr>
    <td style="width: 20%; font-weight: bold;">Payee/Office</td>
    <td colspan="4"></td>
  </tr>
  <tr>
    <td style="font-weight: bold;">Office</td>
    <td colspan="4" style="font-weight: bold;">OFFICE OF THE CITY MAYOR</td>
  </tr>
  <tr>
    <td style="font-weight: bold;">Address</td>
    <td colspan="4" style="font-weight: bold;">Ozamiz City</td>
  </tr>

  <!-- Items Table Header -->
  <tr>
    <th style="width: 12%;">Responsibility<br>Center</th>
    <th style="width: 48%;">PARTICULARS</th>
    <th style="width: 8%;">F.P.P</th>
    <th style="width: 20%;">Account<br>Code</th>
    <th style="width: 12%;">Amount</th>
  </tr>

  <!-- Items Row -->
  <tr>
    <td style="height: 200px; vertical-align: top;"></td>
    <td style="vertical-align: top; padding: 10px; text-align: center;">
      <div style="margin-top: 20px; margin-bottom: 20px;">
        <strong>${particularsText}</strong>
      </div>
    </td>
    <td></td>
    <td></td>
    <td class="text-right" style="vertical-align: top; padding-top: 80px;">
      <strong>${amountFormatted}</strong>
    </td>
  </tr>

  <!-- Total Row -->
  <tr>
    <td colspan="4" class="text-right" style="font-weight: bold; padding-right: 10px;">TOTAL:</td>
    <td class="text-right"><strong>${amountFormatted}</strong></td>
  </tr>

  <!-- Certification Section -->
  <tr>
    <td colspan="2" style="width: 50%;">
      <div style="padding: 5px;">
        <strong>A. Certified</strong><br>
        <div style="margin-left: 10px; margin-top: 5px; font-size: 7pt;">
          <input type="checkbox" style="margin-right: 5px;">Charges to appropriation/allotment<br>
          necessary, lawful and under my direct<br>
          supervision<br><br>
          <input type="checkbox" style="margin-right: 5px;">Supporting documents valid, proper<br>
          and legal
        </div>
      </div>
    </td>
    <td colspan="3" style="width: 50%;">
      <div style="padding: 5px;">
        <strong>B. Certified</strong><br>
        <div style="margin-top: 40px; text-align: center; font-size: 8pt;">
          Existence of available appropriation
        </div>
      </div>
    </td>
  </tr>

  <!-- Signature Section -->
  <tr>
    <td style="width: 12%; text-align: center; vertical-align: middle;"></td>
    <td colspan="2" style="width: 24%; text-align: center;"><strong>Requested By</strong></td>
    <td colspan="2" style="width: 24%; text-align: center;"><strong>Approved By</strong></td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Signature</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;padding-bottom: 50px;">
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;padding-bottom: 50px;">
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Printed Name</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${getCityMayorName()}</div>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${getBudgetOfficerName() || "EVELYN T. OMILDA"}</div>
    </td>
  </tr>
  <tr>
    <td></td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${getCityMayorPosition()}</div>
      <div style="font-size: 7pt; margin-top: 5px;">Head, Requesting Office/Authorized Representative</div>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${getBudgetOfficerPosition()}</div>
      <div style="font-size: 7pt; margin-top: 5px;">Head, Budget Unit/Authorized Representative</div>
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Date</strong>
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
    </td>
    <td colspan="2" style="text-align: center; vertical-align: top;">
    </td>
  </tr>
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}

export function generateApproveBudgetPrint({
  purchaseOrder,
}: GeneratePurchaseRequestParams): void {
  const formattedDate = purchaseOrder.date
    ? new Date(purchaseOrder.date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const totalAmount = calculateTotalAmount(purchaseOrder.lots);
  const amountFormatted = totalAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Generate lots table rows
  let lotsTableRows = "";
  let itemNo = 1;

  purchaseOrder.lots.forEach((lot) => {
    // Add lot header rows
    lotsTableRows += `
      <tr>
        <td></td>
        <td>${lot.lot_number || ""}<br>${lot.description || ""}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td> 
        <td></td>
      </tr>
    `;

    // Add items
    lot.items.forEach((item) => {
      lotsTableRows += `
        <tr>
          <td class="text-center">${itemNo}</td>
          <td>${item.description || ""}</td>
          <td class="text-center">${item.quantity || ""}</td>
          <td class="text-center">${item.unit || ""}</td>
          <td class="text-right">${(item.unit_price || 0).toFixed(2)}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="text-right">${(item.unit_price || 0).toFixed(2)}</td>
          <td class="text-right">${(item.total_amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
        </tr>
      `;
      itemNo++;
    });
  });

  const landscapeStyles = `
    @page {
      size: 13in 8.5in landscape;
      margin-top: 0.3in;
      margin-bottom: 0.3in;
      margin-left: 0.5in;
      margin-right: 0.5in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.2;
      color: #000;
      background: #fff;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .header-center {
      text-align: center;
      flex: 1;
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .logo {
      width: 80px;
      height: 80px;
    }
    
    .header-title {
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .header-subtitle {
      font-size: 12pt;
      font-weight: bold;
      color: #1e3a8a;
    }
    
    .header-info {
      font-size: 10pt;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7pt;
      margin-top: 5px;
    }
    
    table th,
    table td {
      border: 1px solid #000;
      padding: 3px;
      vertical-align: top;
    }
    
    table th {
      background-color: #e5e7eb;
      font-weight: bold;
      text-align: center;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .text-bold {
      font-weight: bold;
    }
    
    .signature-name {
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .signature-title {
      font-size: 7pt;
      font-style: normal;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approved Budget for the Contract - ${purchaseOrder.pr_number}</title>
  <style>
    ${landscapeStyles}
  </style>
</head>
<body>
<table style="border: 1px solid #000;">
  <!-- Header Row -->
  <tr>
    <td colspan="12" style="border: none; padding: 10px;">
      <div class="header" style="margin-bottom: 0;">
        <div class="header-left">
          <img src="/logo1.png" alt="Bagong Pilipinas Logo" class="logo" onerror="this.style.display='none'">
          <img src="/logo2.png" alt="Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-center">
          <div class="header-title">REPUBLIC OF THE PHILIPPINES</div>
          <div class="header-subtitle" style="color: #1e3a8a;">OFFICE OF THE CITY MAYOR</div>
          <div style="font-size: 10pt; font-weight: bold;">CITY OF OZAMIZ</div>
          <div class="header-info">TELEFAX NO. (088)521-1390</div>
          <div class="header-info">MOBILE NO. (0917) 777 6100</div>
          <div class="header-info">EMAIL: ASENSOOZAMIZMAYOR@GMAIL.COM</div>
        </div>
        <div class="header-right">
          <img src="/logo3.png" alt="Asenso Misamis Occidental" class="logo" onerror="this.style.display='none'">
          <img src="/logo4.png" alt="Asenso Ozamiz Logo" class="logo" onerror="this.style.display='none'">
        </div>
      </div>
    </td>
  </tr>

  <!-- Form Info Rows -->
  <tr>
    <td colspan="6" style="border: none;"><strong>Name of the Procuring Entity</strong></td>
    <td colspan="2" style="border: none;"></td>
    <td colspan="2" style="border: none;"><strong>Date</strong></td>
    <td colspan="2" style="border: none;">${formattedDate}</td>
  </tr>
  <tr>
    <td colspan="12" style="border: none; height: 5px;"></td>
  </tr>
  <tr>
    <td colspan="6" style="border: none;"><strong>Standard Form Number: SF-GOOD-01</strong></td>
    <td colspan="6" style="border: none;"></td>
  </tr>
  <tr>
    <td colspan="6" style="border: none;"><strong>Revised on: May 24, 2004</strong></td>
    <td colspan="6" style="border: none;"></td>
  </tr>

  <!-- Title Row -->
  <tr>
    <th colspan="12" style="font-size: 10pt;">APPROVED BUDGET FOR THE CONTRACT</th>
  </tr>

  <!-- Stations/Length Rows -->
  <tr>
    <td style="font-weight: bold;">Stations:</td>
    <td colspan="11"></td>
  </tr>
  <tr>
    <td style="font-weight: bold;">Length:</td>
    <td colspan="11"></td>
  </tr>

  <!-- Table Header -->
  <tr>
    <th rowspan="2" style="width: 4%;">ITEM NO.</th>
    <th rowspan="2" style="width: 23%;">DESCRIPTION</th>
    <th rowspan="2" style="width: 5%;">QTY</th>
    <th rowspan="2" style="width: 5%;">UNIT</th>
    <th rowspan="2" style="width: 8%;">CURRENT<br>MARKET<br>PRICE</th>
    <th rowspan="2" style="width: 7%;">VAT, OTHER TAXES<br>AND/OR DUTIES<br>APPLICABLE</th>
    <th rowspan="2" style="width: 7%;">FREIGHT &<br>INSURANCE</th>
    <th rowspan="2" style="width: 7%;">OTHER<br>INDIRECT<br>COST</th>
    <th colspan="2" style="width: 14%;">OTHER COST FACTORS<br>(e.g., MARK-UP,<br>INFLATION, CURRENCY<br>VALUATION ADJUSTMENT)</th>
    <th rowspan="2" style="width: 9%;">UNIT COST</th>
    <th rowspan="2" style="width: 9%;">TOTAL COST</th>
  </tr>
  <tr>
    <th style="width: 7%;"></th>
    <th style="width: 7%;"></th>
  </tr>

  <!-- Items Rows -->
  ${lotsTableRows}

  <!-- Nothing Follows Row -->
  <tr>
    <td colspan="12" style="font-style: italic; text-align: center;">*NOTHING FOLLOWS*</td>
  </tr>

  <!-- Total Row -->
  <tr>
    <td colspan="10" style="border-right: none;"></td>
    <td class="text-right" style="border-left: none;"><strong>Php</strong></td>
    <td class="text-right"><strong>${amountFormatted}</strong></td>
  </tr>
  <tr>
    <td colspan="12" style="height: 50px;"></td>
  </tr>

  <!-- Signature Section -->
  <tr>
    <td style="width: 4%; text-align: center; vertical-align: middle;"></td>
    <td colspan="3" style="width: 25%; text-align: center;"><strong>PREPARED BY</strong></td>
    <td colspan="3" style="width: 25%; text-align: center;"><strong>RECOMMENDING APPROVAL</strong></td>
    <td colspan="5" style="width: 25%; text-align: center;"><strong>APPROVED BY</strong></td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Signature</strong>
    </td>
    <td colspan="3"</td>
    <td colspan="3"</td>
    <td colspan="5">
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Printed Name</strong>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${purchaseOrder.prepared_by_name || "RINO KARLO G. LIM"}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${getBudgetOfficerName() || "EVELYN T. OMILDA"}</div>
    </td>
    <td colspan="5" style="text-align: center; vertical-align: top;">
      <div class="signature-name">${getCityMayorName()}</div>
    </td>
  </tr>
  <tr>
    <td></td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${purchaseOrder.prepared_by_position || "EXECUTIVE ASSISTANT II"}</div>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${getBudgetOfficerPosition()}</div>
    </td>
    <td colspan="5" style="text-align: center; vertical-align: top;">
      <div class="signature-title">${getCityMayorPosition()}</div>
    </td>
  </tr>
  <tr>
    <td style="text-align: center; vertical-align: top;">
      <strong>Date</strong>
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
    </td>
    <td colspan="3" style="text-align: center; vertical-align: top;">
    </td>
    <td colspan="5" style="text-align: center; vertical-align: top;">
    </td>
  </tr>
</table>
</body>
</html>
  `.trim();

  printHTMLContent(htmlContent);
}
