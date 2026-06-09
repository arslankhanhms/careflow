import { downloadPaymentReceipt, type ReceiptData } from "./payment-receipt";

/**
 * Single source of truth: convert a `getReceipt` server response into the
 * exact arguments accepted by `downloadPaymentReceipt`. Used by BOTH the
 * receptionist appointments view and the patient dashboard so the generated
 * receipt has identical fields and layout everywhere.
 */
export function buildReceiptArgs(r: any, opts?: { autoPrint?: boolean }): ReceiptData & { patientDob?: string | null } {
  const h = r?.hospital ?? {};
  const p = r?.patient ?? {};
  const pay = r?.payment ?? {};
  const a = r?.appointment ?? {};
  return {
    hospitalName: h.name || "Hospital",
    hospitalAddress: h.address ?? null,
    hospitalPhone: h.phone ?? null,
    hospitalCity: h.city ?? null,
    hospitalEmail: h.email ?? null,
    hospitalLogoUrl: h.logo_url ?? null,
    hospitalBrandColor: h.brand_color ?? null,
    receiptNo: pay.receipt_no ?? null,
    referenceNo: pay.reference_no ?? null,
    patientName: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—",
    patientMrn: p.mrn ?? null,
    patientFatherName: p.father_name ?? null,
    patientCnic: p.cnic ?? null,
    patientSex: p.sex ?? p.gender ?? null,
    patientDob: p.dob ?? null,
    patientPhone: p.phone ?? null,
    doctorName: a?.doctor?.display_name ?? null,
    doctorSpecialization: a?.doctor?.specialization ?? null,
    appointmentAt: a?.scheduled_at ?? null,
    amount: Number(pay.amount || a?.consultation_fee || 0),
    method: pay.method || "cash",
    status: pay.status || "paid",
    txnId: pay.txn_id ?? null,
    paidAt: pay.created_at ?? new Date().toISOString(),
    autoPrint: opts?.autoPrint ?? false,
  };
}

/** Fetch + render the receipt PDF in one call. */
export async function generateReceiptFromPaymentId(
  fnGetReceipt: (args: { data: { paymentId: string } }) => Promise<any>,
  paymentId: string,
  mode: "save" | "print" = "save",
) {
  const r = await fnGetReceipt({ data: { paymentId } });
  await downloadPaymentReceipt(buildReceiptArgs(r, { autoPrint: mode === "print" }));
}

/** Build receipt args from a receptionist appointment row + hospital
 * (used when we don't have a paymentId yet, e.g. immediately after
 * marking cash received). Produces the SAME shape as buildReceiptArgs. */
export function buildReceiptArgsFromRow(
  r: any,
  hospital: any,
  opts?: { autoPrint?: boolean; methodOverride?: string },
) {
  return buildReceiptArgs(
    {
      hospital,
      patient: r?.patient ?? {},
      payment: {
        receipt_no: r?.payment?.receipt_no ?? null,
        reference_no: r?.payment?.reference_no ?? null,
        amount: Number(r?.consultation_fee || r?.payment?.amount || 0),
        method: opts?.methodOverride || r?.payment?.method || "cash",
        status: "paid",
        txn_id: r?.payment?.txn_id ?? null,
        created_at: r?.payment?.paid_at ?? r?.payment?.created_at ?? new Date().toISOString(),
      },
      appointment: {
        scheduled_at: r?.scheduled_at ?? null,
        consultation_fee: r?.consultation_fee ?? null,
        doctor: r?.doctor ?? null,
      },
    },
    opts,
  );
}
