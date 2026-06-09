import jsPDF from "jspdf";

export interface RxMed {
  name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}
export interface RxVitals {
  bp?: string;
  temperature?: string;
  sugar?: string;
  pulse?: string;
  weight?: string;
  height?: string;
  spo2?: string;
  respiratory_rate?: string;
}
export interface PrescriptionData {
  hospital?: {
    name?: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    logo_url?: string | null;
    brand_color?: string | null;
    phc_registration_no?: string | null;
    hospital_registration_no?: string | null;
  } | null;
  doctor?: {
    display_name?: string | null;
    specialization?: string | null;
    department?: string | null;
    experience_years?: number | null;
    phone?: string | null;
    email?: string | null;
    license_no?: string | null;
    signature_url?: string | null;
    stamp_url?: string | null;
  } | null;
  patient?: {
    first_name?: string;
    last_name?: string;
    mrn?: string | null;
    cnic?: string | null;
    phone?: string | null;
    dob?: string | null;
    gender?: string | null;
    blood_group?: string | null;
    allergies?: string[] | null;
    chronic_conditions?: string[] | null;
    address?: string | null;
  } | null;
  appointment?: { scheduled_at?: string | null } | null;
  rxNo?: string;
  diagnosis?: string;
  notes?: string;
  vitals?: RxVitals;
  medications: RxMed[];
  /** New clinical fields */
  symptoms?: string[];
  examination?: string;
  allergiesDrug?: string[];
  allergiesFood?: string[];
  chronicConditions?: string[];
  labTests?: string[];
  suggestedTreatment?: string;
  followUpDate?: string | null;
  followUpNotes?: string;
  issuedAt?: string | Date;
}


const PINK = { r: 240, g: 120, b: 160 };       // header pink
const PINK_LIGHT = { r: 252, g: 213, b: 226 };  // wave pink
const GREY = { r: 110, g: 110, b: 110 };

function ageFromDob(dob?: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  if (isNaN(+d)) return "—";
  const diff = Date.now() - d.getTime();
  const yrs = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  return `${yrs}y`;
}

function ensureRxNo(no?: string): string {
  if (no && no.trim()) return no;
  return `RX-${Date.now().toString().slice(-8)}`;
}

/** Pink ribbon footer waves. */
function drawFooterWaves(doc: jsPDF, W: number, H: number) {
  const baseY = H - 70;
  doc.setLineWidth(0);
  // dark pink filled wave
  doc.setFillColor(PINK.r, PINK.g, PINK.b);
  let path: number[][] = [];
  for (let x = 0; x <= W; x += 4) {
    path.push([x, baseY + Math.sin((x / W) * Math.PI * 2.4) * 14 + 18]);
  }
  // approximate with many small triangles via lines (fill polygon)
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.setLineWidth(1.2);
  for (let i = 0; i < path.length - 1; i++) {
    doc.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
  }
  // light pink wave above
  doc.setDrawColor(PINK_LIGHT.r, PINK_LIGHT.g, PINK_LIGHT.b);
  doc.setLineWidth(1.5);
  for (let x = 0; x <= W; x += 4) {
    const y1 = baseY + Math.sin((x / W) * Math.PI * 2.4 + 0.6) * 18 + 6;
    const y2 = baseY + Math.sin(((x + 4) / W) * Math.PI * 2.4 + 0.6) * 18 + 6;
    doc.line(x, y1, x + 4, y2);
  }
  // thin secondary wave
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.setLineWidth(0.6);
  for (let x = 0; x <= W; x += 4) {
    const y1 = baseY + Math.sin((x / W) * Math.PI * 3 + 1.2) * 10 + 30;
    const y2 = baseY + Math.sin(((x + 4) / W) * Math.PI * 3 + 1.2) * 10 + 30;
    doc.line(x, y1, x + 4, y2);
  }
  doc.setDrawColor(0, 0, 0);
}

