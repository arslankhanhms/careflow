// Mock data for the MediFlow AI demo. The Patients module is wired to real DB;
// other modules ship with this rich seed data and can be wired iteratively.

export type Hospital = {
  id: string; slug: string; name: string; city: string;
  plan: "Starter" | "Pro" | "Enterprise";
  status: "active" | "trial" | "suspended";
  doctors: number; patients: number; mrr: number; aiCredits: number; createdAt: string;
};

export const hospitals: Hospital[] = [
  { id: "h_001", slug: "ryk_hospital", name: "RYK General Hospital", city: "Rahim Yar Khan", plan: "Enterprise", status: "active", doctors: 84, patients: 12480, mrr: 2400, aiCredits: 18200, createdAt: "2025-01-12" },
  { id: "h_002", slug: "alnoor-clinic", name: "Al Noor Clinic", city: "Lahore", plan: "Pro", status: "active", doctors: 22, patients: 3210, mrr: 800, aiCredits: 4800, createdAt: "2025-03-04" },
  { id: "h_003", slug: "city-hospital", name: "City Hospital", city: "Karachi", plan: "Enterprise", status: "active", doctors: 140, patients: 28100, mrr: 3600, aiCredits: 26500, createdAt: "2024-11-22" },
  { id: "h_004", slug: "greenlife", name: "GreenLife Polyclinic", city: "Islamabad", plan: "Pro", status: "trial", doctors: 9, patients: 410, mrr: 0, aiCredits: 1200, createdAt: "2026-04-28" },
  { id: "h_005", slug: "medicare-plus", name: "MediCare Plus", city: "Multan", plan: "Starter", status: "active", doctors: 5, patients: 980, mrr: 200, aiCredits: 600, createdAt: "2025-09-18" },
  { id: "h_006", slug: "saint-mary", name: "Saint Mary Maternity", city: "Faisalabad", plan: "Pro", status: "suspended", doctors: 14, patients: 2100, mrr: 0, aiCredits: 0, createdAt: "2025-06-09" },
];

export const plans = [
  { id: "starter", name: "Starter Clinic", price: 49, users: 10, branches: 1, ai: 500, storage: "10 GB", features: ["OPD module", "Basic billing", "1 AI assistant", "Email support"] },
  { id: "pro", name: "Pro Clinic", price: 199, users: 50, branches: 3, ai: 5000, storage: "100 GB", features: ["All modules", "Lab + Pharmacy + Radiology", "5 AI assistants", "WhatsApp", "Priority support"] },
  { id: "enterprise", name: "Hospital Enterprise", price: 799, users: -1, branches: -1, ai: 50000, storage: "1 TB", features: ["IPD + Ward + Day Care", "All AI assistants", "SSO + 2FA + audit", "Dedicated CSM"] },
];

export type Patient = {
  id: string; mrn: string; name: string; age: number; gender: "M" | "F";
  phone: string; type: "OPD" | "IPD" | "DayCare" | "Emergency";
  doctor: string; lastVisit: string; allergies: string[];
};

export const patients: Patient[] = [
  { id: "p1", mrn: "MR-00231", name: "Ayesha Khan", age: 34, gender: "F", phone: "+92 300 1234567", type: "OPD", doctor: "Dr. Imran", lastVisit: "2026-05-12", allergies: ["Penicillin"] },
  { id: "p2", mrn: "MR-00232", name: "Hamza Ali", age: 8, gender: "M", phone: "+92 321 9876543", type: "OPD", doctor: "Dr. Saima", lastVisit: "2026-05-11", allergies: [] },
  { id: "p3", mrn: "MR-00233", name: "Fatima Noor", age: 56, gender: "F", phone: "+92 333 5550101", type: "IPD", doctor: "Dr. Tariq", lastVisit: "2026-05-13", allergies: ["Sulfa"] },
  { id: "p4", mrn: "MR-00234", name: "Bilal Ahmed", age: 42, gender: "M", phone: "+92 345 7770202", type: "Emergency", doctor: "Dr. Imran", lastVisit: "2026-05-13", allergies: [] },
  { id: "p5", mrn: "MR-00235", name: "Sana Riaz", age: 27, gender: "F", phone: "+92 312 4040404", type: "DayCare", doctor: "Dr. Saima", lastVisit: "2026-05-10", allergies: ["Latex"] },
  { id: "p6", mrn: "MR-00236", name: "Usman Tariq", age: 65, gender: "M", phone: "+92 301 1212121", type: "IPD", doctor: "Dr. Tariq", lastVisit: "2026-05-09", allergies: [] },
];

