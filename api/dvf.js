// Vercel Serverless Function - DVF via BigQuery Cloud Function
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const radius = searchParams.get('radius') || '2';

  if (!lat || !lon) {
    return Response.json(
      { error: 'lat en lon parameters vereist' },
      { status: 400 }
    );
  }

  const cloudFunctionUrl = 'https://dvf-api-1012901367480.europe-west1.run.app';

  try {
    const response = await fetch(
      `${cloudFunctionUrl}?lat=${lat}&lon=${lon}&radius=${radius}`
    );

    if (!response.ok) {
      throw new Error(`Cloud Function error: ${response.status}`);
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        'Cache-Control': 's-maxage=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    return Response.json(
      { error: 'DVF data ophalen mislukt', details: error.message },
      { status: 500 }
    );
  }
}
```

---

## Hoe te doen in GitHub

1. Ga naar `api/dvf.js` in je repo
2. Klik op het **potlood-icoon** (Edit)
3. Selecteer alles (Ctrl+A) en plak bovenstaande code
4. Commit met bericht: `DVF: koppeling naar BigQuery Cloud Function`

Vercel deployt automatisch. Test daarna:
```
https://vastgoed-analyse.vercel.app/api/dvf?lat=48.8566&lon=2.3522&radius=2
