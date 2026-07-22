# daily-meta v2 — sprendimų taisyklės

Kiekvienas alertas ar pasiūlymas output'e cituoja taisyklės ID ir skaičius, kurie ją suveikdino
(pvz. `⚠️ K1: išleista 21,40 € ≥ 2× target CPL (2×9,00 €), 0 leadų per 3 d.`).
Šaltiniai ir įrodymai: `../research/2026-07-optimization-methods.md` (žymos: [M] Meta-official, [C] konsensusas, [X] ginčytina).

Konfigūracijos konstantos (keičiamos SKILL.md viršuje): `STOP_LOSS_MULT=2.0`, `TIER_SPLIT=50 €/d`,
`FREQ_ACTION=3.5`, `FREQ_EMERGENCY=4.5`, `PROVISIONAL_DAYS=3`, `PACING_TOL=15 %`, `CPM_SPIKE=20 %`.

## Tier logika

| Tier | Riba | Kasdien | Veiksmai |
|---|---|---|---|
| LOW | <50 €/d (trailing 30 d. spend/d.) | Health scan (H1–H7) + trend verdiktas | Pasiūlymai kaupiami į pirmadienio deep-dive; same-day tik EMERGENCY (H1–H3, F2, K1) |
| BIG | ≥50 €/d | Pilnas: H1–H7 + K/S/F vertinimas | Same-day pasiūlymai leidžiami |

`tier: auto` skaičiuojamas iš trailing 30 d.; `clients.yaml` override turi pirmenybę.

## H — Health scan (kasdien, visi tier'iai)

| ID | Tikrinimas | Slenkstis | Veiksmas | Conf |
|---|---|---|---|---|
| H1 | Mokėjimo klaida / account restricted / spending limit išnaudotas | bet koks | EMERGENCY alertas — blokuoja viską; siūlyti taisyti iškart | [C] |
| H2 | Atmesti (rejected) skelbimai | naujas rejection | EMERGENCY alertas; krentantis approval rate = ankstyvas account-restriction signalas | [C] |
| H3 | Zero-delivery | aktyvus ad set, 0 impressions vakar | EMERGENCY alertas; perskaityti Delivery sub-status (jis įvardija blokatorių) | [M] |
| H4 | Spend pacing | nuokrypis nuo target×dienos >±15 % **3+ d. iš eilės** | Alertas. 1 dienos nuokrypis <15 % — ignoruoti (W6); Meta legaliai gali viršyti dienos biudžetą iki ~25 % (savaitės balansas) — 1 d. perviršio <25 % neflaginti | [C]/[M] |
| H5 | Spend anomalija | ≥85 % dienos biudžeto neįprastai anksti ARBA spend = 0 | Alertas | [C] |
| H6 | CPM šuolis | ad set CPM +20 % vs trailing 7 d. vidurkis | Alertas — diagnozuoti, NE redaguoti | [C] |
| H7 | Learning statusas | entity naujai Learning / Learning Limited | Įtraukti į do-not-touch sąrašą (G1); jokių pasiūlymų tam entity | [M] |

## K — Kill (sustabdymo pasiūlymai)

| ID | Sąlyga | Slenkstis | Conf |
|---|---|---|---|
| K1 | **Stop-loss, 0 konversijų** (vienintelis same-day veiksmo pasiūlymas) | spend ≥ `STOP_LOSS_MULT`×target CPA per paskutines 3 d., 0 konversijų, entity NE learning fazėje ir NE pirmų 72 h | [C] |
| K2 | Aukštas CPA su duomenimis | trailing 7 d. CPA > 2× target, ≥3 d. ir kelios konversijos; min 100 € spend IR 2 000+ impressions prieš bet kokį CPA/ROAS pagrįstą stabdymą | [C] |
| K3 | Fatigue kill | 7 d. frequency > 4 IR CTR −20 %+ nuo baseline → siūlyti keisti vizualą | [C] |
| K4 | Early-stage išimtis | kol spend < 2× target CPA — vertinti TIK CTR/CPC/hook rate, ne CPA | [C] |
| K5 | Stabdyti, ne trinti | pause išsaugo istoriją; sustabdyti skelbimai toliau kaupia atribuciją | [C] |

## S — Scale (didinimo pasiūlymai; tik BIG tier kasdien, LOW — pirmadienį)