export const appointmentsToday = [
  { id: "a1", time: "09:00", patient: "Ayesha Khan", doctor: "Dr. Imran", dept: "Cardiology",   status: "checked-in" as const },
  { id: "a2", time: "09:30", patient: "Hamza Ali",   doctor: "Dr. Saima", dept: "Pediatrics",   status: "scheduled"  as const },
  { id: "a3", time: "10:00", patient: "Bilal Ahmed", doctor: "Dr. Imran", dept: "Cardiology",   status: "in-consult" as const },
  { id: "a4", time: "10:30", patient: "Fatima Noor", doctor: "Dr. Tariq", dept: "Internal Med", status: "scheduled"  as const },
  { id: "a5", time: "11:00", patient: "Sana Riaz",   doctor: "Dr. Saima", dept: "Day Care",     status: "scheduled"  as const },
  { id: "a6", time: "11:30", patient: "Usman Tariq", doctor: "Dr. Tariq", dept: "Internal Med", status: "scheduled"  as const },
  { id: "a7", time: "12:00", patient: "Ayesha Khan", doctor: "Dr. Imran", dept: "Cardiology",   status: "scheduled"  as const },
  { id: "a8", time: "14:00", patient: "Hamza Ali",   doctor: "Dr. Saima", dept: "Pediatrics",   status: "scheduled"  as const },
];

export const revenueSeries = [
  { day: "Mon", opd: 1200, lab: 800,  pharm: 1100, ipd: 1800 },
  { day: "Tue", opd: 1400, lab: 950,  pharm: 1250, ipd: 2000 },
  { day: "Wed", opd: 1100, lab: 700,  pharm: 1000, ipd: 1700 },
  { day: "Thu", opd: 1600, lab: 1100, pharm: 1400, ipd: 2200 },
  { day: "Fri", opd: 1800, lab: 1300, pharm: 1500, ipd: 2400 },
  { day: "Sat", opd: 2000, lab: 1500, pharm: 1700, ipd: 2600 },
  { day: "Sun", opd: 900,  lab: 600,  pharm: 850,  ipd: 1500 },
];

export const platformGrowth = [
  { month: "Dec", hospitals: 18, patients: 28000 },
  { month: "Jan", hospitals: 24, patients: 36500 },
  { month: "Feb", hospitals: 31, patients: 44200 },
  { month: "Mar", hospitals: 38, patients: 52800 },
  { month: "Apr", hospitals: 47, patients: 64100 },
  { month: "May", hospitals: 56, patients: 78400 },
];

export const labQueue = [
  { id: "L-2210", patient: "Ayesha Khan", test: "CBC",         status: "Sample taken", priority: "Routine", ordered: "08:42" },
  { id: "L-2211", patient: "Bilal Ahmed", test: "Troponin I",  status: "In analysis",  priority: "STAT",    ordered: "09:01" },
  { id: "L-2212", patient: "Fatima Noor", test: "HbA1c",       status: "Pending",      priority: "Routine", ordered: "09:18" },
  { id: "L-2213", patient: "Hamza Ali",   test: "Urine R/E",   status: "Reported",     priority: "Routine", ordered: "07:55" },
  { id: "L-2214", patient: "Sana Riaz",   test: "LFTs",        status: "Pending",      priority: "Routine", ordered: "10:02" },
  { id: "L-2215", patient: "Usman Tariq", test: "PT/INR",      status: "Sample taken", priority: "Urgent",  ordered: "10:14" },
];

export const pharmacyStock = [
  { id: "M-001", name: "Amoxicillin 500mg",   batch: "AMX-A12", stock: 240, expiry: "2027-02", status: "OK",          price: 0.45 },
  { id: "M-002", name: "Paracetamol 500mg",   batch: "PCM-B07", stock: 38,  expiry: "2026-08", status: "Low",         price: 0.10 },
  { id: "M-003", name: "Insulin Glargine",    batch: "INS-C03", stock: 14,  expiry: "2026-06", status: "Expiry soon", price: 18.20 },
  { id: "M-004", name: "Omeprazole 20mg",     batch: "OMZ-D11", stock: 412, expiry: "2027-09", status: "OK",          price: 0.32 },
  { id: "M-005", name: "Atorvastatin 20mg",   batch: "ATV-E04", stock: 180, expiry: "2027-01", status: "OK",          price: 0.28 },
  { id: "M-006", name: "Salbutamol Inhaler",  batch: "SAL-F09", stock: 22,  expiry: "2026-11", status: "Low",         price: 6.40 },
  { id: "M-007", name: "Metformin 850mg",     batch: "MET-G02", stock: 540, expiry: "2027-04", status: "OK",          price: 0.18 },
];

export const wardBeds = [
  { ward: "General A", total: 24, occupied: 19 },
  { ward: "General B", total: 24, occupied: 12 },
  { ward: "ICU",       total: 10, occupied: 9  },
  { ward: "Maternity", total: 16, occupied: 11 },
  { ward: "Pediatric", total: 18, occupied: 7  },
  { ward: "Surgical",  total: 20, occupied: 14 },
];