/** Pink stethoscope-like glyph next to doctor's name. */
function drawStethoscope(doc: jsPDF, x: number, y: number, scale = 1) {
  const s = scale;
  // earpieces (pink)
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.setLineWidth(2.2 * s);
  doc.line(x + 4 * s, y, x + 4 * s, y + 14 * s);
  doc.line(x + 18 * s, y, x + 18 * s, y + 14 * s);
  doc.setFillColor(PINK.r, PINK.g, PINK.b);
  doc.circle(x + 4 * s, y - 1 * s, 2 * s, "F");
  doc.circle(x + 18 * s, y - 1 * s, 2 * s, "F");
  // tube (dark)
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(2.5 * s);
  // curve down then to right diaphragm
  doc.line(x + 4 * s, y + 14 * s, x + 11 * s, y + 26 * s);
  doc.line(x + 18 * s, y + 14 * s, x + 22 * s, y + 22 * s);
  doc.line(x + 22 * s, y + 22 * s, x + 30 * s, y + 22 * s);
  // diaphragm
  doc.setFillColor(180, 180, 180);
  doc.setDrawColor(40, 40, 40);
  doc.circle(x + 34 * s, y + 22 * s, 5 * s, "FD");
  doc.setFillColor(110, 110, 110);
  doc.circle(x + 34 * s, y + 22 * s, 2 * s, "F");
  doc.setDrawColor(0, 0, 0);
}

/** Big pink Rx symbol */
function drawRx(doc: jsPDF, x: number, y: number) {
  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("times", "bold");
  doc.setFontSize(34);
  doc.text("R", x, y);
  doc.setFontSize(24);
  doc.text("x", x + 16, y + 8);
  // slash through R leg
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.setLineWidth(1.6);
  doc.line(x + 2, y + 4, x + 14, y + 16);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
}

