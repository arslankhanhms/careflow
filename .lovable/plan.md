10 tasks ko 4 batches mein break kar raha hoon. Aap confirm karein, phir batches sequentially deliver karunga.

## Batch A — Sidebar, navigation & booking UX
- **Task 1**: `AppSidebar` ko fixed/sticky banao, Sign Out option ko upar move karo aur fixed rakho (top section). Mobile drawer mein bhi same layout.
- **Task 4**: Doctor sidebar mein "Closure Request" menu wapas add karo (`hospital.$slug.tsx` mein doctor section).
- **Task 6**: Appointment list mein newest first sorting — `appointments.functions.ts` listing + hospital appointments page + doctor schedule.
- **Task 10**: Patient booking flow mein Blood Group dropdown add karo (A+/A-/B+/B-/AB+/AB-/O+/O-/Unknown). Booking form + server validator + patient table.

## Batch B — Messaging notifications & patient reports
- **Task 2**: Patient-uploaded reports ko doctor ke pas dikhao. `doctor.reports.tsx` / `getDoctorPatientReports` ko fix karo taki patient-uploaded reports (uploaded_by patient) bhi aaye + notification doctor ko.
- **Task 3**: Message aaye to sidebar ke "Messages" item ke upar unread count badge dikhao + realtime update + notifications-bell mein bhi message type ka entry.

## Batch C — Closures & collections rework
- **Task 5**: Receptionist closure request page:
  - Doctor dropdown (sirf OPD-fee-receiving doctors)
  - Scope toggle: "OPD only" ya "OPD + Lab + Pharmacy"
  - Selected scope ke hisab se total + cash/online breakdown
  - "Send Request" → doctor ko notification + closure record (status pending)
- **Task 7**: Receptionist "Daily Collections" sidebar se OPD/Lab/Pharmacy cards hatao. Yeh data "Doctors Earnings" page mein doctor's per-doctor share (commission %) ke saath move karo.

## Batch D — Lab billing receipt & prescription edit
- **Task 8**: Lab billing "Collect" → receipt generate (existing `recordLabPayment` already creates payment + notifications). Add: receipt PDF download for receptionist, notification + receipt link to lab tech and ordering doctor, and ensure doctor's earnings "Lab" card updates with commission share in realtime.
- **Task 9**: Doctor Rx history mein har prescription clickable → full prescription dialog opens with Edit mode. Edit → update → patient & pharmacy ko updated prescription + notification jaye. (Bahut sa kaam pichli batch mein ho chuka hai — verify aur gaps fill karo.)

---

### Suggested order
A → B → C → D (har batch ke baad aap test kar lein).

**Confirm karein:**
- Kya yeh batching theek hai?
- Kis batch se shuru karun? (Default: Batch A)
