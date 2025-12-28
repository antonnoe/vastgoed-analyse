// Vercel Serverless Function - DPE (Diagnostic de Performance Énergétique)

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
    // ADEME Observatoire DPE
    const url = new URL('https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines');
    url.searchParams.set('geo_distance', `${lon},${lat},200`);
    url.searchParams.set('size', '20');
    url.searchParams.set('select', 'classe_consommation_energie,classe_estimation_ges,surface_habitable,annee_construction,type_batiment');
    
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' },
    });

    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'DPE API request failed', message: error.message },
      { status: 500 }
    );
  }
}
