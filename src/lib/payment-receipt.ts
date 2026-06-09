import jsPDF from "jspdf";

export interface ReceiptData {
  // hospital
  hospitalName?: string;
  hospitalAddress?: string | null;
  hospitalPhone?: string | null;
  hospitalCity?: string | null;
  hospitalEmail?: string | null;
  hospitalLogoUrl?: string | null;
  hospitalBrandColor?: string | null;
  // receipt meta
  receiptNo?: string | null;
  referenceNo?: string | null;
  paidAt?: string | Date | null;
  // patient
  patientName?: string;
  patientMrn?: string | null;
  patientFatherName?: string | null;
  patientCnic?: string | null;
  patientSex?: string | null;
  patientAge?: string | number | null;
  patientPhone?: string | null;
  // appointment / payment
  doctorName?: string | null;
  doctorSpecialization?: string | null;
  appointmentAt?: string | null;
  amount: number;
  method: string;
  status: string;
  txnId?: string | null;
  // behaviour
  autoPrint?: boolean;
}

function fmtDate(d?: string | Date | null): string {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function ensureReceiptNo(no?: string | null): string {
  if (no && String(no).trim()) return String(no);
  return `R-${Date.now().toString().slice(-8)}`;
}
function ensureReferenceNo(ref?: string | null, receiptNo?: string): string {
  if (ref && String(ref).trim()) return String(ref);
  return `REF-${(receiptNo || Date.now().toString()).replace(/[^A-Z0-9]/gi, "").slice(-10)}`;
}

function hexToRgb(hex?: string | null): [number, number, number] {
  const h = (hex || "#dc2626").replace("#", "");
  const v = h.length === 3
    ? h.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  return [v[0] || 0, v[1] || 0, v[2] || 0];
}

async function fetchImageDataUrl(url: string): Promise<{ data: string; format: "PNG" | "JPEG" } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const fmt: "PNG" | "JPEG" = /jpeg|jpg/i.test(blob.type) ? "JPEG" : "PNG";
    return { data, format: fmt };
  } catch { return null; }
}

// (legacy PAID stamp removed)

function ageFromDob(dob?: string | Date | null): string | null {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  const yrs = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  return yrs > 0 ? `${yrs} yrs` : null;
}

