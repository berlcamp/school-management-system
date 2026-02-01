import { MedicalAssistance } from "@/types";

interface GenerateGuaranteeLetterParams {
  medicalAssistance: MedicalAssistance & {
    hospitals?: {
      id: string;
      name: string;
      full_hospital_name?: string | null;
      hospital_director?: string | null;
      position?: string | null;
      address?: string | null;
      greeting_name?: string | null;
    } | null;
    patient_barangay?: {
      id: string;
      barangay: string;
      municipality: string;
    } | null;
  };
  dateApproved?: string;
  guaranteeNo?: number;
  guaranteeNoText?: string;
  note?: string;
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

// Helper function to get city code from municipality
function getCityCode(municipality: string | null | undefined): string {
  if (!municipality) return "OZC";

  const mun = municipality.toLowerCase();
  if (mun.includes("sinacaban")) return "SNCBN";
  if (mun.includes("tudela")) return "TDL";
  if (mun.includes("ozamiz")) return "OZC";
  if (mun.includes("don victoriano chiongbian")) return "DONVIC";
  if (mun.includes("oroquieta")) return "OROQ";
  if (mun.includes("clarin")) return "CLR";
  if (mun.includes("bonifacio")) return "BNFC";
  if (mun.includes("tangub")) return "TNGB";
  return "OZC";
}

export function generateGuaranteeLetterPrint({
  medicalAssistance,
  dateApproved,
}: GenerateGuaranteeLetterParams): void {
  // Generate guarantee number - use stored lgu_gl_no if available
  // LGU GL numbers are by hospital only, no municipality code
  const glNo = medicalAssistance.lgu_gl_no;
  const glNoPadded = String(glNo).padStart(5, "0");
  const currentYear = String(new Date().getFullYear()).slice(-2);
  const mun = getCityCode(medicalAssistance.patient_barangay?.municipality);
  const guaranteeNumber = `${currentYear}-AO-FHP-${mun}-${glNoPadded}`;

  // Format date
  const formattedDate = dateApproved
    ? new Date(dateApproved).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Get hospital header data directly from database
  const hospitalData = medicalAssistance.hospitals;
  const hospitalHeader = hospitalData
    ? {
        director: hospitalData.hospital_director || "",
        position: hospitalData.position || "",
        hospitalName:
          hospitalData.full_hospital_name || hospitalData.name || "",
        address: hospitalData.address || "",
        greeting: hospitalData.greeting_name
          ? `Dear ${hospitalData.greeting_name},`
          : hospitalData.hospital_director
          ? `Dear ${hospitalData.hospital_director},`
          : "Dear Sir/Madam,",
      }
    : null;

  // Format patient age
  const ageValue =
    medicalAssistance.patient_age_value || medicalAssistance.patient_age || 0;
  const ageUnit = medicalAssistance.patient_age_unit || "years";
  let ageType: string = ageUnit;
  if (ageValue === 1) {
    ageType = ageUnit.replace(/s$/, "");
  }

  // Format amount
  const grantedAmount = medicalAssistance.lgu_amount || 0;
  const amountInWords = formatAmountInWords(grantedAmount);
  const amountFormatted = `₱${grantedAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const patientName = medicalAssistance.patient_fullname || "";
  const programName = "ASENSO OZAMIZ FREE HOSPITALIZATION PROGRAM";

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantee Letter - ${guaranteeNumber}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.2in;
      margin-left: 1in;
      margin-right: 1in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14px;
      line-height: 1.5;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 100px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
      margin-top: 0;
    }
    
    .header img {
      max-width: 90%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    .header-separator {
      color: #ff0000;
      text-align: center;
      font-size: 14px;
      letter-spacing: 2px;
      margin: 5px 0;
      font-weight: bold;
    }

    .guarantee-number {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 30px;
    }
    
    .date {
      margin-bottom: 30px;
    }
    
    .hospital-info {
      margin-bottom: 30px;
    }
    
    .hospital-info .director {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .hospital-info .position {
      margin-bottom: 0;
    }
    
    .hospital-info .hospital-name {
      margin-bottom: 0;
    }
    
    .hospital-info .address {
      margin-bottom: 0;
    }
    
    .greeting {
      margin-bottom: 30px;
      font-weight: bold;
    }
    
    .body-text {
      text-align: justify;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .body-text .bold {
      font-weight: bold;
    }
    .bold {
      font-weight: bold;
    }
    .paragraph {
      margin-bottom: 15px;
    }
    
    .signature-section {
      margin-top: 40px;
    }
    
    .signature-line {
      margin-bottom: 30px;
    }
    
    .signature-name {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .signature-title {
      margin-bottom: 0;
    }
    
    .note {
      font-size: 10pt;
      margin-top: 10px;
      font-style: italic;
    }
    
    .footer {
      position: fixed;
      bottom: 0;
      left: 1in;
      right: 1in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    .footer div {
      margin-bottom: 2px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <img src="/ozamiz_medical.png" alt="Ozamiz Medical Logo" onerror="this.style.display='none'">
      <div class="header-separator">================================================================</div>
    </div>
  
  <div class="guarantee-number">GUARANTEE NOTE - NO. ${guaranteeNumber}</div>
  
  <div class="date"><strong>Date:</strong> ${formattedDate}</div>
  
  ${
    hospitalHeader
      ? `
    <div class="hospital-info">
      <div class="director">${hospitalHeader.director}</div>
      <div class="position">${hospitalHeader.position}</div>
      <div class="hospital-name">${hospitalHeader.hospitalName}</div>
      <div class="address">${hospitalHeader.address}</div>
    </div>
    <div class="greeting">${hospitalHeader.greeting}</div>
  `
      : `
    <div class="hospital-info">
      <div class="director">--</div>
    </div>
  `
  }
  
  <div class="body-text">
    <span class="bold">${patientName.toUpperCase()}</span>, ${ageValue} ${ageType} old, sought help from the Office of the City Mayor for financial assistance for his/her unpaid medical bill. In consideration thereof, and in accordance with <span class="bold">${programName}</span> of the local government under the present administration, we hereby guarantee the payment of his/her medical bill in the amount of <span class="bold">${amountInWords} (${amountFormatted}) PESOS ONLY.</span>
  </div>
  
  <div class="paragraph">
    We undertake to pay the said amount after fifteen (15) days from receipt of written demand.
  </div>
  
  <div class="paragraph">
    All sums owing under this letter are payable in Philippine Peso.
  </div>

  
  <div class="signature-section">
    <div class="signature-line">
      <div>By the authority of:</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">SAM NORMAN G. FUENTES</div>
      <div class="signature-title">City Mayor</div>
    </div>
    
    <div class="signature-line">
      <div>Respectfully yours,</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">RINO KARLO G. LIM</div>
      <div class="signature-title">Executive Assistant IV</div>
    </div>
    
  </div>
  </div>
  
  <div class="footer">
    <div>This document is not valid unless it bears the official seal of the City Mayor. Any erasure, alteration or the like herein, renders the same invalid.</div>
  </div>
</body>
</html>
  `.trim();

  // Create a hidden iframe to print without replacing the current page
  if (typeof document !== "undefined") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          if (!hasPrinted && iframe.contentWindow) {
            hasPrinted = true;
            iframe.contentWindow.print();
            // Remove iframe after a delay to allow print dialog to open
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 250);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!hasPrinted && iframe.parentNode && iframe.contentWindow) {
          hasPrinted = true;
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 500);
    }
  }
}

