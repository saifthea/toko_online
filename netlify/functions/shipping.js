exports.handler = async (event, context) => {
  const apiKey = process.env.KIRIMINAJA_API_KEY;
  const originId = process.env.ORIGIN_DISTRICT_ID || "5822"; // ID Asal Toko

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // 1. Pencarian Lokasi (GET)
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters.q || "";
      if (query.length < 3) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: [] }) };

      const res = await fetch(`https://api.kiriminaja.com/api/open/v2/district?search=${encodeURIComponent(query)}`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" }
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
      const { destination_id, total_weight_grams } = data;

      // Terima berat total presisi dari hitungan Frontend (index.html)
      const totalWeight = total_weight_grams || 1000;

      const payload = {
        origin: Number(originId),
        destination: Number(destination_id),
        weight: totalWeight, // Akan menjadi 1000(HP), 2000(Laptop), 4000(2 Laptop), dst.
        courier: "jne,jnt,sicepat,anteraja"
      };

      const res = await fetch("https://api.kiriminaja.com/api/open/v2/shipping_price", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Accept": "application/json" },
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
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: err.message }) };
  }
};
