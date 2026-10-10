import { useEffect, useRef, useState } from 'react';
import { mapZoom, validCoordinate } from '@/lib/maps/webMap';
import type { DiscoveryMapProps } from './DiscoveryMap.types';

export function DiscoveryMap(props: DiscoveryMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | null = null;
    if (
      !element.current ||
      !validCoordinate(props.userLatitude, props.userLongitude)
    )
      return;
    void import('leaflet')
      .then((L) => {
        if (disposed || !element.current) return;
        map = L.map(element.current, { scrollWheelZoom: false }).setView(
          [props.userLatitude, props.userLongitude],
          mapZoom(props.latitudeDelta)
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          keepBuffer: 1,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .addTo(map)
          .on('tileerror', () => {
            if (!disposed) setFailed(true);
          });
        L.circleMarker([props.userLatitude, props.userLongitude], {
          radius: 8,
          color: '#FF6B57',
        })
          .addTo(map)
          .bindTooltip(props.myLocationLabel);
        for (const business of props.businesses) {
          if (!validCoordinate(business.lat, business.lng)) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = business.name;
          button.style.minHeight = '44px';
          button.onclick = () =>
            current.current.onBusinessPress(business.businessId);
          L.marker([business.lat, business.lng], {
            keyboard: true,
            title: business.name,
            icon: L.divIcon({
              className: '',
              html: '<span style="display:block;width:20px;height:20px;border-radius:50%;background:#2F6BFF;border:2px solid white"></span>',
              iconSize: [24, 24],
            }),
          })
            .addTo(map)
            .bindPopup(button);
        }
        map.invalidateSize();
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map?.remove();
      map = null;
    };
  }, [
    props.userLatitude,
    props.userLongitude,
    props.latitudeDelta,
    props.businesses,
    props.myLocationLabel,
  ]);
  return (
    <section
      dir="rtl"
      style={{ width: '100%', height: '100%', minHeight: 360 }}
    >
      <section
        ref={element}
        aria-label="מפת העסקים בסביבה"
        style={{ minHeight: 330, height: '85%', width: '100%' }}
      />
      <p style={{ padding: 8, margin: 0 }}>
        מפה: OpenStreetMap. אפשר לבחור עסק גם ברשימה.
      </p>
      {failed ? (
        <output>חלק מהמפה לא נטען. רשימת העסקים נשארת זמינה.</output>
      ) : null}
    </section>
  );
}
