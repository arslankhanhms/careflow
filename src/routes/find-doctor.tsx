import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Phone, Stethoscope, Star, Clock, ArrowRight, Search, Building2 } from "lucide-react";
import {
  listCountries, listCities, listHospitals, listSpecialtiesByCity, listDoctorsByCitySpecialty, searchDoctorsByName,
} from "@/lib/marketplace.functions";
import { PatientCnicLogin } from "@/components/patient-cnic-login";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/find-doctor")({
  head: () => ({
    meta: [
      { title: "Find a doctor — MediFlow AI" },
      { name: "description", content: "Search doctors by country, city and specialty — book an appointment in minutes." },
    ],
  }),
  component: FindDoctorPage,
});

function FindDoctorPage() {
  const fnCountries = useServerFn(listCountries);
  const fnCities = useServerFn(listCities);
  const fnHospitals = useServerFn(listHospitals);
  const fnSpecialties = useServerFn(listSpecialtiesByCity);
  const fnDoctors = useServerFn(listDoctorsByCitySpecialty);
  const fnSearchByName = useServerFn(searchDoctorsByName);
  const { user, loading: authLoading } = useAuth();

  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState<string>("");
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState<string>("");
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [hospitalId, setHospitalId] = useState<string>("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialty, setSpecialty] = useState<string>("");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // name search
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<any[] | null>(null);
  const [nameLoading, setNameLoading] = useState(false);

  const runNameSearch = async () => {
    const q = nameQuery.trim();
    if (q.length < 2) return;
    setNameLoading(true);
    try {
      const r = await fnSearchByName({ data: { q } });
      setNameResults(r ?? []);
    } finally { setNameLoading(false); }
  };

  const navigate = useNavigate();
  // Note: unauthenticated visitors can browse freely. Sign-in is only required at booking time.


  useEffect(() => { fnCountries().then(setCountries).catch(() => setCountries([])); }, []);
  useEffect(() => {
    setCity(""); setSpecialty(""); setHospitalId(""); setHospitals([]); setDoctors([]); setSpecialties([]); setCities([]);
    if (!country) return;
    setLoading(true);
    fnCities({ data: { country } }).then(setCities).finally(() => setLoading(false));
  }, [country]);
  useEffect(() => {
    setSpecialty(""); setHospitalId(""); setHospitals([]); setDoctors([]); setSpecialties([]);
    if (!country || !city) return;
    setLoading(true);
    Promise.all([
      fnSpecialties({ data: { country, city } }),
      fnHospitals({ data: { country, city } }),
    ]).then(([sp, hs]) => { setSpecialties(sp); setHospitals(hs); }).finally(() => setLoading(false));
  }, [country, city]);
  useEffect(() => {
    setDoctors([]);
    if (!country || !city || !specialty) return;
    setLoading(true);
    fnDoctors({ data: { country, city, specialty } })
      .then((res) => setDoctors(hospitalId ? res.filter((d: any) => d.hospital_id === hospitalId) : res))
      .finally(() => setLoading(false));
  }, [country, city, specialty, hospitalId]);

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader forcePublic />
      <section className="bg-gradient-soft py-14">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <Badge className="bg-primary-soft text-primary">Patient marketplace</Badge>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Find a doctor &amp; book your visit</h1>
          <p className="mt-3 text-muted-foreground">Choose your country, city, hospital and specialty — we'll show every matching doctor.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* LEFT: search bar + dropdowns */}
          <div className="space-y-6 lg:col-span-2">
            <Card className="p-6">
              <p className="mb-2 text-sm font-semibold">Search by doctor name</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runNameSearch()}
                    placeholder="e.g. Dr. Ahmed Khan"
                    className="pl-9"
                  />
                </div>
                <Button onClick={runNameSearch} disabled={nameLoading || nameQuery.trim().length < 2}
                  className="bg-gradient-brand text-primary-foreground hover:opacity-95">
                  {nameLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
                {nameResults !== null && (
                  <Button variant="ghost" onClick={() => { setNameResults(null); setNameQuery(""); }}>Clear</Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Or filter by location &amp; specialty below.</p>
            </Card>

            <Card className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Country</p>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      {!countries.length && <div className="px-3 py-2 text-xs text-muted-foreground">No active hospitals yet</div>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">City</p>
                  <Select value={city} onValueChange={setCity} disabled={!country || !cities.length}>
                    <SelectTrigger><SelectValue placeholder={country ? "Select city" : "Pick country first"} /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hospital</p>
                  <Select value={hospitalId || "__all__"} onValueChange={(v) => setHospitalId(v === "__all__" ? "" : v)} disabled={!city || !hospitals.length}>
                    <SelectTrigger><SelectValue placeholder={city ? (hospitals.length ? "All hospitals" : "No hospitals") : "Pick city first"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All hospitals</SelectItem>
                      {hospitals.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Specialty</p>
                  <Select value={specialty} onValueChange={setSpecialty} disabled={!city || !specialties.length}>
                    <SelectTrigger><SelectValue placeholder={city ? (specialties.length ? "Select specialty" : "No specialties yet") : "Pick city first"} /></SelectTrigger>
                    <SelectContent>
                      {specialties.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: patient sign-in */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <PatientCnicLogin />
          </div>
        </div>


        {nameResults !== null && (
          <div className="mt-8">
            <p className="mb-3 text-sm text-muted-foreground">
              {nameResults.length} {nameResults.length === 1 ? "match" : "matches"} for "{nameQuery}"
            </p>
            {nameResults.length === 0 ? (
              <Card className="p-10 text-center">
                <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">No doctors found with that name.</p>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {nameResults.map((d) => <DoctorCard key={d.id} doctor={d} />)}
              </div>
            )}
          </div>
        )}

        <div className="mt-10">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!loading && specialty && doctors.length === 0 && (
            <Card className="p-10 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No {specialty} doctors found in {city}.</p>
            </Card>
          )}
          {!loading && doctors.length > 0 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {doctors.length} {specialty} {doctors.length === 1 ? "doctor" : "doctors"} in {city}
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {doctors.map((d) => <DoctorCard key={d.id} doctor={d} />)}
              </div>
            </>
          )}
          {!specialty && !loading && (
            <p className="text-center text-sm text-muted-foreground">Pick a country, city and specialty to see available doctors.</p>
          )}
        </div>

        {!authLoading && !user && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Already a patient? <Link to="/patient/login" className="text-primary hover:underline">Sign in to your portal</Link>
          </p>
        )}
      </section>
      <MarketingFooter />
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: any }) {
  const navigate = useNavigate();
  const initials = (doctor.display_name || "Dr")
    .split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();
  const hospitalSlug = doctor.hospital?.slug;
  return (
    <Card className="overflow-hidden p-5 transition hover:shadow-elegant">
      <div className="flex items-start gap-3">
        {doctor.photo_url ? (
          <img src={doctor.photo_url} alt={doctor.display_name} className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initials}</div>
        )}
        <div className="flex-1">
          <p className="font-semibold leading-tight">{doctor.display_name || "Doctor"}</p>
          <p className="text-xs text-muted-foreground">{doctor.specialization || doctor.department || "General Medicine"}</p>
          {doctor.rating > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              <span className="font-medium">{Number(doctor.rating).toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        {doctor.hospital && (
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3" /> {doctor.hospital.name}
            <span className="text-muted-foreground/70">· <MapPin className="inline h-3 w-3" /> {doctor.hospital.city}</span>
          </div>
        )}
        {doctor.experience_years > 0 && <div className="flex items-center gap-1.5"><Stethoscope className="h-3 w-3" /> {doctor.experience_years} yrs experience</div>}
        {doctor.working_hours && <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {doctor.working_hours.start}–{doctor.working_hours.end}</div>}
        {doctor.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {doctor.phone}</div>}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold">
          {Number(doctor.consultation_fee || 0) > 0 ? `Rs ${Number(doctor.consultation_fee).toLocaleString()}` : "Fee TBD"}
        </span>
        <Button size="sm" disabled={!hospitalSlug} className="bg-gradient-brand text-primary-foreground hover:opacity-95"
          onClick={() => hospitalSlug && navigate({ to: "/find-doctor/$hospitalSlug/$doctorId", params: { hospitalSlug, doctorId: doctor.id } })}>
          Book <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}
