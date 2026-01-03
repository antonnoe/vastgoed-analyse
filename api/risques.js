// Vercel Serverless Function - Georisques (alle risico's)

export const config = {
  runtime: 'edge',
};

async function fetchSafe(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://georisques.gouv.fr/',
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function processRisques(raw) {
  const result = {
    inondation: { niveau: 'inconnu', details: [] },
    seisme: { niveau: 'inconnu', zone: null },
    argiles: { niveau: 'inconnu', alea: null },
    radon: { niveau: 'inconnu', categorie: null },
    industriel: { seveso: false, icpe_count: 0, installations: [] },
    cavites: { count: 0, details: [] },
    pollution: { count: 0, sites: [] },
    autres: [],
  };

  // Radon
  if (raw.radon?.data?.[0]) {
    const cat = parseInt(raw.radon.data[0].classe_potentiel) || 0;
    const niveauMap = { 1: 'faible', 2: 'moyen', 3: 'fort' };
    result.radon = {
      niveau: niveauMap[cat] || 'inconnu',
      categorie: cat,
    };
  }

  // Seisme zone
  if (raw.seisme?.data?.[0]) {
    const zoneStr = raw.seisme.data[0].zone_sismicite || '';
    const zone = parseInt(raw.seisme.data[0].code_zone) || null;
    const niveauMap = {
      1: 'tres_faible',
      2: 'faible',
      3: 'moyen',
      4: 'fort',
      5: 'tres_fort',
    };
    result.seisme = {
      niveau: niveauMap[zone] || 'inconnu',
      zone: zone,
      label: zoneStr,
    };
  }

  // GASPAR (algemene risico's)
  if (raw.gaspar?.data?.[0]?.risques_detail) {
    for (const risque of raw.gaspar.data[0].risques_detail) {
      const type = (risque.libelle_risque_long || '').toLowerCase();
      
      if (type.includes('inondation') || type.includes('crue')) {
        result.inondation.niveau = 'present';
        result.inondation.details.push(risque.libelle_risque_long);
      } else if (type.includes('tassements différentiels') || type.includes('argile')) {
        result.argiles.niveau = 'present';
        result.argiles.alea = risque.libelle_risque_long;
      } else if (!type.includes('séisme') && !type.includes('radon')) {
        result.autres.push(risque.libelle_risque_long);
      }
    }
  }

  // ICPE/SEVESO
  if (raw.icpe?.data) {
    const installations = raw.icpe.data;
    const seveso = installations.some(
      (i) => i.regime?.toLowerCase().includes('seveso')
    );
    result.industriel = {
      seveso,
      icpe_count: installations.length,
      installations: installations.slice(0, 5),
    };
  }

  // Cavités
  if (raw.cavites?.data) {
    result.cavites = {
      count: raw.cavites.data.length,
      details: raw.cavites.data.slice(0, 3),
    };
  }

  // Pollution (SIS)
  if (raw.pollution?.data) {
    result.pollution = {
      count: raw.pollution.data.length,
      sites: raw.pollution.data.slice(0, 3),
    };
  }

  return result;
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat'));
  const lon = parseFloat(searchParams.get('lon'));
  const codeInsee = searchParams.get('code_insee');

  if (!lat || !lon) {
    return Response.json(
      { error: 'lat en lon parameters vereist' },
      { status: 400 }
    );
  }

  const [gaspar, radon, icpe, cavites, pollution, seisme] =
    await Promise.all([
      codeInsee
        ? fetchSafe(`https://georisques.gouv.fr/api/v1/gaspar/risques?code_insee=${codeInsee}`)
        : null,
      codeInsee
        ? fetchSafe(`https://georisques.gouv.fr/api/v1/radon?code_insee=${codeInsee}`)
        : null,
      fetchSafe(`https://georisques.gouv.fr/api/v1/installations_classees?latlon=${lon},${lat}&rayon=2000`),
      fetchSafe(`https://georisques.gouv.fr/api/v1/cavites?latlon=${lon},${lat}&rayon=500`),
      fetchSafe(`https://georisques.gouv.fr/api/v1/sis?latlon=${lon},${lat}&rayon=500`),
      codeInsee
        ? fetchSafe(`https://georisques.gouv.fr/api/v1/zonage_sismique?code_insee=${codeInsee}`)
        : null,
    ]);

  const raw = { gaspar, radon, icpe, cavites, pollution, seisme };
  const processed = processRisques(raw);

  return Response.json(processed, {
    headers: {
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