| ID | Sąlyga | Slenkstis | Conf |
|---|---|---|---|
| S1 | Vertikalus žingsnis | +10–20 % kai 7 d. CPA ≤ target / ROAS ≥ target; naudoti Ads Manager „safe increase" skaičių, jei rodomas | [C]/[M] |
| S2 | Konversijų grindys | ≥10 konversijų per 7 d. langą prieš didinant | [C] |
| S3 | Dažnis | vienas didinimas per 2–4 d.; niekada nekrauti kelių iš eilės | [C] |
| S4 | Lubos | vienas pakeitimas >~20 % = significant-edit rizika (learning reset) | [M]/[C] |
| S5 | Learning | jokių biudžeto didinimų learning fazėje | [C] |
| S6 | Tvarka | stop-loss taisyklės visada prieš scale taisykles | [C] |

## W — Wait (kada NIEKO nedaryti)

| ID | Taisyklė | Slenkstis | Conf |
|---|---|---|---|
| W1 | Post-launch užšaldymas | 0 redagavimų 72 h po starto; pirmas rimtas vertinimas 3 d.; gilus — 14 d. | [C] |
| W2 | Vertinimo langas | 5–7 d. iki CPA/ROAS verdikto; CTR skaitymui min 1 000 impressions + 20–30 clicks | [C] |
| W3 | Post-edit užšaldymas | significant edit = relaunch (~7 d. / 50 events iš naujo) | [M] |
| W4 | Batch redagavimai | visi vieno entity pakeitimai — vienoje sesijoje (vienas resetas), ne po lašą kasdien | [C] |
| W5 | Provizoriniai duomenys | D-1..D-3 konversijos/CPA/ROAS — „provisional" (sėda ~72 h, modeled vėluoja 24–72 h); VISI sprendimai iš mature window **D-9..D-3** vs D-16..D-10 (evaluate.py); K1 spend-guard'as — vienintelė išimtis (paskutinės 3 d., nes 0 konversijų + spend faktas nesėda) | [M]/[C] |
| W6 | Pacing kantrybė | <15 % vienos dienos nuokrypis — ignoruoti | [C] |

Kaina už nepaisymą: accountai su <20 % spend learning fazėje vs >50 % — ~68 % žemesnis CPA; išėjimas iš learning = ~19 % pigesnė konversija [M via agency].

## F — Fatigue triage (pirmadienį; F2 — same-day)

