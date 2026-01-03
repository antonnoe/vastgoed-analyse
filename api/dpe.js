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
    // ADEME Observatoire DPE - nieuwe API structuur
    const url = new URL('https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines');
    url.searchParams.set('geo_distance', `${lon},${lat},500`);
    url.searchParams.set('size', '20');
    url.searchParams.set('select', 'classe_consommation_energie,classe_estimation_ges,surface_habitable,annee_construction,type_batiment');
    
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' },
    });

    if (!response.ok) {
      // Fallback: geef nuttige links terug als API niet werkt
      return Response.json({
        status: 'api_unavailable',
        message: 'ADEME DPE API tijdelijk niet beschikbaar',
        links: {
          observatoire_dpe: 'https://observatoire-dpe.ademe.fr/',
          france_renov: 'https://france-renov.gouv.fr/'
        }
      }, {
        headers: {
          'Cache-Control': 's-maxage=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await response.json();
    
    return Response.json(data, {
      headers: {
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    return Response.json({
      status: 'error',
      message: error.message,
      links: {
        observatoire_dpe: 'https://observatoire-dpe.ademe.fr/',
        france_renov: 'https://france-renov.gouv.fr/'
      }
    }, {
      status: 200, // Geen 500, zodat frontend niet crasht
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
