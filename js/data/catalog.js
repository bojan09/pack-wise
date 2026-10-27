// PackWise destination catalog (editorial, versioned, bundled for offline use).
//
// WHAT THIS IS: a short, hand-reviewed list of well-known places per destination, written by
// PackWise from general public knowledge. It is NOT a live feed and was NOT checked against a
// live source when it was written.
//
// WHAT IT DELIBERATELY LEAVES OUT: prices, opening hours, coordinates and anything seasonal that
// could not be verified. Admission is only ever 'free' (open public space), 'paid' (normally
// ticketed) or 'check' (varies or unknown) — never a guess at an amount.
//
// To extend: add a destination below, keep claims general and checkable, and bump `version`.
// tests/unit/catalog.test.js enforces the rules (no prices/hours/coordinates, unique ids, etc.).

export const CATALOG = {
 "version": "2026-10-28",
 "reviewedAt": "2026-10-28",
 "countries": [
  {
   "id": "RS",
   "name": "Serbia",
   "aliases": []
  },
  {
   "id": "MK",
   "name": "North Macedonia",
   "aliases": [
    "macedonia"
   ]
  },
  {
   "id": "BA",
   "name": "Bosnia and Herzegovina",
   "aliases": [
    "bosnia",
    "bosnia & herzegovina",
    "bih"
   ]
  },
  {
   "id": "HR",
   "name": "Croatia",
   "aliases": [
    "hrvatska"
   ]
  },
  {
   "id": "SI",
   "name": "Slovenia",
   "aliases": []
  },
  {
   "id": "ME",
   "name": "Montenegro",
   "aliases": []
  },
  {
   "id": "AL",
   "name": "Albania",
   "aliases": []
  },
  {
   "id": "BG",
   "name": "Bulgaria",
   "aliases": []
  }
 ],
 "destinations": [
  {
   "id": "belgrade",
   "name": "Belgrade",
   "country": "Serbia",
   "countryCode": "RS",
   "aliases": [
    "beograd",
    "београд"
   ],
   "places": [
    {
     "id": "kalemegdan-park-fortress",
     "name": "Kalemegdan Park & Fortress",
     "area": "Stari Grad",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Fortress and park above the meeting point of the Sava and Danube rivers, good for walks and city views.",
     "family": true,
     "note": "Museums and exhibitions inside the fortress may charge."
    },
    {
     "id": "knez-mihailova-street",
     "name": "Knez Mihailova Street",
     "area": "Stari Grad",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Pedestrian shopping street linking Republic Square to Kalemegdan, lined with 19th-century buildings."
    },
    {
     "id": "republic-square",
     "name": "Republic Square",
     "area": "Stari Grad",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Central square and popular meeting spot, with the National Museum and National Theatre nearby."
    },
    {
     "id": "skadarlija",
     "name": "Skadarlija",
     "area": "Stari Grad",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Cobbled bohemian quarter known for traditional restaurants and its old-town atmosphere."
    },
    {
     "id": "temple-of-saint-sava",
     "name": "Temple of Saint Sava",
     "area": "Vračar",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "One of the largest Orthodox churches in the world and a landmark of the Belgrade skyline."
    },
    {
     "id": "nikola-tesla-museum",
     "name": "Nikola Tesla Museum",
     "area": "Vračar",
     "kind": "museum",
     "admission": "paid",
     "setting": "indoor",
     "why": "Museum dedicated to the inventor Nikola Tesla, visited with a guided tour."
    },
    {
     "id": "ada-ciganlija",
     "name": "Ada Ciganlija",
     "area": "Čukarica",
     "kind": "nature",
     "admission": "free",
     "setting": "outdoor",
     "why": "River island turned recreation area with a lake, beaches and trails, popular in summer.",
     "family": true
    },
    {
     "id": "zemun-quay-gardos",
     "name": "Zemun Quay & Gardoš",
     "area": "Zemun",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Riverside old town of Zemun on the Danube, with cafés, a promenade and the Gardoš hill above.",
     "gem": true
    },
    {
     "id": "museum-of-yugoslavia",
     "name": "Museum of Yugoslavia",
     "area": "Dedinje",
     "kind": "museum",
     "admission": "check",
     "setting": "indoor",
     "why": "Museum about 20th-century Yugoslavia, in a complex that includes the House of Flowers.",
     "gem": true
    }
   ]
  },
  {
   "id": "skopje",
   "name": "Skopje",
   "country": "North Macedonia",
   "countryCode": "MK",
   "aliases": [
    "скопје",
    "skoplje"
   ],
   "places": [
    {
     "id": "stone-bridge",
     "name": "Stone Bridge",
     "area": "Centar",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Ottoman-era stone bridge over the Vardar river and one of the symbols of Skopje."
    },
    {
     "id": "old-bazaar-carsija",
     "name": "Old Bazaar (Čaršija)",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "One of the largest preserved Ottoman-era bazaars in the Balkans, with craft shops and cafés."
    },
    {
     "id": "macedonia-square",
     "name": "Macedonia Square",
     "area": "Centar",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Central square with large statues and monuments, the heart of the city centre."
    },
    {
     "id": "kale-fortress",
     "name": "Kale Fortress",
     "area": "Old Town",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Hilltop fortress above the Old Bazaar with views over the city."
    },
    {
     "id": "mother-teresa-memorial-house",
     "name": "Mother Teresa Memorial House",
     "area": "Centar",
     "kind": "museum",
     "admission": "check",
     "setting": "indoor",
     "why": "Memorial museum dedicated to Mother Teresa, who was born in Skopje."
    },
    {
     "id": "museum-of-the-macedonian-struggle",
     "name": "Museum of the Macedonian Struggle",
     "area": "Centar",
     "kind": "museum",
     "admission": "check",
     "setting": "indoor",
     "why": "Museum presenting the history of the Macedonian struggle for independence."
    },
    {
     "id": "matka-canyon",
     "name": "Matka Canyon",
     "area": "Saraj",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Canyon and reservoir on the Treska river west of Skopje, popular for walks and boat trips.",
     "gem": true,
     "note": "Boat trips are paid separately."
    },
    {
     "id": "millennium-cross-on-vodno",
     "name": "Millennium Cross on Vodno",
     "area": "Vodno",
     "kind": "viewpoint",
     "admission": "check",
     "setting": "outdoor",
     "why": "Large cross on Vodno mountain above the city, a popular viewpoint reached by trail or cable car.",
     "gem": true
    }
   ]
  },
  {
   "id": "ohrid",
   "name": "Ohrid",
   "country": "North Macedonia",
   "countryCode": "MK",
   "aliases": [
    "охрид"
   ],
   "places": [
    {
     "id": "ohrid-old-town",
     "name": "Ohrid Old Town",
     "area": "Old Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Historic hillside town with narrow lanes, churches and views over the lake."
    },
    {
     "id": "lake-ohrid",
     "name": "Lake Ohrid",
     "area": "Lakeshore",
     "kind": "water",
     "admission": "free",
     "setting": "outdoor",
     "why": "One of Europe's oldest lakes, shared with Albania, with public shoreline and lakeside promenades.",
     "family": true,
     "note": "Private beach clubs charge for sunbeds; the public shoreline does not."
    },
    {
     "id": "church-of-st-john-at-kaneo",
     "name": "Church of St. John at Kaneo",
     "area": "Kaneo",
     "kind": "religious",
     "admission": "check",
     "setting": "outdoor",
     "why": "Small medieval church on a cliff above the lake, one of Ohrid's most photographed views."
    },
    {
     "id": "samuels-fortress",
     "name": "Samuel's Fortress",
     "area": "Old Town",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Hilltop fortress above the old town with views over the town and lake."
    },
    {
     "id": "ancient-theatre-of-ohrid",
     "name": "Ancient Theatre of Ohrid",
     "area": "Old Town",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Hellenistic-era theatre in the old town, still used for summer events."
    },
    {
     "id": "church-of-st-sophia",
     "name": "Church of St. Sophia",
     "area": "Old Town",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "Medieval Byzantine church known for its frescoes, also used for concerts."
    },
    {
     "id": "plaosnik-st-clement-and-panteleimon",
     "name": "Plaošnik & St. Clement and Panteleimon",
     "area": "Plaošnik",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "Archaeological site and church linked to St. Clement of Ohrid and early Slavic literacy.",
     "gem": true
    },
    {
     "id": "galicica-national-park",
     "name": "Galičica National Park",
     "area": "Galičica",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Mountain national park between Lake Ohrid and Lake Prespa, with hiking and viewpoints.",
     "gem": true
    }
   ]
  },
  {
   "id": "sarajevo",
   "name": "Sarajevo",
   "country": "Bosnia and Herzegovina",
   "countryCode": "BA",
   "aliases": [
    "сарајево"
   ],
   "places": [
    {
     "id": "bascarsija",
     "name": "Baščaršija",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Historic bazaar quarter with Ottoman-era streets, craft shops and cafés."
    },
    {
     "id": "sebilj",
     "name": "Sebilj",
     "area": "Baščaršija",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Ornate wooden fountain in Baščaršija's main square and a Sarajevo landmark."
    },
    {
     "id": "latin-bridge",
     "name": "Latin Bridge",
     "area": "Old Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Stone bridge over the Miljacka river, near the site linked to the 1914 assassination of Archduke Franz Ferdinand."
    },
    {
     "id": "gazi-husrev-begs-mosque",
     "name": "Gazi Husrev-beg's Mosque",
     "area": "Baščaršija",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "16th-century mosque, one of the most important Ottoman buildings in Bosnia and Herzegovina. Modest dress is expected."
    },
    {
     "id": "vijecnica-city-hall",
     "name": "Vijećnica (City Hall)",
     "area": "Old Town",
     "kind": "history",
     "admission": "check",
     "setting": "indoor",
     "why": "Neo-Moorish building on the Miljacka river, once the national library, restored after wartime damage."
    },
    {
     "id": "sarajevo-war-tunnel-museum",
     "name": "Sarajevo War Tunnel Museum",
     "area": "Butmir",
     "kind": "museum",
     "admission": "paid",
     "setting": "indoor",
     "why": "Museum at a surviving section of the tunnel dug under the airport during the 1990s siege."
    },
    {
     "id": "yellow-fortress-zuta-tabija",
     "name": "Yellow Fortress (Žuta Tabija)",
     "area": "Old Town",
     "kind": "viewpoint",
     "admission": "free",
     "setting": "outdoor",
     "why": "Hillside fortress ruin and popular viewpoint over the old town, especially at sunset.",
     "gem": true
    },
    {
     "id": "vrelo-bosne",
     "name": "Vrelo Bosne",
     "area": "Ilidža",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Source of the Bosna river in a landscaped park at the edge of the city, with paths and horse-drawn carriages.",
     "family": true
    }
   ]
  },
  {
   "id": "mostar",
   "name": "Mostar",
   "country": "Bosnia and Herzegovina",
   "countryCode": "BA",
   "aliases": [],
   "places": [
    {
     "id": "stari-most-old-bridge",
     "name": "Stari Most (Old Bridge)",
     "area": "Old Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Reconstructed Ottoman bridge over the Neretva river and a UNESCO World Heritage site."
    },
    {
     "id": "kujundziluk",
     "name": "Kujundžiluk",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Old bazaar street by the bridge with souvenir and craft shops."
    },
    {
     "id": "koski-mehmed-pasha-mosque",
     "name": "Koski Mehmed Pasha Mosque",
     "area": "Old Town",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "17th-century mosque by the river, known for views of the bridge."
    },
    {
     "id": "karadjoz-bey-mosque",
     "name": "Karađoz-bey Mosque",
     "area": "Old Town",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "16th-century mosque in the old town of Mostar."
    },
    {
     "id": "blagaj-tekke",
     "name": "Blagaj Tekke",
     "area": "Blagaj",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "Dervish monastery beside the Buna river spring near Mostar.",
     "gem": true
    },
    {
     "id": "kravica-waterfalls",
     "name": "Kravica Waterfalls",
     "area": "Studenci",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Wide tufa waterfall on the Trebižat river south of Mostar, a popular summer swimming spot.",
     "family": true
    },
    {
     "id": "pocitelj",
     "name": "Počitelj",
     "area": "Počitelj",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Historic fortified village on the Neretva between Mostar and the coast, with a hilltop fort.",
     "gem": true
    }
   ]
  },
  {
   "id": "zagreb",
   "name": "Zagreb",
   "country": "Croatia",
   "countryCode": "HR",
   "aliases": [],
   "places": [
    {
     "id": "ban-jelacic-square",
     "name": "Ban Jelačić Square",
     "area": "Lower Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Main city square and meeting point, at the foot of the Upper Town."
    },
    {
     "id": "upper-town-gornji-grad",
     "name": "Upper Town (Gornji Grad)",
     "area": "Upper Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Medieval hilltop district with cobbled streets, St. Mark's Church and Lotrščak Tower."
    },
    {
     "id": "st-marks-church",
     "name": "St. Mark's Church",
     "area": "Upper Town",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "Church known for its colourful tiled roof; interior access can be limited."
    },
    {
     "id": "lotrscak-tower",
     "name": "Lotrščak Tower",
     "area": "Upper Town",
     "kind": "viewpoint",
     "admission": "check",
     "setting": "both",
     "why": "13th-century tower with views over the city; a cannon is fired from it at noon."
    },
    {
     "id": "dolac-market",
     "name": "Dolac Market",
     "area": "Lower Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Open-air farmers' market just above Ban Jelačić Square."
    },
    {
     "id": "zagreb-cathedral",
     "name": "Zagreb Cathedral",
     "area": "Kaptol",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "Neo-Gothic cathedral with twin spires that dominate the skyline."
    },
    {
     "id": "maksimir-park",
     "name": "Maksimir Park",
     "area": "Maksimir",
     "kind": "park",
     "admission": "free",
     "setting": "outdoor",
     "why": "Large landscaped city park with lakes and paths, home to the city zoo.",
     "family": true,
     "note": "The zoo inside the park is ticketed."
    },
    {
     "id": "museum-of-broken-relationships",
     "name": "Museum of Broken Relationships",
     "area": "Upper Town",
     "kind": "museum",
     "admission": "paid",
     "setting": "indoor",
     "why": "Small museum of personal objects and stories donated by people after the end of relationships.",
     "gem": true
    },
    {
     "id": "mirogoj-cemetery",
     "name": "Mirogoj Cemetery",
     "area": "Gornji Grad–Medveščak",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Monumental cemetery known for its arcades and park-like paths. Visit respectfully.",
     "gem": true
    }
   ]
  },
  {
   "id": "split",
   "name": "Split",
   "country": "Croatia",
   "countryCode": "HR",
   "aliases": [],
   "places": [
    {
     "id": "diocletians-palace",
     "name": "Diocletian's Palace",
     "area": "Old Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Roman palace that forms the core of Split's old town, with streets, courtyards and shops inside its walls.",
     "note": "Some parts, such as the basement halls, are ticketed."
    },
    {
     "id": "peristyle",
     "name": "Peristyle",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Central courtyard of Diocletian's Palace and the old town's main gathering place."
    },
    {
     "id": "riva-promenade",
     "name": "Riva Promenade",
     "area": "Waterfront",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Palm-lined seafront promenade along the old town, lined with cafés."
    },
    {
     "id": "marjan-hill",
     "name": "Marjan Hill",
     "area": "Marjan",
     "kind": "nature",
     "admission": "free",
     "setting": "outdoor",
     "why": "Forested hill park on the Split peninsula with walking paths and viewpoints.",
     "family": true
    },
    {
     "id": "cathedral-of-st-domnius-bell-tower",
     "name": "Cathedral of St. Domnius & Bell Tower",
     "area": "Old Town",
     "kind": "religious",
     "admission": "paid",
     "setting": "indoor",
     "why": "Cathedral built from Diocletian's mausoleum, with a bell tower that can be climbed."
    },
    {
     "id": "bacvice-beach",
     "name": "Bačvice Beach",
     "area": "Bačvice",
     "kind": "water",
     "admission": "free",
     "setting": "outdoor",
     "why": "Sandy city beach popular with locals and known for the ball game picigin.",
     "family": true,
     "note": "Sunbeds and beach clubs may charge."
    },
    {
     "id": "green-market-pazar",
     "name": "Green Market (Pazar)",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Daily open-air market beside the old town walls."
    },
    {
     "id": "klis-fortress",
     "name": "Klis Fortress",
     "area": "Klis",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Hilltop fortress on a rocky ridge above Split with wide views.",
     "gem": true
    }
   ]
  },
  {
   "id": "dubrovnik",
   "name": "Dubrovnik",
   "country": "Croatia",
   "countryCode": "HR",
   "aliases": [],
   "places": [
    {
     "id": "stradun",
     "name": "Stradun",
     "area": "Old Town",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Main limestone-paved street of the walled Old Town."
    },
    {
     "id": "dubrovnik-city-walls",
     "name": "Dubrovnik City Walls",
     "area": "Old Town",
     "kind": "history",
     "admission": "paid",
     "setting": "outdoor",
     "why": "Walkable circuit of the medieval walls around the Old Town, with views of rooftops and sea."
    },
    {
     "id": "old-port",
     "name": "Old Port",
     "area": "Old Town",
     "kind": "water",
     "admission": "free",
     "setting": "outdoor",
     "why": "Small harbour at the edge of the Old Town."
    },
    {
     "id": "lovrijenac-fort",
     "name": "Lovrijenac Fort",
     "area": "Pile",
     "kind": "history",
     "admission": "paid",
     "setting": "outdoor",
     "why": "Fort on a rock outside the western walls of the Old Town."
    },
    {
     "id": "rectors-palace",
     "name": "Rector's Palace",
     "area": "Old Town",
     "kind": "museum",
     "admission": "paid",
     "setting": "indoor",
     "why": "Historic palace housing the Dubrovnik Cultural History Museum."
    },
    {
     "id": "mount-srdj",
     "name": "Mount Srđ",
     "area": "Srđ",
     "kind": "viewpoint",
     "admission": "check",
     "setting": "outdoor",
     "why": "Hill above the city with panoramic views, reachable by cable car or on foot."
    },
    {
     "id": "banje-beach",
     "name": "Banje Beach",
     "area": "Ploče",
     "kind": "water",
     "admission": "free",
     "setting": "outdoor",
     "why": "City beach just outside the Old Town.",
     "family": true,
     "note": "Sunbeds and beach clubs may charge."
    },
    {
     "id": "lokrum-island",
     "name": "Lokrum Island",
     "area": "Lokrum",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Small island a short boat ride from the Old Town, with gardens and trails.",
     "gem": true,
     "note": "The boat trip is paid."
    }
   ]
  },
  {
   "id": "ljubljana",
   "name": "Ljubljana",
   "country": "Slovenia",
   "countryCode": "SI",
   "aliases": [],
   "places": [
    {
     "id": "triple-bridge",
     "name": "Triple Bridge",
     "area": "Center",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Three adjoining bridges linking the old town to Prešeren Square, designed by Jože Plečnik."
    },
    {
     "id": "preseren-square",
     "name": "Prešeren Square",
     "area": "Center",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Central square at the heart of the city centre."
    },
    {
     "id": "dragon-bridge",
     "name": "Dragon Bridge",
     "area": "Center",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Early 20th-century bridge over the Ljubljanica river, guarded by dragon statues."
    },
    {
     "id": "central-market",
     "name": "Central Market",
     "area": "Center",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Market along the river with arcades by architect Jože Plečnik."
    },
    {
     "id": "ljubljana-castle",
     "name": "Ljubljana Castle",
     "area": "Castle Hill",
     "kind": "history",
     "admission": "check",
     "setting": "both",
     "why": "Hilltop castle above the old town; the grounds are open to walk, with some parts ticketed."
    },
    {
     "id": "tivoli-park",
     "name": "Tivoli Park",
     "area": "Tivoli",
     "kind": "park",
     "admission": "free",
     "setting": "outdoor",
     "why": "Large city park with tree-lined avenues, gardens and playgrounds.",
     "family": true
    },
    {
     "id": "ljubljanica-riverside",
     "name": "Ljubljanica Riverside",
     "area": "Center",
     "kind": "water",
     "admission": "free",
     "setting": "outdoor",
     "why": "Embankments through the old town lined with cafés and walking paths."
    },
    {
     "id": "metelkova",
     "name": "Metelkova",
     "area": "Metelkova",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Self-managed alternative cultural quarter with street art.",
     "gem": true
    },
    {
     "id": "national-and-university-library",
     "name": "National and University Library",
     "area": "Center",
     "kind": "history",
     "admission": "check",
     "setting": "indoor",
     "why": "Landmark library building by architect Jože Plečnik.",
     "gem": true
    }
   ]
  },
  {
   "id": "kotor",
   "name": "Kotor",
   "country": "Montenegro",
   "countryCode": "ME",
   "aliases": [
    "котор"
   ],
   "places": [
    {
     "id": "kotor-old-town",
     "name": "Kotor Old Town",
     "area": "Old Town",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Walled medieval town at the end of the Bay of Kotor, with narrow lanes and squares."
    },
    {
     "id": "bay-of-kotor",
     "name": "Bay of Kotor",
     "area": "Bay",
     "kind": "nature",
     "admission": "free",
     "setting": "outdoor",
     "why": "Deep, fjord-like bay surrounded by mountains, with small historic towns on its shores.",
     "family": true
    },
    {
     "id": "fortress-of-san-giovanni",
     "name": "Fortress of San Giovanni",
     "area": "Old Town",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "City walls and a steep stair path climbing above the old town with wide views."
    },
    {
     "id": "cathedral-of-saint-tryphon",
     "name": "Cathedral of Saint Tryphon",
     "area": "Old Town",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "Medieval cathedral on the main square of the old town."
    },
    {
     "id": "perast",
     "name": "Perast",
     "area": "Perast",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Baroque seaside village on the bay, facing two small islands.",
     "gem": true
    },
    {
     "id": "our-lady-of-the-rocks",
     "name": "Our Lady of the Rocks",
     "area": "Perast",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "Small artificial island with a church in the bay near Perast, reached by boat.",
     "gem": true,
     "note": "The boat trip is paid."
    }
   ]
  },
  {
   "id": "tirana",
   "name": "Tirana",
   "country": "Albania",
   "countryCode": "AL",
   "aliases": [
    "tirane",
    "tiranë"
   ],
   "places": [
    {
     "id": "skanderbeg-square",
     "name": "Skanderbeg Square",
     "area": "Center",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Main square of the city, surrounded by museums and government buildings."
    },
    {
     "id": "ethem-bey-mosque",
     "name": "Et'hem Bey Mosque",
     "area": "Center",
     "kind": "religious",
     "admission": "check",
     "setting": "both",
     "why": "Early 19th-century mosque on Skanderbeg Square."
    },
    {
     "id": "national-history-museum",
     "name": "National History Museum",
     "area": "Center",
     "kind": "museum",
     "admission": "check",
     "setting": "indoor",
     "why": "Large museum on Skanderbeg Square covering Albanian history."
    },
    {
     "id": "grand-park-of-tirana",
     "name": "Grand Park of Tirana",
     "area": "South Center",
     "kind": "park",
     "admission": "free",
     "setting": "outdoor",
     "why": "Large city park with an artificial lake and walking paths.",
     "family": true
    },
    {
     "id": "blloku",
     "name": "Blloku",
     "area": "Blloku",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Former restricted neighbourhood turned district of cafés, shops and restaurants."
    },
    {
     "id": "pyramid-of-tirana",
     "name": "Pyramid of Tirana",
     "area": "Center",
     "kind": "history",
     "admission": "check",
     "setting": "outdoor",
     "why": "Distinctive pyramid-shaped building from the communist era, now repurposed.",
     "gem": true
    },
    {
     "id": "bunkart-1",
     "name": "Bunk'Art 1",
     "area": "Outskirts",
     "kind": "museum",
     "admission": "paid",
     "setting": "indoor",
     "why": "Museum inside a former nuclear bunker about the communist period.",
     "gem": true
    },
    {
     "id": "dajti-ekspres",
     "name": "Dajti Ekspres",
     "area": "Dajti",
     "kind": "viewpoint",
     "admission": "paid",
     "setting": "outdoor",
     "why": "Cable car up Mount Dajti above Tirana with views over the city."
    }
   ]
  },
  {
   "id": "sofia",
   "name": "Sofia",
   "country": "Bulgaria",
   "countryCode": "BG",
   "aliases": [
    "софия"
   ],
   "places": [
    {
     "id": "alexander-nevsky-cathedral",
     "name": "Alexander Nevsky Cathedral",
     "area": "Center",
     "kind": "religious",
     "admission": "check",
     "setting": "indoor",
     "why": "Large Orthodox cathedral and one of Sofia's well-known landmarks."
    },
    {
     "id": "vitosha-boulevard",
     "name": "Vitosha Boulevard",
     "area": "Center",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Pedestrian main street with cafés and shops, with views of Vitosha mountain."
    },
    {
     "id": "boyana-church",
     "name": "Boyana Church",
     "area": "Boyana",
     "kind": "religious",
     "admission": "paid",
     "setting": "indoor",
     "why": "Medieval church with frescoes, a UNESCO World Heritage site."
    },
    {
     "id": "central-sofia-market-hall",
     "name": "Central Sofia Market Hall",
     "area": "Center",
     "kind": "street",
     "admission": "free",
     "setting": "outdoor",
     "why": "Historic covered market hall in the city centre."
    },
    {
     "id": "national-museum-of-history",
     "name": "National Museum of History",
     "area": "Boyana",
     "kind": "museum",
     "admission": "check",
     "setting": "indoor",
     "why": "Large museum of Bulgarian history in a former government residence."
    },
    {
     "id": "borisova-gradina",
     "name": "Borisova Gradina",
     "area": "Center",
     "kind": "park",
     "admission": "free",
     "setting": "outdoor",
     "why": "Large central park with tree-lined paths and sports areas.",
     "family": true
    },
    {
     "id": "vitosha-nature-park",
     "name": "Vitosha Nature Park",
     "area": "Vitosha",
     "kind": "nature",
     "admission": "check",
     "setting": "outdoor",
     "why": "Mountain park above the city with hiking trails and a ski area in winter."
    },
    {
     "id": "ancient-serdica-remains",
     "name": "Ancient Serdica Remains",
     "area": "Center",
     "kind": "history",
     "admission": "free",
     "setting": "outdoor",
     "why": "Remains of the Roman city of Serdica visible around the city centre and at a metro station.",
     "gem": true
    }
   ]
  }
 ]
};
