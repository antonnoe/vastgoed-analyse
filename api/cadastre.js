// Vercel Serverless Function - Cadastre (IGN API Carto)

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

  const results = {};

  // 1. Parcelle via API Carto
  try {
    const geom = JSON.stringify({
      type: 'Point',
      coordinates: [lon, lat],
    });
    const parcelleUrl = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
    
    const parcelleResponse = await fetch(parcelleUrl, {
      headers: { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' },
    });
    
    if (parcelleResponse.ok) {
      results.parcelle = await parcelleResponse.json();
    }
  } catch (error) {
    results.parcelle = { error: error.message };
  }

  // 2. Commune info via geo.api.gouv.fr
  try {
    const communeUrl = `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=nom,code,codesPostaux,population,surface&format=json`;
    
    const communeResponse = await fetch(communeUrl, {
      headers: { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' },
    });
    
    if (communeResponse.ok) {
      results.commune = await communeResponse.json();
    }
  } catch (error) {
    results.commune = { error: error.message };
  }

  return Response.json(results, {
    headers: {
      'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
