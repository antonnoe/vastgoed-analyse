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
    // cquest.org DVF API
    const url = `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=${radius}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0',
      },
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
      { error: 'DVF API request failed', message: error.message },
      { status: 500 }
    );
  }
}
