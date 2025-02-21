import axios from "axios";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { XMLParser } from "fast-xml-parser";
import * as csvWriter from "csv-writer";

dotenv.config();

// **API Key for OpenCageData**
const API_KEY = "6844eefc83f549f08318652e3b5db338";
if (!API_KEY) {
  console.error("❌ Missing OpenCageData API Key!");
  process.exit(1);
}

// **Input & Output Files**
const INPUT_FILE = "Fornecimento_CAMTAUA.kml";
const OUTPUT_FILE = "location_hierarchy.csv";

// **CSV Writer Configuration**
const csv = csvWriter.createObjectCsvWriter({
  path: OUTPUT_FILE,
  header: [
    { id: "latitude", title: "Latitude" },
    { id: "longitude", title: "Longitude" },
    { id: "postcode", title: "Postcode" },
    { id: "state", title: "State" },
    { id: "state_code", title: "State Code" },
    { id: "municipality", title: "Municipality" },
    { id: "municipality_code", title: "Municipality Code" },
    { id: "district", title: "District" },
    { id: "district_code", title: "District Code" },
    { id: "community", title: "Community" },
    { id: "community_code", title: "Community Code" },
  ],
});

// **Generate Short Codes for location names**
const generateShortCode = (name: string): string => {
  return name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
};

// **Extract Coordinates from KML File**
const extractCoordinatesFromKML = (): { latitude: string; longitude: string }[] => {
  const data = fs.readFileSync(INPUT_FILE, "utf8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsedData = parser.parse(data);

  let coordinatesList: { latitude: string; longitude: string }[] = [];

  if (parsedData.kml?.Document?.Placemark) {
    const placemarks = Array.isArray(parsedData.kml.Document.Placemark)
      ? parsedData.kml.Document.Placemark
      : [parsedData.kml.Document.Placemark];

    coordinatesList = placemarks.map((placemark: any) => {
      if (placemark.Point && placemark.Point.coordinates) {
        const coords = placemark.Point.coordinates.trim().split(",");
        return {
          longitude: coords[0].trim(),
          latitude: coords[1].trim(),
        };
      }
    }).filter(Boolean);
  }

  if (coordinatesList.length === 0) {
    console.error("❌ No coordinates found in KML file!");
    process.exit(1);
  }

  return coordinatesList;
};

// **Fetch Location Data from OpenCage API**
const fetchLocationData = async (latitude: string, longitude: string) => {
  try {
    const apiUrl = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${API_KEY}&language=pt&countrycode=br`;
    const response = await axios.get(apiUrl);
    const results = response.data.results;

    if (results.length === 0) {
      console.warn(`⚠️ No results for (${latitude}, ${longitude})`);
      return null;
    }

    const location = results[0].components;
    return {
      postcode: location.postcode || "Unknown",
      state: location.state || "Unknown",
      state_code: generateShortCode(location.state || "Unknown"),
      municipality: location.city || location.town || location.village || "Unknown",
      municipality_code: generateShortCode(location.city || location.town || location.village || "Unknown"),
      district: location.suburb || location.county || "Unknown",
      district_code: generateShortCode(location.suburb || location.county || "Unknown"),
      community: location.hamlet || location.neighbourhood || "Unknown",
      community_code: generateShortCode(location.hamlet || location.neighbourhood || "Unknown"),
    };
  } catch (error) {
    console.error(`❌ API Error for (${latitude}, ${longitude}):`, error);
    return null;
  }
};

// **Process Coordinates & Write to CSV**
const processCoordinates = async () => {
  try {
    const coordinates = extractCoordinatesFromKML();
    let outputData: any[] = [];

    for (const { latitude, longitude } of coordinates) {
      console.log(`Processing: (${latitude}, ${longitude})`);

      const locationData = await fetchLocationData(latitude, longitude);
      if (!locationData) continue;

      outputData.push({
        latitude,
        longitude,
        ...locationData,
      });
    }

    await csv.writeRecords(outputData);
    console.log(`✅ Done! Data saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("❌ Error processing data:", error);
  }
};

// **Run the Script**
processCoordinates();
