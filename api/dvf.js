// Vercel Serverless Function - DVF (Demandes de Valeurs Foncières)

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat'));
  const lon = parseFloat(searchParams.get('lon'));

  if (!lat || !lon) {
    return Response.json(
      { error: 'lat en lon parameters vereist' },
      { status: 400 }
    );
  }

  try {
    // Eerst gemeente code ophalen
    const geoResponse = await fetch(
      `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=code&format=json`
    );
    
    if (!geoResponse.ok) {
      throw new Error('Gemeente niet gevonden');
    }
    
    const geoData = await geoResponse.json();
    const codeInsee = geoData[0]?.code;
    
    if (!codeInsee) {
      throw new Error('Geen gemeente code');
    }

    // DVF ophalen via Etalab
    const dvfUrl = `https://api.dvf.etalab.gouv.fr/mutations?code_commune=${codeInsee}`;
    
    const response = await fetch(dvfUrl, {
      headers: {
        'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DVF API: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter op afstand en converteer
    const resultats = (data.mutations || data || [])
      .slice(0, 50)
      .map(m => ({
        date_mutation: m.date_mutation,
        valeur_fonciere: m.valeur_fonciere,
        surface_reelle_bati: m.surface_reelle_bati || m.surface_terrain,
        type_local: m.type_local || m.nature_mutation,
        nombre_pieces_principales: m.nombre_pieces_principales,
        code_postal: m.code_postal,
        commune: m.nom_commune
      }));

    return Response.json({ resultats }, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'DVF API request failed', message: error.message },
      { status: 500 }
    );
  }
}
