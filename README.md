# 🏠 Frans Vastgoed Analyse Dashboard

Intelligent dashboard dat officiële Franse overheidsdata combineert voor vastgoedanalyse. Gebouwd voor Nederlandse kopers die een huis in Frankrijk willen analyseren.

**Live demo:** [vastgoed-analyse.vercel.app](https://vastgoed-analyse.vercel.app)

## ✨ Features

| Tab | Data | Bron |
|-----|------|------|
| **Overzicht** | KPI's + links naar officiële sites | Alle bronnen |
| **Transacties** | Verkopen binnen 5 km + mediaan €/m² | DVF (data.gouv.fr) |
| **Risico's** | Overstroming, seismisch, radon, klei, SEVESO | Georisques |
| **Kadaster** | Perceel, section, PLU zone | API Carto IGN |
| **Energie** | DPE info + internetdekking | ADEME + ARCEP |

## 🚀 Deployment

### One-click deploy naar Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/antonnoe/vastgoed-analyse)

### Of handmatig:
```bash
# Clone repo
git clone https://github.com/antonnoe/vastgoed-analyse.git
cd vastgoed-analyse

# Deploy naar Vercel
npx vercel

# Of productie deploy
npx vercel --prod
```

## 📁 Structuur
```
vastgoed-analyse/
├── api/
│   ├── dvf.js          # DVF uit het officiële bestand (Node, gzip-streaming)
│   ├── risques.js      # Géorisques, status per bron
│   ├── cadastre.js     # Perceel + gemeente
│   ├── urbanisme.js    # PLU/GPU zones
│   ├── dpe.js          # ADEME DPE in de buurt
│   └── health.js       # Gezondheid per bron + DVF-dekking
├── lib/                # fetchJson (time-out, retry), validatie, DVF-kern
├── scripts/smoke.mjs   # Smoke-test tegen de live URL
├── tests/              # Unit-tests (npm test), draaien offline
├── public/index.html   # Frontend
└── .github/workflows/smoke.yml
```

## 🔌 API Endpoints

```
GET /api/dvf?lat=43.61&lon=3.87&radius=5&code_insee=34172   (radius in km, standaard 5, max 10)
GET /api/risques?lat=43.61&lon=3.87&code_insee=34172
GET /api/cadastre?lat=43.61&lon=3.87
GET /api/urbanisme?lat=43.61&lon=3.87
GET /api/dpe?lat=43.61&lon=3.87
GET /api/health
```

Alle routes valideren lat/lon (numeriek, binnen Frankrijk incl. DOM) en geven anders HTTP 400. Elke bron levert een eigen `status`: `ok`, `leeg`, `time-out` of `fout`. Externe calls gebruiken één gedeelde helper (`lib/http.js`): time-out 6 s, één retry bij 5xx of time-out, herkenbare User-Agent.

### DVF
- Bron: het officiële geo-dvf bestand per departement (`files.data.gouv.fr/geo-dvf/latest/csv/{jaar}/departements/{dep}.csv.gz`), live opgehaald en gestreamd uit gzip, gefilterd op bounding box en daarna op afstand.
- Jaren worden dynamisch bepaald: huidig jaar terug tot een 404, maximaal 3 jaren. Geen vast jaartal in de code.
- Opschoning: per `id_mutation` één keer geteld; alleen `nature_mutation` "Vente"; woningtransactie = precies één Maison of Appartement met woonoppervlakte > 0 en geen ander bedrijfspand in dezelfde mutation; dépendances tellen niet voor de oppervlakte; terrein is de som over unieke percelen.
- Statistiek: mediaan €/m² met P25, P75 en n (`statistiek.alle|maison|appartement`).
- `meta`: `bron`, `jaren`, `laatste_datum` (laatste mutatie in het departementsbestand), `aantal`, `verouderd`.
- Terugval: faalt het officiële bestand, dan de oude Cloud Run met `meta.verouderd=true`; faalt ook die, dan HTTP 502 met `meta.status="fout"`.
- Cache: `s-maxage=86400, stale-while-revalidate=604800`; de frontend rondt lat/lon af op 3 decimalen voor een bruikbare cache-sleutel.

## 🩺 /api/health

Test elke bron met een vast testpunt (Marseille 43.2965, 5.3698, INSEE 13055) en geeft per bron `status` en latentie in ms, plus de DVF-dekking (`dvf_dekking.laatste_datum`).

| `status` | Betekenis | HTTP |
|---|---|---|
| `ok` | alles bereikbaar | 200 |
| `verouderd` | laatste DVF-datum ouder dan 12 maanden | 200 |
| `degraded` | een niet-kritieke bron valt (deels) uit | 200 |
| `down` | een kritieke bron (DVF, BAN) valt uit | 503 |

`/api/health?quick=1` geeft alleen de gedeployde commit (gebruikt om op een deploy te wachten).

## ✅ Smoke-test

`node scripts/smoke.mjs [baseUrl]` draait vier testlocaties (Montpellier, Marseille, Bordeaux, Aubusson in de Creuse) tegen de live URL en toetst: DVF levert transacties, `meta.laatste_datum` is niet ouder dan 12 maanden en niet verouderd, risques geeft per bron een status, de overige routes geven geldige JSON met status, en `/api/health` is niet `down`/`verouderd`. Exitcode 1 bij falen. Standaard-URL: de iframe-URL, of zet `SMOKE_BASE_URL`.

De GitHub Action (`.github/workflows/smoke.yml`) draait unit-tests en smoke-test wekelijks en bij elke push naar `main` (bij een push wacht hij eerst tot Vercel die commit heeft uitgerold). Bij falen opent de Action een issue, waarover GitHub de repo-eigenaar mailt. Een ander domein testen: repository-variabele `SMOKE_BASE_URL`.

## 🎨 Aanpassen

### Huisstijl wijzigen

In `public/index.html`, pas de CSS variabelen aan:
```css
:root {
    --primary: #800000;        /* Hoofdkleur */
    --primary-dark: #5a0000;   /* Donkere variant */
}
```

### Eigen domein

In Vercel dashboard: Settings → Domains → Add

## 📊 Databronnen

| Bron | API | Documentatie |
|------|-----|--------------|
| DVF | files.data.gouv.fr/geo-dvf | [data.gouv.fr](https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/) |
| Georisques | georisques.gouv.fr/api/v1 | [API docs](https://api.gouv.fr/les-api/api-georisques) |
| BAN | data.geopf.fr/geocodage (Géoplateforme/IGN) | [adresse.data.gouv.fr](https://adresse.data.gouv.fr/outils/api-doc/adresse) |
| Cadastre | apicarto.ign.fr, geo.api.gouv.fr | [API Carto](https://apicarto.ign.fr/api/doc/cadastre) |
| GPU | apicarto.ign.fr/api/gpu | [Géoportail Urbanisme](https://www.geoportail-urbanisme.gouv.fr/) |
| DPE | data.ademe.fr | [Observatoire DPE](https://data.ademe.fr/) |

## ⚠️ Beperkingen

1. **Geen taxatie.** De mediaan €/m² is een indicatie uit afgesloten verkopen, geen waardebepaling.
2. **DVF-verversing.** Het officiële bestand wordt door de overheid periodiek ververst (niet dagelijks); recente verkopen ontbreken dus. De bronregel in het dashboard toont de werkelijke laatste datum. DVF dekt niet heel Frankrijk (o.a. Elzas-Moezel en Mayotte ontbreken in de dataset). Nieuwbouw (VEFA) en veilingen zitten niet in de prijsstatistiek. Bij een departementsgrens kunnen verkopen in het buurdepartement binnen de straal ontbreken.
3. **GPU-dekking.** Niet alle gemeenten hebben een digitaal plan in het Géoportail de l'Urbanisme. Bij 0 resultaten toont het dashboard dat letterlijk, zonder aannames over het geldende regime; controleer bij de gemeente.
4. **Géorisques** kan traag zijn of time-outs geven. Het dashboard toont dan per risico "Niet beschikbaar op dit moment" met een link naar het officiële rapport; dat betekent nooit "geen risico".
5. **DPE** toont gebouwen in de buurt, niet het specifieke pand.

## 📄 Licentie

MIT — Vrij te gebruiken met bronvermelding.

Open data van Franse overheid: [Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence)

---

**[infofrankrijk.com](https://infofrankrijk.com)** — voor Nederlanders in Frankrijk