export function generateGuaranteeLetterPrintMAIFIP({
  medicalAssistance,
  dateApproved,
}: GenerateGuaranteeLetterParams): void {
  // Generate guarantee number - use stored maifip_gl_no if available
  // MAIFIP GL numbers are by hospital only, no municipality code
  const glNo = medicalAssistance.maifip_gl_no;
  const glNoPadded = String(glNo).padStart(5, "0");
  const currentYear = String(new Date().getFullYear()).slice(-2);
  const guaranteeNumber = `${currentYear}-AO-MAIFIP-${glNoPadded}`;

  // Format date
  const formattedDate = dateApproved
    ? new Date(dateApproved).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Get hospital header data directly from database
  const hospitalData = medicalAssistance.hospitals;
  const hospitalHeader = hospitalData
    ? {
        director: hospitalData.hospital_director || "",
        position: hospitalData.position || "",
        hospitalName:
          hospitalData.full_hospital_name || hospitalData.name || "",
        address: hospitalData.address || "",
        greeting: hospitalData.greeting_name
          ? `Dear ${hospitalData.greeting_name},`
          : hospitalData.hospital_director
          ? `Dear ${hospitalData.hospital_director},`
          : "Dear Sir/Madam,",
      }
    : null;

  // Format patient age
  const ageValue =
    medicalAssistance.patient_age_value || medicalAssistance.patient_age || 0;
  const ageUnit = medicalAssistance.patient_age_unit || "years";
  let ageType: string = ageUnit;
  if (ageValue === 1) {
    ageType = ageUnit.replace(/s$/, "");
  }

  // Format amount - use maifip_amount instead of lgu_amount
  const grantedAmount = medicalAssistance.maifip_amount || 0;
  const amountInWords = formatAmountInWords(grantedAmount);
  const amountFormatted = `₱${grantedAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const patientName = medicalAssistance.patient_fullname || "";
  const programName = "ASENSO OZAMIZ FREE HOSPITALIZATION PROGRAM";

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantee Letter - ${guaranteeNumber}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.2in;
      margin-left: 1in;
      margin-right: 1in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      line-height: 1;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 100px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
      margin-top: 0;
    }
    
    .header img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    .header-separator {
      color: #ff0000;
      text-align: center;
      font-size: 14px;
      letter-spacing: 2px;
      margin: 5px 0;
      font-weight: bold;
    }
    
    
    .guarantee-number {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 30px;
    }
    
    .date {
      margin-bottom: 30px;
    }
    
    .hospital-info {
      margin-bottom: 30px;
    }
    
    .hospital-info .director {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .hospital-info .position {
      margin-bottom: 0;
    }
    
    .hospital-info .hospital-name {
      margin-bottom: 0;
    }
    
    .hospital-info .address {
      margin-bottom: 0;
    }
    
    .greeting {
      margin-bottom: 30px;
      font-weight: bold;
    }
    
    .body-text {
      text-align: justify;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .body-text .bold {
      font-weight: bold;
    }
    
    .paragraph {
      margin-bottom: 15px;
    }
    
    .signature-section {
      margin-top: 40px;
    }
    
    .signature-line {
      margin-bottom: 30px;
    }
    
    .signature-name {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .signature-title {
      margin-bottom: 0;
    }
    
    .note {
      font-size: 10pt;
      margin-top: 10px;
      font-style: italic;
    }
    
    .footer {
      position: fixed;
      bottom: 0;
      left: 1in;
      right: 1in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    .footer div {
      margin-bottom: 2px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <img src="/ozamiz_medical.png" alt="Ozamiz Medical Logo" onerror="this.style.display='none'">
      <div class="header-separator">================================================================</div>
    </div>
  
  <div class="guarantee-number">GUARANTEE NOTE - NO. ${guaranteeNumber}</div>
  
  <div class="date"><strong>Date:</strong> ${formattedDate}</div>
  
  ${
    hospitalHeader
      ? `
    <div class="hospital-info">
      <div class="director">${hospitalHeader.director}</div>
      <div class="position">${hospitalHeader.position}</div>
      <div class="hospital-name">${hospitalHeader.hospitalName}</div>
      <div class="address">${hospitalHeader.address}</div>
    </div>
    <div class="greeting">${hospitalHeader.greeting}</div>
  `
      : `
    <div class="hospital-info">
      <div class="director">--</div>
    </div>
  `
  }
  
  <div class="body-text">
    <span class="bold">${patientName.toUpperCase()}</span>, ${ageValue} ${ageType} old, sought help from the Office of the City Mayor for financial assistance for his/her unpaid medical bill. In consideration thereof, and in accordance with <span class="bold">${programName}</span> of the local government under the present administration, we hereby guarantee the payment of his/her medical bill in the amount of <span class="bold">${amountInWords} (${amountFormatted}) PESOS ONLY.</span>
  </div>
  
  <div class="body-text">
    We undertake to pay the said amount after fifteen (15) days from receipt of written demand.
  </div>
  
  <div class="body-text">
    Charged to the Medical Assistance to Indigent and Financially Incapacitated Patients (MAIFIP) Fund of the Office of Second District Rep. Sancho Fernando "ANDO" F. Oaminal.
  </div>
  
  <div class="body-text">
    All sums owing under this letter are payable in Philippine Peso.
  </div>

  
  <div class="signature-section">
    <div class="signature-line">
      <div>By the authority of:</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">SAM NORMAN G. FUENTES</div>
      <div class="signature-title">City Mayor</div>
    </div>
    
    <div class="signature-line">
      <div>Respectfully yours,</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">RINO KARLO G. LIM</div>
      <div class="signature-title">Executive Assistant IV</div>
    </div>
    

  </div>
  </div>
  
  <div class="footer">
    <div>This document is not valid unless it bears the official seal of the City Mayor. Any erasure, alteration or the like herein, renders the same invalid.</div>
  </div>
</body>
</html>
  `.trim();

  // Create a hidden iframe to print without replacing the current page
  if (typeof document !== "undefined") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          if (!hasPrinted && iframe.contentWindow) {
            hasPrinted = true;
            iframe.contentWindow.print();
            // Remove iframe after a delay to allow print dialog to open
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 250);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!hasPrinted && iframe.parentNode && iframe.contentWindow) {
          hasPrinted = true;
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 500);
    }
  }
}

