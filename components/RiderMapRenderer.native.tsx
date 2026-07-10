// Native map renderer using react-native-maps
import React from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors } from '@/constants/theme';

export interface MapMarkerData {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  color?: string;
}

export interface MapPolylineData {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color?: string;
}

export interface RiderMapRendererProps {
  markers: MapMarkerData[];
  polylines: MapPolylineData[];
  initialLat?: number;
  initialLng?: number;
  mapRef?: React.RefObject<MapView>;
}

export default function RiderMapRenderer({
  markers,
  polylines,
  initialLat = 0.3476,
  initialLng = 32.5825,
  mapRef,
}: RiderMapRendererProps) {
  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }}
      showsUserLocation
      showsMyLocationButton
    >
      {markers.map(m => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.lat, longitude: m.lng }}
          title={m.title}
          description={m.description}
          pinColor={m.color || Colors.gold}
        />
      ))}
      {polylines.map((p, i) => (
        <Polyline
          key={i}
          coordinates={[
            { latitude: p.from.lat, longitude: p.from.lng },
            { latitude: p.to.lat, longitude: p.to.lng },
          ]}
          strokeColor={p.color || Colors.gold}
          strokeWidth={2.5}
          lineDashPattern={[5, 5]}
        />
      ))}
    </MapView>
  );
}
