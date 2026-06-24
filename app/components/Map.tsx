"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Персонализиран теракотен пин с пулсиращ ореол
const icon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:22px;height:22px;">
           <div class="pin-pulse" style="position:absolute;inset:0;"></div>
           <div class="pin-dot" style="position:absolute;inset:0;"></div>
         </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -22],
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
      className="w-full h-56 sm:h-64 z-0"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Recenter lat={lat} lon={lon} />
      <Marker position={[lat, lon]} icon={icon}>
        <Popup>{address || "Ти си тук"}</Popup>
      </Marker>
    </MapContainer>
  );
}
