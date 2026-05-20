"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons (webpack strips them)
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], 15, { animate: true });
  }, [lat, lon, map]);
  return null;
}

interface MapProps {
  lat: number;
  lon: number;
  address: string;
}

export default function Map({ lat, lon, address }: MapProps) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={15}
      className="w-full h-64 rounded-2xl z-0"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={lat} lon={lon} />
      <Marker position={[lat, lon]} icon={icon}>
        <Popup>{address || "Ти си тук"}</Popup>
      </Marker>
    </MapContainer>
  );
}
