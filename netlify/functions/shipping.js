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
      const { destination_id, items, total_weight_grams } = data;

      // KALKULASI BERAT DI BACKEND (Mencegah tidak akurat & manipulasi)
      let calculatedWeightGrams = 0;
      
      if (items && Array.isArray(items) && items.length > 0) {
        items.forEach(item => {
          let weightPerItem = 2; // Default jika tidak diketahui adalah Laptop (2 Kg)
          
          // Jika Frontend mengirim parameter weight, gunakan itu
          if (item.weight !== undefined && item.weight !== null) {
            weightPerItem = Number(item.weight);
          } else {
            // Analisa otomatis berdasarkan kode/nama jika tidak dikirim spesifik (HP=1kg)
            const identitas = ((item.kode_produk || '') + ' ' + (item.nama || '')).toLowerCase();
            if (identitas.includes('hp') || identitas.includes('handphone') || identitas.includes('aksesoris')) {
              weightPerItem = 1;
            }
          }
          
          // Akumulasikan: Berat per item x Kuantitas x 1000 (ubah ke Gram)
          calculatedWeightGrams += (weightPerItem * 1000 * (item.qty || 1));
        });
      }

      // Pastikan minimal berat adalah 1000 Gram (1 Kg)
      const finalWeight = calculatedWeightGrams > 0 ? calculatedWeightGrams : (total_weight_grams || 1000);

      const payload = {
        origin: String(originId), // KiriminAja V2 mewajibkan String, bukan Number
        destination: String(destination_id),
        weight: finalWeight, 
        courier: "jne,jnt,sicepat,anteraja,ninja,ide" // Penambahan kurir alternatif
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
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, message: json.message || "Kurir belum mencakup wilayah ini." }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: err.message }) };
  }
};
