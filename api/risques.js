// Vercel Serverless Function - Georisques (DEBUG versie)

export const config = {
  runtime: 'edge',
};

async function fetchSafe(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'InfoFrankrijk-VastgoedDashboard/1.0' },
    });
    if (!response.ok) return { error: response.status, url };
    return await response.json();
  } catch (e) {
    return { error: e.message, url };
  }
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

  // Debug: toon wat we ophalen
  const [gaspar, radon, seisme] = await Promise.all([
    codeInsee
      ? fetchSafe(`https://georisques.gouv.fr/api/v1/gaspar/risques?code_insee=${codeInsee}`)
      : { skipped: 'no code_insee' },
    codeInsee
      ? fetchSafe(`https://georisques.gouv.fr/api/v1/radon?code_insee=${codeInsee}`)
      : { skipped: 'no code_insee' },
    codeInsee
      ? fetchSafe(`https://georisques.gouv.fr/api/v1/zonage_sismique?code_insee=${codeInsee}`)
      : { skipped: 'no code_insee' },
  ]);

  // Return raw data voor debugging
  return Response.json({
    debug: true,
    params: { lat, lon, codeInsee },
    raw: { gaspar, radon, seisme }
  }, {
    headers: {
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