export async function downloadPaymentReceipt(d: ReceiptData & { patientDob?: string | Date | null }) {
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 28;
  const brand = hexToRgb(d.hospitalBrandColor);

  const receiptNo = ensureReceiptNo(d.receiptNo);
  const referenceNo = ensureReferenceNo(d.referenceNo, receiptNo);
  const paidDate = d.paidAt ? new Date(d.paidAt) : new Date();
  const ageStr = d.patientAge != null ? String(d.patientAge) : ageFromDob(d.patientDob);

  // === Header band ===
  doc.setFillColor(brand[0], brand[1], brand[2]);
  doc.rect(0, 0, W, 70, "F");

  // Logo (left side of header)
  let logoEnd = M;
  if (d.hospitalLogoUrl) {
    const img = await fetchImageDataUrl(d.hospitalLogoUrl);
    if (img) {
      try {
        doc.addImage(img.data, img.format, M, 14, 42, 42, undefined, "FAST");
        logoEnd = M + 52;
      } catch { /* ignore bad image */ }
    }
  }

  // Hospital name + meta in header
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(d.hospitalName || "Hospital", logoEnd, 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const headerLines = [
    [d.hospitalAddress, d.hospitalCity].filter(Boolean).join(", "),
    [d.hospitalPhone ? `Ph: ${d.hospitalPhone}` : "", d.hospitalEmail || ""].filter(Boolean).join("  ·  "),
  ].filter(Boolean) as string[];
  let hy = 44;
  headerLines.forEach((ln) => { doc.text(ln, logoEnd, hy); hy += 10; });

  // Receipt title strip
  doc.setFillColor(245, 245, 247);
  doc.rect(0, 70, W, 22, "F");
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("PAYMENT RECEIPT", M, 86);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(`Receipt #: ${receiptNo}`, W - M, 82, { align: "right" });
  doc.text(`Ref #: ${referenceNo}`, W - M, 92, { align: "right" });

  // === Patient block ===
  let y = 108;
  const patientBlockH = 96;
  doc.setDrawColor(220); doc.setLineWidth(0.5);
  doc.roundedRect(M, y, W - M * 2, patientBlockH, 4, 4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(brand[0], brand[1], brand[2]);
  doc.text("PATIENT DETAILS", M + 8, y + 13);
  doc.setTextColor(40, 40, 40);

  const colX = [M + 8, M + 145];
  const patColW = (W - M * 2 - 16) / 2 - 8;
  const labelVal = (col: 0 | 1, row: number, label: string, value: string) => {
    const ry = y + 28 + row * 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), colX[col], ry);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(String(value || "—"), patColW) as string[];
    doc.text(lines[0] ?? "—", colX[col], ry + 10);
  };
  labelVal(0, 0, "Name", d.patientName || "—");
  labelVal(1, 0, "Father / Guardian", d.patientFatherName || "—");
  labelVal(0, 1, "MRN", d.patientMrn || "—");
  labelVal(1, 1, "CNIC", d.patientCnic || "—");
  labelVal(0, 2, "Sex / Age", [d.patientSex, ageStr].filter(Boolean).join(" · ") || "—");
  labelVal(1, 2, "Phone", d.patientPhone || "—");

  // === Visit block ===
  y += patientBlockH + 12;
  const visitBlockH = 96;
  doc.roundedRect(M, y, W - M * 2, visitBlockH, 4, 4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(brand[0], brand[1], brand[2]);
  doc.text("VISIT & PAYMENT", M + 8, y + 13);
  doc.setTextColor(40);

  const visit = [
    ["Doctor", d.doctorName ? `Dr ${d.doctorName}` : "—"],
    ["Speciality", d.doctorSpecialization || "—"],
    ["Appointment", d.appointmentAt ? fmtDate(d.appointmentAt) : "—"],
    ["Paid on", fmtDate(paidDate)],
    ["Method", (d.method || "").toUpperCase()],
    ["Status", (d.status || "").toUpperCase()],
  ];
  visit.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cw = (W - M * 2 - 16) / 2;
    const cx = M + 8 + col * cw;
    const cyTop = y + 28 + row * 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), cx, cyTop);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.setTextColor(20);
    const maxW = cw - 8;
    const lines = doc.splitTextToSize(String(value || "—"), maxW) as string[];
    doc.text(lines[0] ?? "—", cx, cyTop + 10);
  });
  if (d.txnId) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(`Txn ID: ${d.txnId}`, M + 8, y + visitBlockH - 6);
  }

  // === Amount band ===
  y += visitBlockH + 12;
  doc.setFillColor(brand[0], brand[1], brand[2]);
  doc.roundedRect(M, y, W - M * 2, 38, 4, 4, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("TOTAL AMOUNT PAID", M + 12, y + 16);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text(`Rs ${Number(d.amount || 0).toLocaleString()}`, W - M - 12, y + 26, { align: "right" });
  doc.setTextColor(0);

  // === Signature & footer ===
  y += 70;
  doc.setDrawColor(150);
  doc.setLineWidth(0.4);
  doc.line(M, y + 30, M + 140, y + 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80);
  doc.text("Received by (Signature & Stamp)", M, y + 42);

  doc.setFont("helvetica", "italic"); doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    "This is a system-generated receipt. Please keep it for your records.",
    W / 2, H - 18, { align: "center" }
  );

  const filename = `receipt-${receiptNo}.pdf`;

  if (d.autoPrint) {
    try { (doc as any).autoPrint?.(); } catch {}
    const url = doc.output("bloburl") as unknown as string;
    const win = window.open(url, "_blank");
    if (!win) doc.save(filename);
    return;
  }
  doc.save(filename);
}
