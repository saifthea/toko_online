exports.handler = async (event, context) => {
  const apiKey = process.env.KIRIMINAJA_API_KEY;
  const originId = process.env.ORIGIN_DISTRICT_ID || "5822"; // ID Kecamatan Asal Toko

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  // Tangani HTTP OPTIONS (Preflight)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // 1. Pencarian Lokasi (GET)
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters.q || "";
      if (query.length < 3) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: [] }) };
      }

      const res = await fetch(`https://api.kiriminaja.com/api/open/v2/district?search=${encodeURIComponent(query)}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json"
        }
      });
      const json = await res.json();

      if (json.status && json.data) {
        const results = json.data.map(item => ({
          id: item.id,
          label: `${item.name}, ${item.city_name}, ${item.province_name} (${item.zip_code})`
        }));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, results: [] }) };
    }

    // 2. Hitung Ongkir (POST)
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const { destination_id, items } = data;

      // Hitung estimasi berat total dalam Gram (default 1000g per item jika tidak diset)
      let totalWeight = 1000;
      if (items && items.length > 0) {
        totalWeight = items.reduce((sum, i) => sum + ((i.qty || 1) * 1000), 0);
      }

      const payload = {
        origin: Number(originId),
        destination: Number(destination_id),
        weight: totalWeight,
        courier: "jne,jnt,sicepat,anteraja"
      };

      const res = await fetch("https://api.kiriminaja.com/api/open/v2/shipping_price", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.status && json.data && json.data.results) {
        const options = json.data.results.map(item => ({
          courier: item.courier.toUpperCase(),
          service: item.service,
          cost: item.cost,
          etd: item.etd || "1-3 Hari"
        }));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, options }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, message: "Gagal memuat tarif." }) };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, message: err.message })
    };
  }
};
