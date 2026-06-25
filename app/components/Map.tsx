"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function makeIcon(pulsing: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:36px;height:36px;">
             <div class="${pulsing ? "pin-pulse-fast" : "pin-pulse"}"
                  style="position:absolute;inset:0;border-radius:50%;"></div>
             <div class="pin-dot"
                  style="position:absolute;top:7px;left:7px;width:22px;height:22px;"></div>
           </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function Recenter({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], zoom, { animate: true });
  }, [lat, lon, zoom, map]);
  return null;
}

interface MapProps {
  lat: number;
  lon: number;
  address: string;
  pulsing?: boolean;
  zoom?: number;
}

export default function Map({ lat, lon, address, pulsing = false, zoom = 15 }: MapProps) {
  const icon = useMemo(() => makeIcon(pulsing), [pulsing]);

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={zoom}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={false}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a> · <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
      />
      <Recenter lat={lat} lon={lon} zoom={zoom} />
      <Marker position={[lat, lon]} icon={icon}>
        <Popup>{address || "📍"}</Popup>
      </Marker>
    </MapContainer>
  );
}
