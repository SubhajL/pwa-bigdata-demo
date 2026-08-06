# Map Ta Phut 200-customer low-pressure impact — provenance & privacy

PR-I replaces the five Samut Sakhon demo service points with a **designed, fully SIMULATED**
Map Ta Phut low-pressure incident of exactly **200 accounts**. This note records where the design
comes from, what is synthetic, and what must never be claimed.

## What this is — and is NOT

- The 200 accounts, their identifiers, addresses, meter numbers, type mix, and 2,400 monthly
  readings are **SIMULATED demonstration data**. They are not observed Map Ta Phut records and
  carry no personal data. No account here is a real one.
- The `140 / 35 / 25` top-level split (and the 17-subtype table) is a **deterministic design
  choice for the demo**, not a measured Map Ta Phut distribution.
- The 200-to-a-single-pipe attachment is a **scenario decision**, not surveyed hydraulics. It
  exists so the impact traversal is exactly computable (upstream corridor → 200, last leg → 80).

## Synthetic method

- `scripts/map_ta_phut_customer_profile.py` generates the dataset **deterministically** (no
  wall-clock, no unseeded randomness), so the same 200 accounts and 2,400 readings reproduce
  byte-for-byte.
- Identifiers are unmistakably synthetic: `SIM-MTP-*` customer / `SIM-MTP-ACC-*` account /
  `SIM-MTP-MTR-*` meter. Addresses are scenario labels beginning `ที่อยู่จำลอง:`.
- Two layers keep the data synthetic. (1) The **generator** is the sole writer, and before any DB
  write `validate_demo_customer_profile` enforces an **allowlist**: every field must match its exact
  synthetic shape (the address is exactly `ที่อยู่จำลอง: จุดบริการ MTP-Z01-NNN, ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง`,
  ids are `SIM-MTP-*`, area/branch/meter-size/zone are fixed values). Because it accepts only those
  shapes, no arbitrary text — including a name, which no blocklist could catch — can pass; a PII
  blocklist runs as a secondary net. (2) Migration `007` adds database CHECK tripwires — identifiers
  `SIM-MTP-`-prefixed, address contains `จำลอง`, `simulated` true — so a clearly-real row is refused
  at write time. The CHECKs are prefix/marker guards; the airtight no-PII guarantee is the generator
  allowlist, the only path that seeds these tables.
- Meter readings are integer m³ with a per-row arithmetic CHECK (`usage = reading − previous`).
  `demo_customer_meter_reading` is a plain relational table, not a hypertable: 12 closed monthly
  periods per account is bounded reference data, not the append-heavy device telemetry that lives
  in the `telemetry` hypertable.

## Privacy boundary (PWA privacy policy)

Names, water-customer numbers, addresses, contact details, national/tax IDs, and location-linked
identifiers are personal data. This dataset therefore contains **none** of them: no name, phone,
email, national ID, tax ID, genuine water-customer number, genuine meter number, or point
coordinate. The impact footprint is a coarse geographic **area** polygon, never an individual
point.

## Binding disclosures (must stay visible)

- **Branch-code mismatch.** The supplied pipe GIS carries PWA code `5531021` (Rayong), while the
  Map Ta Phut / Noen Phra / Thap Ma service point is operated by PWA **Ban Chang**, curated code
  `5531022`. The GIS-to-service-area binding is therefore **SIMULATED**, never REAL, and the demo
  labels the branch `กปภ.สาขาบ้านฉาง (จำลอง)`.
- **Device-roster seam.** The demo pump `P-2` and valve `V-9` are existing Samut Sakhon roster
  devices, unchanged by PR-I. They are the SIMULATED scenario's control points, not Rayong
  hardware. PR-I moves the affected-**customer** geography to Ban Chang / Rayong; it does not
  relabel the device roster, and nothing here asserts the pump is a Map Ta Phut station.
- **Provenance ladder.** Pipe geometry can be REAL (permission-gated). Everything PR-I adds —
  the 200 accounts, their readings, and the low-pressure footprint — is SIMULATED. The footprint
  response pins `provenance = SIMULATED_LOW_PRESSURE_FOOTPRINT`.

## Feature gating

`MTP_CUSTOMER_IMPACT_ENABLED` gates the enriched impact detail, the per-customer route, and the
impact-zone route. The application default is off — a non-demo deploy answers 404 and the impact
list keeps its basic shape, never falling back to the retired five rows. The **demo compose enables
it** (`docker-compose` defaults it to 1) because the click-through surface is scored; the schema and
the 200-account seed always land regardless, being simply more clearly-labelled simulated data.

**PR-J (UI consumer).** The frontend now renders the coarse footprint as a clickable, non-colour-only
`พื้นที่แรงดันต่ำจำลอง` affordance and, on a GIS-enabled stack, as a dashed map layer; clicking it (or
a highlighted pipe) opens the 200-account drawer with per-account detail and 12 readings. This changes
nothing about provenance or privacy: the footprint stays a coarse zone polygon (never a customer
point), every id/address stays synthetic, and the impact stays `SIMULATED` beside any REAL geometry.

## Sources (classification labels only — assigned to synthetic accounts)

- PWA customer classification 2026: https://www.pwa.co.th/contents/service/customer-type
- PWA customer guide (meter sizes, monthly reading): https://www.pwa.co.th/contents/service/customer-guide
- PWA Map Ta Phut 1 service-area report: https://www.pwa.co.th/news/view/101505
- PWA privacy policy: https://pwa.co.th/contents/privacy-policy