export function generateGuaranteeLetterPrintMAIFIPHOR({
  medicalAssistance,
  dateApproved,
}: GenerateGuaranteeLetterParams): void {
  // Generate guarantee number - use stored maifip_gl_no if available
  const glNo = medicalAssistance.maifip_gl_no;
  const glNoPadded = String(glNo).padStart(5, "0");
  const currentYear = String(new Date().getFullYear()).slice(-2);

  // Determine hospital code based on hospital name
  const hospitalName = medicalAssistance.hospitals?.name || "";
  let hospitalCode = "-SFO-FHP-"; // default
  if (hospitalName.toLowerCase().includes("faith")) {
    hospitalCode = "-SFO-FGH-";
  } else if (
    hospitalName.toLowerCase().includes("st.joseph") ||
    hospitalName.toLowerCase().includes("st joseph")
  ) {
    hospitalCode = "-SFO-SJGH-";
  }

  const guaranteeNumber = `${currentYear}${hospitalCode}${glNoPadded}`;

  // Format date
  const formattedDate = dateApproved
    ? new Date(dateApproved).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Get hospital header data directly from database
  const hospitalData = medicalAssistance.hospitals;
  const hospitalHeader = hospitalData
    ? {
        director: hospitalData.hospital_director || "",
        position: hospitalData.position || "",
        hospitalName:
          hospitalData.full_hospital_name || hospitalData.name || "",
        address: hospitalData.address || "",
        greeting: hospitalData.greeting_name
          ? `Dear ${hospitalData.greeting_name},`
          : hospitalData.hospital_director
          ? `Dear ${hospitalData.hospital_director},`
          : "Dear Sir/Madam,",
      }
    : null;

  // Format amount - use maifip_amount instead of lgu_amount
  const grantedAmount = medicalAssistance.maifip_amount || 0;
  const amountInWords = formatAmountInWords(grantedAmount);
  const amountFormatted = `₱${grantedAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const patientName = medicalAssistance.patient_fullname || "";

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantee Letter - ${guaranteeNumber}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.2in;
      margin-left: 1in;
      margin-right: 1in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      line-height: 1;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 100px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      margin-top: 0;
    }
    
    .header img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    
    .sffo-header {
      font-weight: bold;
      margin-top: 40px;
      margin-bottom: 40px;
    }
    
    .grant-number {
      text-align: right;
      font-weight: bold;
      margin-bottom: 20px;
    }
    
    .date {
      margin-bottom: 20px;
    }
    
    .hospital-info {
      margin-bottom: 30px;
    }
    
    .hospital-info .director {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .hospital-info .position {
      margin-bottom: 0;
    }
    
    .hospital-info .hospital-name {
      margin-bottom: 0;
    }
    
    .hospital-info .address {
      margin-bottom: 0;
    }
    
    .greeting {
      margin-bottom: 30px;
    }
    
    .body-text {
      text-align: justify;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .body-text .bold {
      font-weight: bold;
    }
    .bold {
      font-weight: bold;
    }
    .paragraph {
      margin-bottom: 15px;
    }
    
    .signature-section {
      margin-top: 30px;
    }
    
    .signature-line {
      margin-bottom: 30px;
    }
    
    .signature-name {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .signature-title {
      margin-bottom: 0;
    }
    
    .note {
      font-size: 10pt;
      margin-top: 10px;
      font-style: italic;
    }
    
    .footer {
      position: fixed;
      bottom: 0;
      left: 1in;
      right: 1in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    .footer div {
      margin-bottom: 2px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <img src="/hor_medical.png" alt="HOR Medical Logo" onerror="this.style.display='none'">
    </div>
  
  <div class="sffo-header">
    <div>REP. SANCHO FERNANDO "ANDO" F. OAMINAL</div>
    <div>2nd District, Ozamiz City, Misamis Occidental</div>
    <div>20th Congress</div>
  </div>

  <div class="grant-number">GRANT NO. ${guaranteeNumber}</div>
  
  <div class="date"><strong>Date:</strong> ${formattedDate}</div>
  
  ${
    hospitalHeader
      ? `
    <div class="hospital-info">
      <div class="director">${hospitalHeader.director}</div>
      <div class="position">${hospitalHeader.position}</div>
      <div class="hospital-name">${hospitalHeader.hospitalName}</div>
      <div class="address">${hospitalHeader.address}</div>
    </div>
    <div class="greeting bold">${hospitalHeader.greeting}</div>
  `
      : `
    <div class="hospital-info">
      <div class="director">--</div>
    </div>
  `
  }
  
  <div class="body-text">
    We are pleased to inform you that after thorough evaluation and proactive coordination with our
national government agencies, we have secured the amount of <span class="bold">${amountInWords} PESOS (${amountFormatted})</span>,
to help <span class="bold">${patientName.toUpperCase()}</span>, settle his/her outstanding medical bills with your hospital.
</span>
  </div>
  
  <div class="body-text">
    In line with this, you are hereby advised to charge the said amounts owed to the Medical Assistance
to Indigent and Financially Incapacitated Patients Funds of this representation with your hospital.
  </div>
  
  <div class="body-text">
    This grant is made pursuant to this office's mandate in uplifting the quality of life of its constituents
through sincere and meaningful representation.
  </div>
  
  
  <div class="signature-section">
    <div class="signature-line">
      <div>By the authority of:</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">SANCHO FERNANDO "ANDO" F. OAMINAL</div>
      <div class="signature-title">2nd District Representative</div>
    </div>
    
    <div class="signature-line">
      <div>Respectfully yours,</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">MARY GRACE T. CODILLA</div>
      <div class="signature-title">Political Affairs Assistant II</div>
    </div>
    
 
  </div>
  </div>
  
  <div class="footer">
    
  </div>
</body>
</html>
  `.trim();

  // Create a hidden iframe to print without replacing the current page
  if (typeof document !== "undefined") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          if (!hasPrinted && iframe.contentWindow) {
            hasPrinted = true;
            iframe.contentWindow.print();
            // Remove iframe after a delay to allow print dialog to open
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 250);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!hasPrinted && iframe.parentNode && iframe.contentWindow) {
          hasPrinted = true;
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 500);
    }
  }
}