| ID | Signalas | Slenkstis | Veiksmas | Conf |
|---|---|---|---|---|
| F1 | Frequency veiksmo riba | 7 d. freq > `FREQ_ACTION` (3.5) prospecting'e | Planuoti vizualų peržiūrą | [C] |
| F2 | Frequency emergency | 7 d. freq > `FREQ_EMERGENCY` (4.5) | Siūlyti keitimą DABAR (same-day, abu tier'iai) | [C] |
| F3 | CTR kritimas | CTR −20 % vs savo baseline, laikosi 2 sav. | Patvirtintas fatigue | [C] |
| F4 | Klasikinis parašas | CPM kyla + CTR krenta + frequency auga | Fatigue diagnozė (visi trys kartu) | [C] |
| F5 | LT kalibracija | steady-state freq 3–4 mažoj rinkoj PRIIMTINA, jei KPI targete — tyla | [C] |
| F6 | Retargeting tolerancija | retargeting kampanijoms freq iki 8–10 — neflaginti pagal F1/F2 | [C] |

## R — Rekomendacijos (suggest-only; niekada neversti)

| ID | Kada | Rekomendacija | Conf |
|---|---|---|---|
| R1 | LOW tier, >2 ad setai ar interest targeting, KPI virš target | Siūlyti konsolidaciją: 1 kampanija / 1 ad set / 3–6 skirtingi vizualai (skirtingi konceptai, ne variantai) | [C] |
| R2 | Fatigue patvirtintas (F1/F3/F4) | Atnaujinti vizualus: LOW — keisti blogiausią 1 nauju kas 1–2 sav. (batch'u!); BIG — 5–10 naujų/sav., gyvavimo ciklas 2–4 sav. | [C] |
| R3 | BIG tier, stabilus CPA, 50+ konv. istorija, Highest Volume | Siūlyti graduation: cost per result goal 1,1–1,2× vidutinio CPA arba ROAS floor ~80 % trailing 28 d.; under-delivery → atlaisvinti 10–15 % | [C] |
| R4 | Lead-gen klientas su instant forms, kokybės skundai | Ateities rekomendacija: Higher Intent forma + 2–3 kvalifikaciniai klausimai; CRM feedback per CAPI (Conversion Leads: −16 % kaina/kokybišką leadą) | [M] |
| R5 | BIG tier, saturation (freq↑ + CPM↑ + CTR↓, first-time impression ratio <50 %) | Pirmiausia — vizualų apimtis (naujas vizualas ≈ nauja auditorija); tada geo plėtra LV/EE/PL atskirom kampanijom | [C] |
| R6 | Sales klientas be vertės duomenų | Patikrinti purchase value events — be jų ROAS goal neįmanomas | [M] |

## G — Guardrails (absoliučios)

| ID | Taisyklė |
|---|---|
| G1 | Entity learning fazėje / pirmų 72 h / Learning Limited su KPI targete → JOKIŲ pasiūlymų, jokių alertų dėl Learning Limited. Tyla. |
| G2 | LT rinkoje nesiūlyti interest/LAL siaurinimo — broad yra default ir lubos (LT pool ~1,5–2 M = Meta minimumas) |
| G3 | Mažiems biudžetams nesiūlyti atskiros retargeting kampanijos (netelpa; ASC blend'ina pats) |
| G4 | Jokių įrašymų į Meta be aiškaus Povilo patvirtinimo chat'e („vykdyk N"). Biudžeto keitimai — visada tik su patvirtinimu. Kiekvienas įvykdytas veiksmas — į actions-log. |
| G5 | Biudžeto keitimo pasiūlymai ±20 % ribose (arba UI „safe increase"), vienas per 2–4 d. tam pačiam entity |
| G6 | Bid strategijos: skaityti per kampaniją ir gerbti esamas (Povilas cost caps/ROAS goals taiko situaciškai) — nesiūlyti keisti be aiškios priežasties (R3) |
| G7 | Kiekvienas alertas cituoja taisyklės ID + skaičius. Jokių alertų be skaičių. |
| G8 | Nepažįstamas accountas (nėra clients.yaml) → pažymėti „nepriskirtas", pasiūlyti mini-interview; netikrinti pagal K/S be targetų |
| G9 | Valiuta — accounto native (Agatas = USD: $, ne €) |
| G10 | Palyginimai, kertantys 2026-01-12 / 2026-03 atribucijos pakeitimus — su pastaba (7d/28d view nebeliko; clicks = tik link clicks + engage-through bucket) |

## Krypties verdiktas (gerėja / blogėja / stabilu) — skaičiuoja `scripts/evaluate.py`

Visi skaičiai iš deterministinio variklio (`evaluate.py`), NE iš agento galvos. Agentas prideda
kontekstą ir pasakojimą, bet skaičių niekada neperskaičiuoja.

Pagrindinis KPI pagal targetus/tipą: roas→ROAS (TIK sales kampanijos), cpl→CPL (leads),
cps→CPS, cpm→CPM, traffic→CPC.
- Langai: **mature7 = D-9..D-3** vs **prior7 = D-16..D-10** (abu pilnai „susėdę", W5). Vakar
  dienos KPI rodomas tik kaip „(dar sėda)" kontekstas.
- **Statistiniai gate'ai (prieš alert fatigue):** verdiktas TIK kai abiejuose languose
  ≥`MIN_CONV_VERDICT` (20) konversijų (CPC atveju ≥300 clicks); kitaip — „per mažai duomenų",
  jokios krypties. Juosta: ±10 %, kai abiejuose languose n≥50 (clicks ≥1000); kitaip ±20 %.
- `gerėja`/`blogėja` — pokytis už juostos ribų atitinkama kryptimi; `stabilu` — juostos ribose.
- **T1** (lygio taisyklė): mature7 KPI blogiau už targetą ≥20 % IR spend ≥5×target (ROAS: ≥100 €)
  → 🟡 alertas. Saugo nuo mikro-imčių klaidingų aliarmų.
- Statusas: 🔴 = K1/F2/H1–H3 (aktyvių entity!); 🟡 = K2/F1/H5/T1 arba (blogėja IR už targeto
  ribos); 🟢 = niekas nesuveikė (kryptis vis tiek rodoma).

## Žinomi duomenų apribojimai (validuota 2026-07-22)

- **Activity log** (`ads_account_get_activity_logs`) dar ne visiems accountams (rollout) →
  learning laikrodžiai best-effort: mūsų pačių veiksmų log'as (state.json) + kampanijos amžius
  iš serijos (pirma spend diena) + ad-set `delivery.substatuses` (rodo learning būseną).
- **`ads_insights_anomaly_signal`** — testuota ant mažo ir didelio accounto, abu tušti;
  nepasikliauti, galima kviesti kaip papildomą signalą.
- **H2/H3 filtras:** „not delivering" klaidos iš PAUSED tėvinių entity — triukšmas, ignoruoti.
  Alertas tik kai tėvinis entity ACTIVE (išmokta iš Gama false alarm).
- 7 d. frequency: kampanijų lygio kvietimas su `date_preset=last_7d` (be time_increment) —
  veikia, naudoti F taisyklėms.
