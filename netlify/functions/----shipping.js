exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Fungsi Cerdas Penentu Tarif Real Berdasarkan Awalan Kode Pos Seluruh Indonesia (Titik Asal: Bogor/Cibinong [Awalan 16])
  function getTarifByKodePos(kodePos) {
    const cleanZip = String(kodePos || "").replace(/\D/g, "").trim();
    if (cleanZip.length < 2) return { zona: "Nasional Umum", reg: 45000, yes: 85000 };

    const prefix2 = cleanZip.substring(0, 2);
    const p1 = cleanZip.charAt(0);

    // Bogor & Depok (Lokal Terdekat)
    if (prefix2 === "16") return { zona: "Kab. Bogor, Kota Bogor & Depok", reg: 9000, yes: 18000 };
    
    // Jabodetabek & Banten (Awalan 10, 11, 12, 13, 14, 15, 17)
    if (["10", "11", "12", "13", "14", "15", "17"].includes(prefix2)) {
      return { zona: "Jabodetabek & Banten", reg: 14000, yes: 26000 };
    }
    
    // Sisa Jawa Barat & Banten Luar (Awalan 4)
    if (p1 === "4") return { zona: "Jawa Barat & Banten", reg: 18000, yes: 35000 };
    
    // Jawa Tengah & DIY (Awalan 5)
    if (p1 === "5") return { zona: "Jawa Tengah & DIY", reg: 24000, yes: 45000 };
    
    // Jawa Timur & Madura (Awalan 6)
    if (p1 === "6") return { zona: "Jawa Timur & Madura", reg: 30000, yes: 55000 };
    
    // Pulau Sumatera
    if (p1 === "2" || p1 === "3") {
      if (["34", "35"].includes(prefix2)) return { zona: "Lampung & Sekitarnya", reg: 35000, yes: 65000 };
      if (["30", "31", "32", "33"].includes(prefix2)) return { zona: "Sumatera Selatan / Palembang", reg: 42000, yes: 75000 };
      if (["20", "21", "22", "23", "24"].includes(prefix2)) return { zona: "Sumatera Utara / Medan", reg: 52000, yes: 95000 };
      return { zona: "Pulau Sumatera", reg: 48000, yes: 85000 };
    }
    
    // Pulau Kalimantan (Awalan 7)
    if (p1 === "7") return { zona: "Pulau Kalimantan", reg: 58000, yes: 100000 };
    
    // Bali & Nusa Tenggara (Awalan 8)
    if (p1 === "8") {
      if (["80", "81", "82"].includes(prefix2)) return { zona: "Bali (Denpasar & Sekitarnya)", reg: 38000, yes: 70000 };
      return { zona: "Nusa Tenggara & Bali", reg: 52000, yes: 95000 };
    }
    
    // Sulawesi, Maluku & Papua (Awalan 9)
    if (p1 === "9") {
      if (["98", "99"].includes(prefix2)) return { zona: "Papua (Jayapura, Sorong, Timika)", reg: 130000, yes: 210000 };
      return { zona: "Sulawesi & Maluku", reg: 75000, yes: 130000 };
    }

    return { zona: "Wilayah Lainnya di Indonesia", reg: 45000, yes: 85000 };
  }

  try {
    // 1. Pencarian Wilayah / Kode Pos (GET)
    if (event.httpMethod === "GET") {
      const query = (event.queryStringParameters.q || "").toLowerCase().trim();
      if (query.length < 2) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results: [] }) };

      // Simulasi hasil pencarian instan berbasis kode pos / nama daerah
      const simulatedZones = [
        { id: "zip_16911", label: `Kec. Cibinong / Kab. Bogor [Kodepos: 16911]` },
        { id: "zip_34191", label: `Kec. Rumbia, Kab. Lampung Tengah [Kodepos: 34191]` },
        { id: "zip_10110", label: `Jakarta Pusat / DKI Jakarta [Kodepos: 10110]` },
        { id: "zip_40111", label: `Kota Bandung, Jawa Barat [Kodepos: 40111]` },
        { id: "zip_50131", label: `Kota Semarang, Jawa Tengah [Kodepos: 50131]` },
        { id: "zip_60119", label: `Kota Surabaya, Jawa Timur [Kodepos: 60119]` },
        { id: "zip_80111", label: `Denpasar, Bali [Kodepos: 80111]` },
        { id: "zip_99111", label: `Jayapura, Papua [Kodepos: 99111]` }
      ];

      const results = simulatedZones.filter(z => z.label.toLowerCase().includes(query) || z.id.includes(query));
      
      // Jika ketik manual kode pos langsung (misal 5 digit angka)
      if (/^\d{3,5}$/.test(query)) {
        const dynamicInfo = getTarifByKodePos(query);
        results.unshift({
          id: `zip_${query}`,
          label: `Kodepos ${query} (${dynamicInfo.zona})`
        });
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
    }

    // 2. Kalkulasi Hitung Ongkir Otomatis Berdasarkan Berat & Kode Pos (POST)
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body || "{}");
      const { destination_id, items, total_weight_grams } = data;

      // Ekstrak kode pos dari ID tujuan (misal: "zip_34191" -> "34191")
      const extractedZip = String(destination_id || "").replace("zip_", "");
      const zoneInfo = getTarifByKodePos(extractedZip);

      // Hitung total berat barang secara presisi
      let totalKg = 1;
      if (items && Array.isArray(items) && items.length > 0) {
        let grams = items.reduce((acc, curr) => {
          const w = curr.weight || 2; // Default 2kg untuk laptop
          return acc + (w * 1000 * (curr.qty || 1));
        }, 0);
        totalKg = Math.ceil(grams / 1000); // Pembulatan ke atas per kilogram
      } else if (total_weight_grams) {
        totalKg = Math.ceil(total_weight_grams / 1000);
      }

      const options = [
        {
          courier: "JNE",
          service: "REG",
          cost: zoneInfo.reg * totalKg,
          etd: "2-3 Hari"
        },
        {
          courier: "J&T",
          service: "EZ",
          cost: (zoneInfo.reg - 2000 > 10000 ? zoneInfo.reg - 2000 : 10000) * totalKg,
          etd: "2-3 Hari"
        },
        {
          courier: "SICEPAT",
          service: "REG",
          cost: (zoneInfo.reg - 3000 > 10000 ? zoneInfo.reg - 3000 : 10000) * totalKg,
          etd: "2-4 Hari"
        }
      ];

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, options }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: err.message }) };
  }
};
