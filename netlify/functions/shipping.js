exports.handler = async (event, context) => {
  const apiKey = process.env.KIRIMINAJA_API_KEY;
  const originId = process.env.ORIGIN_DISTRICT_ID || "5822"; // ID Kecamatan Asal (Cibinong)

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // 1. Pencarian Wilayah / Kecamatan / Kode Pos (GET) menggunakan API KiriminAja
    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters.q || "";
      if (query.length < 2) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: [] }) };

      const res = await fetch(`https://api.kiriminaja.com/api/open/v2/district?search=${encodeURIComponent(query)}`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" }
      });
      const json = await res.json();

      if (json.status && json.data) {
        const results = json.data.map(item => ({
          id: String(item.id),
          label: `${item.name}, ${item.city_name}, ${item.province_name} (${item.zip_code})`
        }));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, results: [] }) };
    }

    // 2. Kalkulasi Hitung Ongkir Real (POST) via API KiriminAja
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const { destination_id, items, total_weight_grams } = data;

      // Akumulasi total berat presisi (gram) dari keranjang
      let totalGrams = 1000;
      if (items && Array.isArray(items) && items.length > 0) {
        totalGrams = items.reduce((sum, item) => {
          const kg = item.weight !== undefined ? Number(item.weight) : 2; // Default 2kg untuk laptop
          return sum + (kg * 1000 * (item.qty || 1));
        }, 0);
      } else if (total_weight_grams) {
        totalGrams = Number(total_weight_grams);
      }

      const payload = {
        origin: String(originId),
        destination: String(destination_id),
        weight: totalGrams,
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
          cost: Number(item.cost),
          etd: item.etd || "1-3 Hari"
        }));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, options }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, message: json.message || "Gagal mengambil tarif ekspedisi." }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: err.message }) };
  }
};
