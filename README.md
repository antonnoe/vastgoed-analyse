# 🏠 Frans Vastgoed Analyse Dashboard

Intelligent dashboard dat officiële Franse overheidsdata combineert voor vastgoedanalyse. Gebouwd voor Nederlandse kopers die een huis in Frankrijk willen analyseren.

**Live demo:** [vastgoed-analyse.vercel.app](https://vastgoed-analyse.vercel.app)

## ✨ Features

| Tab | Data | Bron |
|-----|------|------|
| **Overzicht** | KPI's + links naar officiële sites | Alle bronnen |
| **Transacties** | Verkopen binnen 500m + €/m² | DVF (data.gouv.fr) |
| **Risico's** | Overstroming, seismisch, radon, klei, SEVESO | Georisques |
| **Kadaster** | Perceel, section, PLU zone | API Carto IGN |
| **Energie** | DPE info + internetdekking | ADEME + ARCEP |

## 🚀 Deployment

### One-click deploy naar Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/vastgoed-analyse)

### Of handmatig:
```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/vastgoed-analyse.git
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
│   ├── dvf.js          # DVF transacties proxy
│   ├── risques.js      # Georisques proxy (7 endpoints)
│   ├── cadastre.js     # Kadaster + gemeente proxy
│   ├── urbanisme.js    # PLU/GPU proxy
│   └── dpe.js          # Energie/DPE proxy
├── public/
│   └── index.html      # Frontend (standalone)
├── vercel.json         # Vercel config
├── package.json
└── README.md
```

## 🔌 API Endpoints

Alle endpoints zijn Vercel Edge Functions met caching:
```
GET /api/dvf?lat=48.8566&lon=2.3522&radius=500
GET /api/risques?lat=48.8566&lon=2.3522&code_insee=75056
GET /api/cadastre?lat=48.8566&lon=2.3522
GET /api/urbanisme?lat=48.8566&lon=2.3522
GET /api/dpe?lat=48.8566&lon=2.3522
```

### Response caching

- DVF, Risques, DPE: 1 uur
- Cadastre, Urbanisme: 24 uur

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
| DVF | api.cquest.org | [data.gouv.fr](https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/) |
| Georisques | georisques.gouv.fr/api/v1 | [API docs](https://api.gouv.fr/les-api/api-georisques) |
| BAN | api-adresse.data.gouv.fr | [adresse.data.gouv.fr](https://adresse.data.gouv.fr/api-doc/adresse) |
| Cadastre | apicarto.ign.fr | [API Carto](https://apicarto.ign.fr/api/doc/cadastre) |
| GPU | apicarto.ign.fr/api/gpu | [Géoportail Urbanisme](https://www.geoportail-urbanisme.gouv.fr/) |
| DPE | data.ademe.fr | [Observatoire DPE](https://data.ademe.fr/) |

## ⚠️ Bekende beperkingen

1. **DVF data** kan beperkt zijn in landelijke gebieden
2. **PLU data** niet voor alle gemeentes beschikbaar via API
3. **Georisques** heeft soms rate limits bij piekbelasting
4. **DPE** toont gebouwen in de buurt, niet specifiek pand

## 📄 Licentie

MIT — Vrij te gebruiken met bronvermelding.

Open data van Franse overheid: [Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence)

---

**[infofrankrijk.com](https://infofrankrijk.com)** — voor Nederlanders in Frankrijk
