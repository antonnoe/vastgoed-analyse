// Vercel Serverless Function - DVF via Pappers link

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

  return Response.json({
    resultats: [],
    pappers_url: `https://immobilier.pappers.fr/?lat=${lat}&lon=${lon}&z=16`,
    dvf_url: `https://explore.data.gouv.fr/immobilier?onglet=carte&lat=${lat}&lon=${lon}&zoom=16`
  }, {
    headers: {
      'Cache-Control': 's-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
