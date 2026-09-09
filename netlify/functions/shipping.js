exports.handler = async (event, context) => {
  const apiKey = process.env.KIRIMINAJA_API_KEY;
  // Pastikan ORIGIN_DISTRICT_ID adalah ID Kecamatan resmi dari database KiriminAja (Cibinong = 5822)
  const originId = process.env.ORIGIN_DISTRICT_ID || "5822";

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // 1. Pencarian Lokasi / Kecamatan (GET)
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

    // 2. Hitung Ongkir Real (POST)
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const { destination_id, items, total_weight_grams } = data;

      // Kalkulasi akurat total berat dalam gram
      let calculatedWeightGrams = 0;
      let totalItemValue = 0; // Estimasi nilai barang untuk kalkulasi asuransi/layanan komersial

      if (items && Array.isArray(items) && items.length > 0) {
        items.forEach(item => {
          let weightKg = 2; // Default Laptop = 2 Kg
          if (item.weight !== undefined && item.weight !== null && !isNaN(item.weight)) {
            weightKg = Number(item.weight);
          } else {
            const textCheck = ((item.nama || '') + ' ' + (item.kategori || '') + ' ' + (item.kode_produk || '')).toLowerCase();
            if (textCheck.includes('hp') || textCheck.includes('handphone') || textCheck.includes('aksesoris')) {
              weightKg = 1;
            }
          }
          const qty = Number(item.qty) || 1;
          calculatedWeightGrams += (weightKg * 1000 * qty);
          
          // Akumulasi harga barang jika ada
          const hargaSatuan = Number(item.harga) || 1500000;
          totalItemValue += (hargaSatuan * qty);
        });
      }

      const finalWeight = calculatedWeightGrams > 0 ? calculatedWeightGrams : (total_weight_grams || 1000);

      // Payload standar V2 KiriminAja yang mencakup parameter jarak & nilai barang
      const payload = {
        origin: String(originId),
        destination: String(destination_id),
        weight: finalWeight,
        item_value: totalItemValue > 0 ? totalItemValue : 1000000, 
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
        // Mapping langsung tarif real yang dikembalikan oleh server KiriminAja
        const options = json.data.results.map(item => ({
          courier: item.courier.toUpperCase(),
          service: item.service,
          cost: Number(item.cost), // Pastikan format angka murni
          etd: item.etd || "1-3 Hari"
        }));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, options }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, message: json.message || "Tarif ekspedisi tidak tersedia untuk rute ini." }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: err.message }) };
  }
};
