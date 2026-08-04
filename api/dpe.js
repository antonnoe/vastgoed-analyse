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
    // ADEME Observatoire DPE - dataset dpe03existant (opvolger van dpe-v2-logements-existants)
    const buildUrl = (select) => {
      const u = new URL('https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines');
      u.searchParams.set('geo_distance', `${lon},${lat},500`);
      u.searchParams.set('size', '20');
      if (select) u.searchParams.set('select', select);
      return u.toString();
    };

    const headers = { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' };

    // Veldnamen van dpe03existant (DPE v2-schema).
    let response = await fetch(
      buildUrl('etiquette_dpe,etiquette_ges,surface_habitable_logement,annee_construction,type_batiment'),
      { headers }
    );

    // Wijkt de veldenlijst af, dan antwoordt data-fair met 400; haal in dat geval
    // alle velden op zodat de opvraging hoe dan ook data teruggeeft.
    if (!response.ok) {
      response = await fetch(buildUrl(null), { headers });
    }

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
