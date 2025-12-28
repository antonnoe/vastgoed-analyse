// Vercel Serverless Function - DVF (Demandes de Valeurs Foncières)

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat'));
  const lon = parseFloat(searchParams.get('lon'));
  const radius = parseInt(searchParams.get('radius')) || 500;

  if (!lat || !lon) {
    return Response.json(
      { error: 'lat en lon parameters vereist' },
      { status: 400 }
    );
  }

  try {
    // DVF via Etalab API
    const bbox = calculateBbox(lat, lon, radius);
    const url = `https://app.dvf.etalab.gouv.fr/api/mutations?bbox=${bbox}&ymin=${lat - 0.01}&ymax=${lat + 0.01}&xmin=${lon - 0.01}&xmax=${lon + 0.01}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    const data = await response.json();
    
    // Converteer naar verwacht formaat
    const resultats = (data || []).map(m => ({
      date_mutation: m.date_mutation,
      valeur_fonciere: m.valeur_fonciere,
      surface_reelle_bati: m.surface_reelle_bati,
      type_local: m.type_local,
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

function calculateBbox(lat, lon, radiusMeters) {
  const latDelta = radiusMeters / 111000;
  const lonDelta = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));
  return `${lon - lonDelta},${lat - latDelta},${lon + lonDelta},${lat + latDelta}`;
}
