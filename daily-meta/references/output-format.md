# daily-meta v2 — output formatas

Visas output — lietuviškai, Povilo balsu (žr. `meta-ads-report` skill): pirmu asmeniu, konkretūs skaičiai,
be korporatyvinio žargono. Kiekvienas alertas cituoja taisyklės ID + skaičius (G7).

## Skaičių formatavimas

- Tūkstančiai tarpu: `62 993`. Dešimtainiai kableliu: `10,54 €`. Valiuta po skaičiaus: `1 263,80 €` (Agatas — `$`).
- ROAS su `×`: `4,10×`. Maži skaičiai: 4 dešimtainiai <0,01, 3 — <0,1.
- Pokyčiai: rodyklė + ženklas + %: `↓ −14,2 %`. Rodyklė = metrikos kryptis, žodis/spalva = verdiktas.

## Draudžiami žodžiai (v2 lentelė — privaloma)

| Nenaudoti | Naudoti |
|---|---|
| variklis | pagrindinė kampanija / davė daugiausiai rezultatų |
| dirba | veikia |
| kūryba, kūrybinis variantas, paveikslas, vaizdas | vizualas |
| skalinti, skaluoti | didinti biudžetą |
| pristabdyti (kai pilnai stabdoma) | sustabdyti |
| stipresnis | geresnis |
| linija (apie kampaniją) | kampanija |

## Kasdienė žinutė (NIGHTLY)

Struktūra — griežtai šia tvarka:

```
🌅 Meta Ads daily — {YYYY-MM-DD}, {savaitės diena}

{2–5 eilučių santrauka: kiek accountų patikrinta, kiek 🟢/🟡/🔴, ar yra EMERGENCY,
 svarbiausias vieno sakinio insight'as.}

[PNG: portfolio_grid.png — VISI klientai su kryptim]

——— Reikia dėmesio ———

🔴 {Klientas} — {problema viena eilute}
[PNG: {Klientas}_trend.png]
   • {Taisyklė ID}: {skaičiai — kas suveikė, pvz. „K1: išleista 21,40 € ≥ 2× target CPL (9,00 €), 0 leadų per 3 d."}
   • Kontekstas: {1–2 sakiniai kodėl / kas tikėtina priežastis}

🟡 {Klientas} — {problema viena eilute}
[PNG jei suveikė taisyklė]
   • {Taisyklė ID}: {skaičiai}

——— Siūlomi veiksmai ———

1. [{Klientas}] Sustabdyti „{ad/ad set pavadinimas}" — K1 (21,40 € be leadų per 3 d.)
2. [{Klientas}] Atnaujinti vizualus — F1 (freq 3,8, CTR −24 % nuo baseline)
3. [{Klientas}] Padidinti biudžetą +15 % (55 € → 63 €/d) — S1 (7 d. CPL 7,20 € < target 9,00 €, 14 konv.)

Parašyk „vykdyk 1,3" arba „vykdyk visus" — įvykdysiu ir patvirtinsiu.
LOW tier pasiūlymai kaupiami pirmadienio apžvalgai (šiandien tik emergency).

——— Viskas OK ———
🟢 {Klientas1} (CPL 5,40 € / 6,00 €), {Klientas2} (ROAS 6,2× / 5,0×), ...
{Klientai learning fazėje — atskira eilutė: „Learning: {X}, {Y} — neliečiam iki {data}"}
```

Taisyklės:
- Provisional žyma: jei alerto skaičiai remiasi D-1..D-3 konversijomis — pridėti „(dar sėda)" (W5).
- 🟢 klientai — tik viena eilutė, jokių grafikų, jokių pastraipų.
- Jei NĖRA nei vieno alerto: santrauka + portfolio grid + „Šiandien veiksmų nereikia." Ir viskas — tyla yra teisingas atsakymas.
- Nepriskirti accountai (be clients.yaml įrašo): „🆕 {name} — nepriskirtas, ar įtraukti? (mini-interview)" (G8).
- EMERGENCY (H1–H3) — visada viršuje, prieš viską, su ‼️.

## Pirmadienio žinutė (WEEKLY — papildo kasdienę)

```
📊 Savaitės apžvalga — {praėjusi savaitė Pr–Sk} vs {dar ankstesnė}

[PNG: portfolio_grid.png su 7v7 kryptim]

{Per klientą su suveikusiom taisyklėm arba kryptim „blogėja":}
### {Klientas}
[PNG: {Klientas}_trend.png]
{2–3 sakiniai: kas keitėsi, kuri taisyklė, ką siūlau. Konkretūs skaičiai.}

——— Fatigue triage ———
{lentelė tekste: klientas | kampanija | 7 d. freq | CTR vs baseline | verdiktas}

——— Siūlomi veiksmai (įskaitant sukauptus LOW tier) ———
{numeruotas sąrašas kaip daily}
```

## Veiksmo įvykdymo patvirtinimas (EXECUTE)

```
✅ Įvykdyta:
1. [Gama Displays] Sustabdyta „IMG_variantas_3" (ad 2384...) — K1
2. [Petplius] Biudžetas 55 € → 63 €/d (ad set „Sales broad") — S1
Įrašyta į actions-log. Learning laikrodis: Petplius ad set'ui prasideda iš naujo — 
kitas biudžeto keitimas ne anksčiau {data +3 d.} (S3).
```

Po įvykdymo — jokių papildomų komentarų ar santraukų. Jei veiksmas nepavyko: ❌ su Meta klaidos tekstu.

## Grafikai

Generuojami su `scripts/trend_charts.py` (žr. skripto docstring — input JSON schema):
- `portfolio_grid.png` — VISADA, visi aktyvūs neexcluded klientai, rikiuoti: 🔴 → 🟡 → 🟢 (viduje pagal spend mažėjančiai).
- `{Klientas}_trend.png` — tik 🔴/🟡 klientams (arba `--all` pirmadienį).
- Failai į `outputs/daily-meta/{YYYY-MM-DD}/`. PNG be palette suspaudimo.
- Siųsti per failų prisegimą prie žinutės (present files), NE į Drive.

## Kas naujo Meta'oje (WATCH — 1× mėn.)

Po santraukos, prieš „Reikia dėmesio":
```
📰 Kas naujo Meta'oje ({mėnuo}):
• {pokytis 1 — viena eilutė + kaip liečia mūsų klientus}
• {pokytis 2}
```
Max 3 punktai, tik realiai svarbūs pokyčiai. Šaltinis: platform-watch.md nauji įrašai.