export function buildPrescriptionDoc(d: PrescriptionData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const rxNo = ensureRxNo(d.rxNo);
  const issued = d.issuedAt ? new Date(d.issuedAt) : new Date();

  // ============ HEADER ============
  // Left: stethoscope + Dr name + qualification + phone
  drawStethoscope(doc, 40, 50, 1.3);
  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const docName = d.doctor?.display_name ? `Dr. ${d.doctor.display_name}` : "Dr. —";
  doc.text(docName, 120, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(GREY.r, GREY.g, GREY.b);
  const qual = [d.doctor?.specialization, d.doctor?.department].filter(Boolean).join(" · ") || "Physician";
  doc.text(qual, 120, 84);
  let dy = 96;
  if (d.doctor?.experience_years) { doc.text(`${d.doctor.experience_years}+ years experience`, 120, dy); dy += 11; }
  if (d.doctor?.phone) { doc.text(`Phone: ${d.doctor.phone}`, 120, dy); dy += 11; }
  if (d.doctor?.email) { doc.text(d.doctor.email, 120, dy); dy += 11; }
  if (d.doctor?.license_no) { doc.text(`Reg #: ${d.doctor.license_no}`, 120, dy); dy += 11; }

  // Right: hospital block
  const rightX = W - 40;
  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(d.hospital?.name || "Hospital", rightX, 64, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GREY.r, GREY.g, GREY.b);
  let ry = 78;
  if (d.hospital?.address) { doc.text(d.hospital.address, rightX, ry, { align: "right" }); ry += 11; }
  const cityCountry = [d.hospital?.city, d.hospital?.country].filter(Boolean).join(", ");
  if (cityCountry) { doc.text(cityCountry, rightX, ry, { align: "right" }); ry += 11; }
  if (d.hospital?.phone) { doc.text(`Phone: ${d.hospital.phone}`, rightX, ry, { align: "right" }); ry += 11; }
  if (d.hospital?.email) { doc.text(d.hospital.email, rightX, ry, { align: "right" }); ry += 11; }
  if (d.hospital?.phc_registration_no) { doc.text(`PHC Reg: ${d.hospital.phc_registration_no}`, rightX, ry, { align: "right" }); ry += 11; }
  if (d.hospital?.hospital_registration_no) { doc.text(`Hospital Reg: ${d.hospital.hospital_registration_no}`, rightX, ry, { align: "right" }); ry += 11; }


  // ============ Patient strip ============
  const stripY = 130;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const patientName = d.patient ? `${d.patient.first_name ?? ""} ${d.patient.last_name ?? ""}`.trim() : "—";
  // Name field (long)
  doc.text("Name :", 40, stripY);
  doc.text(patientName, 78, stripY);
  doc.line(78, stripY + 2, 340, stripY + 2);
  // Age
  doc.text("Age :", 350, stripY);
  doc.text(ageFromDob(d.patient?.dob), 380, stripY);
  doc.line(380, stripY + 2, 420, stripY + 2);
  // Sex
  doc.text("Sex :", 430, stripY);
  doc.text(d.patient?.gender ?? "—", 460, stripY);
  doc.line(460, stripY + 2, 495, stripY + 2);
  // Date
  doc.text("Date :", 505, stripY);
  doc.text(issued.toLocaleDateString("en-GB"), 535, stripY);
  doc.line(535, stripY + 2, W - 40, stripY + 2);

  // MRN / Phone secondary line
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  const secondary = [
    d.patient?.mrn ? `MRN: ${d.patient.mrn}` : null,
    d.patient?.cnic ? `CNIC: ${d.patient.cnic}` : null,
    d.patient?.phone ? `Phone: ${d.patient.phone}` : null,
    d.patient?.blood_group ? `Blood: ${d.patient.blood_group}` : null,
    `Rx#: ${rxNo}`,
  ].filter(Boolean).join("   ·   ");
  doc.text(secondary, 40, stripY + 16);

  // Rx symbol
  drawRx(doc, 40, stripY + 50);

  // ============ Two-column body ============
  const bodyTop = stripY + 70;
  const bodyBottom = H - 100;
  const colGap = 16;
  const leftColW = 160;
  const leftX = 40;
  const rightColX = leftX + leftColW + colGap;
  const rightColW = W - 40 - rightColX;

  // LEFT: Vitals sidebar
  doc.setDrawColor(230, 200, 215);
  doc.setFillColor(253, 244, 248);
  doc.roundedRect(leftX, bodyTop, leftColW, bodyBottom - bodyTop, 6, 6, "FD");

  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("VITALS", leftX + 12, bodyTop + 20);
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.setLineWidth(0.6);
  doc.line(leftX + 12, bodyTop + 24, leftX + leftColW - 12, bodyTop + 24);

  const v = d.vitals ?? {};
  const vitalRows: Array<[string, string]> = [
    ["B.P.", v.bp || "—"],
    ["Pulse", v.pulse || "—"],
    ["Temp.", v.temperature || "—"],
    ["Sugar", v.sugar || "—"],
    ["SpO₂", v.spo2 || "—"],
    ["Resp.", v.respiratory_rate || "—"],
    ["Weight", v.weight || "—"],
    ["Height", v.height || "—"],
  ];
  let vy = bodyTop + 42;
  doc.setFontSize(9.5);
  for (const [k, val] of vitalRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(k, leftX + 12, vy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text(val, leftX + 70, vy);
    doc.setDrawColor(235, 215, 225);
    doc.line(leftX + 12, vy + 3, leftX + leftColW - 12, vy + 3);
    vy += 18;
  }

  // Patient summary in sidebar
  vy += 4;
  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ALLERGIES", leftX + 12, vy); vy += 4;
  doc.setDrawColor(PINK.r, PINK.g, PINK.b);
  doc.line(leftX + 12, vy, leftX + leftColW - 12, vy); vy += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const drugAllergies = d.allergiesDrug?.length ? d.allergiesDrug : (d.patient?.allergies ?? []);
  const foodAllergies = d.allergiesFood ?? [];
  const allergiesList = [
    drugAllergies.length ? `Drug: ${drugAllergies.join(", ")}` : null,
    foodAllergies.length ? `Food: ${foodAllergies.join(", ")}` : null,
  ].filter(Boolean).join("\n") || "None reported";
  const aLines = doc.splitTextToSize(allergiesList, leftColW - 24);
  doc.text(aLines, leftX + 12, vy);
  vy += aLines.length * 11 + 8;

  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CONDITIONS", leftX + 12, vy); vy += 4;
  doc.line(leftX + 12, vy, leftX + leftColW - 12, vy); vy += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const condList = d.chronicConditions?.length ? d.chronicConditions : (d.patient?.chronic_conditions ?? []);
  const cond = condList.length ? condList.join(", ") : "None reported";
  const cLines = doc.splitTextToSize(cond, leftColW - 24);
  doc.text(cLines, leftX + 12, vy);


  // RIGHT: Symptoms + Diagnosis + Examination + Medications table
  let ry2 = bodyTop;

  const sectionTitle = (label: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(PINK.r, PINK.g, PINK.b);
    doc.text(label, rightColX, ry2 + 12);
    ry2 += 18;
  };
  const sectionBody = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, rightColW);
    doc.text(lines, rightColX, ry2);
    ry2 += lines.length * 11 + 6;
  };

  if (d.symptoms?.length) {
    sectionTitle("Symptoms");
    sectionBody(d.symptoms.join(", "));
  }
  if (d.diagnosis) {
    sectionTitle("Diagnosis");
    sectionBody(d.diagnosis);
  }
  if (d.examination) {
    sectionTitle("Examination");
    sectionBody(d.examination);
  }

  // Medications table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(PINK.r, PINK.g, PINK.b);
  doc.text("℞ Medications", rightColX, ry2 + 14);
  ry2 += 22;


  // Table header
  const cols = [
    { key: "name", label: "Medicine", w: rightColW * 0.30 },
    { key: "dose", label: "Dose", w: rightColW * 0.14 },
    { key: "frequency", label: "Frequency", w: rightColW * 0.20 },
    { key: "duration", label: "Duration", w: rightColW * 0.16 },
    { key: "instructions", label: "Instructions", w: rightColW * 0.20 },
  ];

  doc.setFillColor(PINK.r, PINK.g, PINK.b);
  doc.rect(rightColX, ry2, rightColW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let cx = rightColX + 6;
  for (const c of cols) {
    doc.text(c.label, cx, ry2 + 12);
    cx += c.w;
  }
  ry2 += 18;

  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let zebra = false;
  const meds = d.medications?.length ? d.medications : [];
  for (const m of meds) {
    // calc row height
    const cellTexts = cols.map((c) => doc.splitTextToSize(String((m as any)[c.key] ?? "—"), c.w - 10));
    const rowH = Math.max(18, Math.max(...cellTexts.map((t) => t.length)) * 11 + 8);
    if (ry2 + rowH > bodyBottom) break;
    if (zebra) {
      doc.setFillColor(252, 240, 246);
      doc.rect(rightColX, ry2, rightColW, rowH, "F");
    }
    zebra = !zebra;
    cx = rightColX + 6;
    for (let i = 0; i < cols.length; i++) {
      doc.text(cellTexts[i], cx, ry2 + 12);
      cx += cols[i].w;
    }
    doc.setDrawColor(240, 220, 230);
    doc.line(rightColX, ry2 + rowH, rightColX + rightColW, ry2 + rowH);
    ry2 += rowH;
  }
  if (!meds.length) {
    doc.setTextColor(150, 150, 150);
    doc.text("No medications listed.", rightColX + 6, ry2 + 14);
    ry2 += 24;
  }

  const addSection = (label: string, text: string) => {
    if (ry2 + 30 > bodyBottom) return;
    ry2 += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(PINK.r, PINK.g, PINK.b);
    doc.text(label, rightColX, ry2);
    ry2 += 12;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(text, rightColW);
    doc.text(lines, rightColX, ry2);
    ry2 += lines.length * 11;
  };

  if (d.labTests?.length) addSection("Lab Tests Advised", d.labTests.join(", "));
  if (d.suggestedTreatment) addSection("Suggested Treatment", d.suggestedTreatment);
  if (d.notes) addSection("Advice / Notes", d.notes);
  if (d.followUpDate || d.followUpNotes) {
    const fu = [
      d.followUpDate ? `Date: ${new Date(d.followUpDate).toLocaleDateString("en-GB")}` : null,
      d.followUpNotes || null,
    ].filter(Boolean).join(" — ");
    addSection("Follow-up", fu);
  }


  // Signature line
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.4);
  doc.line(W - 200, bodyBottom - 18, W - 40, bodyBottom - 18);
  // Try embedding signature/stamp images if provided as data URLs
  try {
    if (d.doctor?.signature_url && d.doctor.signature_url.startsWith("data:image")) {
      doc.addImage(d.doctor.signature_url, "PNG", W - 190, bodyBottom - 60, 80, 38);
    }
    if (d.doctor?.stamp_url && d.doctor.stamp_url.startsWith("data:image")) {
      doc.addImage(d.doctor.stamp_url, "PNG", W - 100, bodyBottom - 60, 60, 38);
    }
  } catch {}
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`${docName} · Signature & Stamp`, W - 40, bodyBottom - 6, { align: "right" });


  // Footer waves
  drawFooterWaves(doc, W, H);

  // Footer micro text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `${d.hospital?.name ?? ""}${d.hospital?.phone ? "  ·  " + d.hospital.phone : ""}  ·  ${issued.toLocaleString()}`,
    W / 2, H - 18, { align: "center" },
  );

  return doc;
}

export function downloadPrescription(d: PrescriptionData) {
  const doc = buildPrescriptionDoc(d);
  const rxNo = ensureRxNo(d.rxNo);
  doc.save(`prescription-${rxNo}.pdf`);
}

export function prescriptionDataURL(d: PrescriptionData): string {
  const doc = buildPrescriptionDoc(d);
  return doc.output("datauristring");
}