export function generateGuaranteeLetterPrintMAIFIPHORMhars({
  medicalAssistance,
  dateApproved,
}: GenerateGuaranteeLetterParams): void {
  // Generate guarantee number - use stored maifip_gl_no if available
  const glNo = medicalAssistance.maifip_gl_no;
  const glNoPadded = String(glNo).padStart(5, "0");
  const currentYear = String(new Date().getFullYear()).slice(-2);

  const hospitalCode = "-CAO-MHARS-"; // default

  const guaranteeNumber = `${currentYear}${hospitalCode}${glNoPadded}`;

  // Format date
  const formattedDate = dateApproved
    ? new Date(dateApproved).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Get hospital header data directly from database
  const hospitalData = medicalAssistance.hospitals;
  const hospitalHeader = hospitalData
    ? {
        director: hospitalData.hospital_director || "",
        position: hospitalData.position || "",
        hospitalName:
          hospitalData.full_hospital_name || hospitalData.name || "",
        address: hospitalData.address || "",
        greeting: hospitalData.greeting_name
          ? `Dear ${hospitalData.greeting_name},`
          : hospitalData.hospital_director
          ? `Dear ${hospitalData.hospital_director},`
          : "Dear Sir/Madam,",
      }
    : null;

  // Format amount - use maifip_amount instead of lgu_amount
  const grantedAmount = medicalAssistance.maifip_amount || 0;
  const amountInWords = formatAmountInWords(grantedAmount);
  const amountFormatted = `₱${grantedAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const patientName = medicalAssistance.patient_fullname || "";
  const patientAddress = `${
    medicalAssistance.patient_barangay?.barangay || ""
  }, ${medicalAssistance.patient_barangay?.municipality || ""}`;
  const diagnosis = medicalAssistance.diagnosis || "";
  const patientGender = medicalAssistance.patient_gender || "";
  const possessivePronoun = patientGender === "Male" ? "his" : "her";

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantee Letter - ${guaranteeNumber}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.2in;
      margin-left: 1in;
      margin-right: 1in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      line-height: 1;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 100px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      margin-top: 0;
    }
    
    .header img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    
    .sffo-header {
      font-weight: bold;
      margin-top: 40px;
      margin-bottom: 40px;
    }
    
    .endorsement-number {
      text-align: center;
      font-weight: bold;
      margin-bottom: 20px;
    }
    
    .date {
      margin-bottom: 20px;
    }
    
    .hospital-info {
      margin-bottom: 30px;
    }
    
    .hospital-info .director {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .hospital-info .position {
      margin-bottom: 0;
    }
    
    .hospital-info .hospital-name {
      margin-bottom: 0;
    }
    
    .hospital-info .address {
      margin-bottom: 0;
    }
    
    .greeting {
      margin-bottom: 30px;
    }
    
    .body-text {
      text-align: justify;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .body-text .bold {
      font-weight: bold;
    }
    .bold {
      font-weight: bold;
    }
    .paragraph {
      margin-bottom: 15px;
    }
    
    .signature-section {
      margin-top: 30px;
    }
    
    .signature-line {
      margin-bottom: 30px;
    }
    
    .signature-name {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .signature-title {
      margin-bottom: 0;
    }
    
    .note {
      font-size: 10pt;
      margin-top: 10px;
      font-style: italic;
    }
    
    .footer {
      position: fixed;
      bottom: 0;
      left: 1in;
      right: 1in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    .footer div {
      margin-bottom: 2px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <img src="/hor_medical.png" alt="HOR Medical Logo" onerror="this.style.display='none'">
    </div>
  
  <div class="sffo-header">
    <div>REP. SANCHO FERNANDO "ANDO" F. OAMINAL</div>
    <div>2nd District, Ozamiz City, Misamis Occidental</div>
    <div>20th Congress</div>
  </div>

  <div class="endorsement-number">ENDORSEMENT NO: ${guaranteeNumber}</div>
  
  <div class="date"><strong>Date:</strong> ${formattedDate}</div>
  
  ${
    hospitalHeader
      ? `
    <div class="hospital-info">
      <div class="director">${hospitalHeader.director}</div>
      <div class="position">${hospitalHeader.position}</div>
      <div class="hospital-name">${hospitalHeader.hospitalName}</div>
      <div class="address">${hospitalHeader.address}</div>
    </div>
    <div class="greeting bold">${hospitalHeader.greeting}</div>
  `
      : `
    <div class="hospital-info">
      <div class="director">--</div>
    </div>
  `
  }
  
  <div class="body-text">
    We would like to respectfully endorse to your good office the billing of <span class="bold">${patientName.toUpperCase()}</span>
  of ${patientAddress} in the amount of <span class="bold">${amountInWords} PESOS (${amountFormatted})</span> for zero Balance Billing<sup>1</sup>.
  </div>

  <div class="body-text">
  <span class="bold">${patientName.toUpperCase()}</span>, has been admitted to Mayor Hilarion A. Ramiro Sr. Medical Center 
    by reason of ${diagnosis}. As a consequence, ${possessivePronoun} family has incurred a large amount of Medical Bills way above what they can ill-afford.
  </div>
  
  <div class="body-text">
    Hence, we humbly exhort upon your benevolence to help us lighten the burden of our constituent in this very difficult time by according them the privilege of Zero Balance Billing.
  </div>
  
  <div class="body-text">
    We are sincerely anticipating your good office's accommodation of this endorsement.
  </div>
  <div class="body-text">
    Together let us move towards ASENSO SEGUNDO DISTRITO.
  </div>
  
  
  <div class="signature-section">
    <div class="signature-line">
      <div>By the authority of:</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">SANCHO FERNANDO "ANDO" F. OAMINAL</div>
      <div class="signature-title">2nd District Representative</div>
    </div>
    
    <div class="signature-line">
      <div>Respectfully yours,</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">MARY GRACE T. CODILLA</div>
      <div class="signature-title">Political Affairs Assistant II</div>
    </div>
    
 
  </div>
  </div>
  
  <div class="footer">
    <sup>1</sup>Quotation/Billing Statement dated December 09, 2025 attached herein as "Annex A"
  </div>
</body>
</html>
  `.trim();

  // Create a hidden iframe to print without replacing the current page
  if (typeof document !== "undefined") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          if (!hasPrinted && iframe.contentWindow) {
            hasPrinted = true;
            iframe.contentWindow.print();
            // Remove iframe after a delay to allow print dialog to open
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 250);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!hasPrinted && iframe.parentNode && iframe.contentWindow) {
          hasPrinted = true;
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 500);
    }
  }
}
export function generateGuaranteeLetterPrintDSWD({
  medicalAssistance,
  dateApproved,
}: GenerateGuaranteeLetterParams): void {
  // Generate guarantee number - use stored lgu_gl_no if available
  // LGU GL numbers are by hospital only, no municipality code
  const glNo = medicalAssistance.lgu_gl_no;
  const glNoPadded = String(glNo).padStart(5, "0");
  const currentYear = String(new Date().getFullYear()).slice(-2);
  const mun = getCityCode(medicalAssistance.patient_barangay?.municipality);
  const guaranteeNumber = `${currentYear}-AO-FHP-${mun}-${glNoPadded}`;

  // Format date
  const formattedDate = dateApproved
    ? new Date(dateApproved).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Get hospital header data directly from database
  const hospitalData = medicalAssistance.hospitals;
  const hospitalHeader = hospitalData
    ? {
        director: hospitalData.hospital_director || "",
        position: hospitalData.position || "",
        hospitalName:
          hospitalData.full_hospital_name || hospitalData.name || "",
        address: hospitalData.address || "",
        greeting: hospitalData.greeting_name
          ? `Dear ${hospitalData.greeting_name},`
          : hospitalData.hospital_director
          ? `Dear ${hospitalData.hospital_director},`
          : "Dear Sir/Madam,",
      }
    : null;

  // Format patient age
  const ageValue =
    medicalAssistance.patient_age_value || medicalAssistance.patient_age || 0;
  const ageUnit = medicalAssistance.patient_age_unit || "years";
  let ageType: string = ageUnit;
  if (ageValue === 1) {
    ageType = ageUnit.replace(/s$/, "");
  }

  // Format amount
  const grantedAmount = medicalAssistance.lgu_amount || 0;
  const amountInWords = formatAmountInWords(grantedAmount);
  const amountFormatted = `₱${grantedAmount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

  const patientName = medicalAssistance.patient_fullname || "";
  const programName = "ASENSO OZAMIZ FREE HOSPITALIZATION PROGRAM";

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantee Letter - ${guaranteeNumber}</title>
  <style>
    @page {
      size: 8.5in 13in;
      margin-top: 0.5in;
      margin-bottom: 0.2in;
      margin-left: 1in;
      margin-right: 1in;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14px;
      line-height: 1.5;
      color: #000;
      background: #fff;
      padding: 0;
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .content-wrapper {
      flex: 1;
      padding-bottom: 100px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
      margin-top: 0;
    }
    
    .header img {
      max-width: 90%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    
    .header-separator {
      color: #ff0000;
      text-align: center;
      font-size: 14px;
      letter-spacing: 2px;
      margin: 5px 0;
      font-weight: bold;
    }

    .guarantee-number {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 30px;
    }
    
    .date {
      margin-bottom: 30px;
    }
    
    .hospital-info {
      margin-bottom: 30px;
    }
    
    .hospital-info .director {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .hospital-info .position {
      margin-bottom: 0;
    }
    
    .hospital-info .hospital-name {
      margin-bottom: 0;
    }
    
    .hospital-info .address {
      margin-bottom: 0;
    }
    
    .greeting {
      margin-bottom: 30px;
      font-weight: bold;
    }
    
    .body-text {
      text-align: justify;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .body-text .bold {
      font-weight: bold;
    }
    .bold {
      font-weight: bold;
    }
    .paragraph {
      margin-bottom: 15px;
    }
    
    .signature-section {
      margin-top: 40px;
    }
    
    .signature-line {
      margin-bottom: 30px;
    }
    
    .signature-name {
      font-weight: bold;
      margin-bottom: 0;
    }
    
    .signature-title {
      margin-bottom: 0;
    }
    
    .note {
      font-size: 10pt;
      margin-top: 10px;
      font-style: italic;
    }
    
    .footer {
      position: fixed;
      bottom: 0;
      left: 1in;
      right: 1in;
      text-align: center;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    .footer div {
      margin-bottom: 2px;
    }
    
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="content-wrapper">
    <div class="header">
      <img src="/ozamiz_medical.png" alt="Ozamiz Medical Logo" onerror="this.style.display='none'">
      <div class="header-separator">================================================================</div>
    </div>
  
  <div class="guarantee-number">GUARANTEE NOTE - NO. ${guaranteeNumber}</div>
  
  <div class="date"><strong>Date:</strong> ${formattedDate}</div>
  
  ${
    hospitalHeader
      ? `
    <div class="hospital-info">
      <div class="director">${hospitalHeader.director}</div>
      <div class="position">${hospitalHeader.position}</div>
      <div class="hospital-name">${hospitalHeader.hospitalName}</div>
      <div class="address">${hospitalHeader.address}</div>
    </div>
    <div class="greeting">${hospitalHeader.greeting}</div>
  `
      : `
    <div class="hospital-info">
      <div class="director">--</div>
    </div>
  `
  }
  
  <div class="body-text">
    <span class="bold">${patientName.toUpperCase()}</span>, ${ageValue} ${ageType} old, sought help from the Office of the City Mayor for financial assistance for his/her unpaid medical bill. In consideration thereof, and in accordance with <span class="bold">${programName}</span> of the local government under the present administration, we hereby guarantee the payment of his/her medical bill in the amount of <span class="bold">${amountInWords} (${amountFormatted}) PESOS ONLY.</span>
  </div>
  
  <div class="paragraph">
    We undertake to pay the said amount after fifteen (15) days from receipt of written demand.
  </div>
  
  <div class="paragraph">
    All sums owing under this letter are payable in Philippine Peso.
  </div>

  
  <div class="signature-section">
    <div class="signature-line">
      <div>By the authority of:</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">SAM NORMAN G. FUENTES</div>
      <div class="signature-title">City Mayor</div>
    </div>
    
    <div class="signature-line">
      <div>Respectfully yours,</div>
    </div>
    
    <div class="signature-line">
      <div class="signature-name">RINO KARLO G. LIM</div>
      <div class="signature-title">Executive Assistant IV</div>
    </div>
    
  </div>
  </div>
  
  <div class="footer">
    <div>This document is not valid unless it bears the official seal of the City Mayor. Any erasure, alteration or the like herein, renders the same invalid.</div>
  </div>
</body>
</html>
  `.trim();

  // Create a hidden iframe to print without replacing the current page
  if (typeof document !== "undefined") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      let hasPrinted = false;

      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          if (!hasPrinted && iframe.contentWindow) {
            hasPrinted = true;
            iframe.contentWindow.print();
            // Remove iframe after a delay to allow print dialog to open
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 1000);
          }
        }, 250);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        if (!hasPrinted && iframe.parentNode && iframe.contentWindow) {
          hasPrinted = true;
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }
      }, 500);
    }
  }
}