export const radiologyQueue = [
  { id: "R-101", patient: "Bilal Ahmed", study: "Chest X-Ray",   modality: "X-Ray", status: "Reported",    aiFinding: "No acute cardiopulmonary process" },
  { id: "R-102", patient: "Fatima Noor", study: "Brain MRI",     modality: "MRI",   status: "In progress", aiFinding: "Pending" },
  { id: "R-103", patient: "Usman Tariq", study: "Abdominal CT",  modality: "CT",    status: "Scheduled",   aiFinding: "—" },
  { id: "R-104", patient: "Ayesha Khan", study: "Echocardiogram",modality: "US",    status: "Reported",    aiFinding: "EF 58%, mild MR" },
];

export const bloodInventory = [
  { type: "A+",  units: 18, status: "OK"  },
  { type: "A-",  units: 4,  status: "Low" },
  { type: "B+",  units: 22, status: "OK"  },
  { type: "B-",  units: 2,  status: "Critical" },
  { type: "AB+", units: 7,  status: "OK"  },
  { type: "AB-", units: 1,  status: "Critical" },
  { type: "O+",  units: 31, status: "OK"  },
  { type: "O-",  units: 6,  status: "Low" },
];

export const invoices = [
  { id: "INV-2026-0421", patient: "Ayesha Khan", date: "2026-05-13", amount: 480, paid: 480, status: "Paid" },
  { id: "INV-2026-0422", patient: "Hamza Ali",   date: "2026-05-13", amount: 120, paid: 0,   status: "Sent" },
  { id: "INV-2026-0423", patient: "Fatima Noor", date: "2026-05-12", amount: 1820,paid: 1000,status: "Partial" },
  { id: "INV-2026-0424", patient: "Bilal Ahmed", date: "2026-05-13", amount: 2400,paid: 2400,status: "Paid" },
  { id: "INV-2026-0425", patient: "Sana Riaz",   date: "2026-05-10", amount: 660, paid: 0,   status: "Overdue" },
];

export const auditLog = [
  { ts: "2026-05-13 11:42", actor: "Dr. Imran", action: "Created prescription",   entity: "RX-7821" },
  { ts: "2026-05-13 11:30", actor: "Reception", action: "Registered patient",     entity: "MR-00236" },
  { ts: "2026-05-13 11:15", actor: "Lab",       action: "Approved report",        entity: "L-2213" },
  { ts: "2026-05-13 10:58", actor: "Pharmacy",  action: "Dispensed medicine",     entity: "RX-7820" },
  { ts: "2026-05-13 10:42", actor: "Admin",     action: "Updated bed assignment", entity: "Bed ICU-04" },
  { ts: "2026-05-13 10:22", actor: "Dr. Tariq", action: "Discharged patient",     entity: "MR-00220" },
  { ts: "2026-05-13 09:55", actor: "Reception", action: "Booked appointment",     entity: "APT-9914" },
];

export const departments = [
  { name: "Cardiology",       doctors: 6,  patientsToday: 22, color: "oklch(0.55 0.19 14)" },
  { name: "Pediatrics",       doctors: 8,  patientsToday: 31, color: "oklch(0.62 0.13 240)" },
  { name: "Internal Medicine",doctors: 12, patientsToday: 48, color: "oklch(0.62 0.15 155)" },
  { name: "Orthopedics",      doctors: 5,  patientsToday: 17, color: "oklch(0.78 0.15 75)" },
  { name: "Gynae & Obs",      doctors: 7,  patientsToday: 24, color: "oklch(0.55 0.18 300)" },
  { name: "Neurology",        doctors: 4,  patientsToday: 11, color: "oklch(0.68 0.20 14)" },
];

export const doctors = [
  { id: "d1", name: "Dr. Imran Rashid",  spec: "Cardiology",         license: "PMC-44219", status: "Available", today: 14 },
  { id: "d2", name: "Dr. Saima Hashmi",  spec: "Pediatrics",         license: "PMC-38110", status: "Available", today: 22 },
  { id: "d3", name: "Dr. Tariq Mehmood", spec: "Internal Medicine",  license: "PMC-29017", status: "In OT",     today: 8  },
  { id: "d4", name: "Dr. Nida Aslam",    spec: "Gynae & Obs",        license: "PMC-50123", status: "Available", today: 11 },
  { id: "d5", name: "Dr. Faisal Khan",   spec: "Orthopedics",        license: "PMC-41207", status: "Off duty",  today: 0  },
];

export function findHospitalBySlug(slug: string) {
  return hospitals.find((h) => h.slug === slug);
}
