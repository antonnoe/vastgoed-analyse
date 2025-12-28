// Vercel Serverless Function - DVF via OpenDataSoft

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
    // OpenDataSoft DVF+ API (stabiel, open data)
    const url = new URL('https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/buildingref-france-demande-de-valeurs-foncieres-geolocalisee-millesime/records');
    url.searchParams.set('limit', '50');
    url.searchParams.set('where', `within_distance(geolocation, geom'POINT(${lon} ${lat})', ${radius}m)`);
    url.searchParams.set('order_by', 'date_mutation DESC');
    
    const response = await fetch(url.toString(), {
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
    const resultats = (data.results || []).map(r => ({
      date_mutation: r.date_mutation,
      valeur_fonciere: r.valeur_fonciere,
      surface_reelle_bati: r.surface_reelle_bati,
      type_local: r.type_local,
      nombre_pieces_principales: r.nombre_pieces_principales,
      code_postal: r.code_postal,
      commune: r.nom_commune
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
