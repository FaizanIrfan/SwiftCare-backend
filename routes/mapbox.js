const express = require('express');
const router = express.Router();
const Doctor = require('../models/doctor');
const Review = require('../models/review');

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '';

function extractCoordinates(value) {
  const rawCoordinates = value?.geo?.coordinates || value?.coordinates;
  if (!Array.isArray(rawCoordinates) || rawCoordinates.length < 2) return null;

  const lng = Number(rawCoordinates[0]);
  const lat = Number(rawCoordinates[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return [lng, lat];
}

function buildDoctorMarkers(doctors, nearbyDoctorIds = new Set()) {
  return doctors
    .map((doctor) => {
      const coordinates = extractCoordinates(doctor.location) || extractCoordinates(doctor.locationCoordinates);
      if (!coordinates) return null;

      const specialty = String(doctor.specialty || doctor.specialization || doctor.professionalInfo?.specialization || 'Doctor');
      const locationLabel = String(doctor.locationLabel || doctor.location?.label || doctor.location?.clinicName || 'Clinic location');
      const fee = String(doctor.fee || (doctor.consultationFee ? `RS. ${doctor.consultationFee}` : 'Contact'));
      const rating = Number(doctor.averageRating || 0);
      const reviewCount = Number(doctor.reviewCount || 0);
      const registered = doctor.accountStatus?.registered !== false;
      const availableDays = Array.isArray(doctor.schedule?.availableDays)
        ? doctor.schedule.availableDays
        : Array.isArray(doctor.availableDays)
          ? doctor.availableDays
          : [];

      return {
        id: String(doctor.id || doctor._id || ''),
        name: String(doctor.name || 'Doctor'),
        specialty,
        label: locationLabel,
        fee,
        rating: Number.isFinite(rating) ? rating : 0,
        reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
        registered,
        availableDays,
        coordinates,
        nearby: nearbyDoctorIds.has(String(doctor.id || doctor._id || '')),
      };
    })
    .filter(Boolean);
}

function buildStaticMapUrl(lng, lat, zoom) {
  const marker = `pin-s+2563eb(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${lng},${lat},${zoom},0/960x540?access_token=${MAPBOX_TOKEN}`;
}

/* --------------------------------------------------
   1. Static Map Redirect
   -------------------------------------------------- */
router.get('/static', (req, res) => {
  const lng = Number(req.query.lng);
  const lat = Number(req.query.lat);
  const zoom = Number(req.query.zoom || '14');

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return res.status(400).send('Invalid coordinates');
  }

  if (!MAPBOX_TOKEN) {
    return res.status(500).send('Mapbox token is not configured');
  }

  const mapUrl = buildStaticMapUrl(lng, lat, Number.isFinite(zoom) ? zoom : 14);
  res.redirect(302, mapUrl);
});

/* --------------------------------------------------
   2. HTML Embed Map for Clinic
   -------------------------------------------------- */
router.get('/embed', (req, res) => {
  const lng = Number(req.query.lng);
  const lat = Number(req.query.lat);
  const label = req.query.label || 'Clinic location';

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return res.status(400).send('Invalid coordinates');
  }

  const safeLabel = String(label).replace(/[<>&"']/g, '');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeLabel}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <style>
      html, body, #map { height: 100%; margin: 0; }
      body { overflow: hidden; background: #f8fafc; }
      .clinic-marker {
        position: relative;
        width: 22px;
        height: 22px;
        background: #ef4444;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        box-shadow: 0 10px 20px rgba(239, 68, 68, 0.35);
        transform: rotate(-45deg);
      }
      .clinic-marker::after {
        content: '';
        position: absolute;
        inset: 50% auto auto 50%;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: #fff;
        transform: translate(-50%, -50%);
      }
      .clinic-popup {
        font: 600 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .map-badge {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 500;
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
        padding: 8px 10px;
        border-radius: 9999px;
        font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: 0.02em;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div class="map-badge">Drag or scroll to zoom</div>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const map = L.map('map', { scrollWheelZoom: true }).setView([${lat}, ${lng}], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const marker = L.marker([${lat}, ${lng}], {
        icon: L.divIcon({
          className: 'clinic-marker-wrapper',
          html: '<div class="clinic-marker"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        }),
      }).addTo(map);

      marker.bindPopup('<div class="clinic-popup">${safeLabel}<br/><span style="color:#64748b;font-weight:500;">${lat.toFixed(6)}, ${lng.toFixed(6)}</span></div>').openPopup();
    </script>
  </body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

/* --------------------------------------------------
   3. HTML Embed Map for All Doctors
   -------------------------------------------------- */
router.get('/doctors-map', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasUserLocation = Number.isFinite(lat) && Number.isFinite(lng);

    const [doctorsData, reviewsData] = await Promise.all([
      Doctor.find().sort({ createdAt: -1 }).lean(),
      Review.find().lean()
    ]);

    let nearbyDoctorIds = new Set();
    if (hasUserLocation) {
      const nearbyDoctors = await Doctor.find({
        'location.geo': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            $maxDistance: 5000
          }
        }
      }).lean();
      nearbyDoctorIds = new Set(nearbyDoctors.map((doctor) => String(doctor._id)));
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const dynamicApiBase = `${protocol}://${host}`;

    const doctors = buildDoctorMarkers(doctorsData, nearbyDoctorIds);
    doctors.forEach((doctor) => {
      const dbDoctor = doctorsData.find((d) => String(d._id) === doctor.id);
      if (dbDoctor && typeof dbDoctor.image === 'string' && dbDoctor.image.trim()) {
        if (/^https?:\/\//i.test(dbDoctor.image)) {
          doctor.image = dbDoctor.image;
        } else {
          doctor.image = dynamicApiBase + '/' + dbDoctor.image.replace(/^\/+/, '');
        }
      }
    });

    const payload = {
      doctors: doctors.map((doctor) => {
        const matching = reviewsData.filter((review) => String(review.doctorId) === String(doctor.id));
        const reviewCount = matching.length || doctor.reviewCount || 0;
        const rating = matching.length
          ? matching.reduce((sum, review) => sum + Number(review.rating || 0), 0) / matching.length
          : doctor.rating || 0;

        return {
          ...doctor,
          reviewCount,
          rating,
        };
      }),
      currentLocation: hasUserLocation
        ? {
            lat,
            lng,
            label: req.query.label || 'Current location',
          }
        : null,
    };

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Doctors map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <style>
      html, body, #map { height: 100%; margin: 0; }
      body { overflow: hidden; background: #f8fafc; }
      .map-badge {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 500;
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
        padding: 8px 10px;
        border-radius: 9999px;
        font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: 0.02em;
        pointer-events: none;
      }
      .legend {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 500;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 14px;
        padding: 10px 12px;
        font: 500 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0f172a;
        box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
      }
      .legend-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
      }
      .dot.doctor { background: #ef4444; }
      .doctor-marker {
        position: relative;
        width: 22px;
        height: 22px;
        background: #ef4444;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        box-shadow: 0 10px 20px rgba(239, 68, 68, 0.35);
        transform: rotate(-45deg);
      }
      .doctor-marker.nearby {
        background: #2563eb;
        box-shadow: 0 10px 20px rgba(37, 99, 235, 0.35);
      }
      .doctor-marker::after {
        content: '';
        position: absolute;
        inset: 50% auto auto 50%;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: #fff;
        transform: translate(-50%, -50%);
      }
      .current-location-marker {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #0ea5e9;
        border: 3px solid #fff;
        box-shadow: 0 0 0 8px rgba(14, 165, 233, 0.2);
      }
      .popup {
        width: 236px;
        display: grid;
        gap: 10px;
        font: 500 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0f172a;
      }
      .popup-card {
        display: grid;
        grid-template-columns: 52px 1fr;
        gap: 10px;
        align-items: center;
      }
      .avatar {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        object-fit: cover;
        background: linear-gradient(135deg, #dbeafe, #e0f2fe);
      }
      .avatar-fallback {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #dbeafe, #e0f2fe);
        color: #1d4ed8;
        font-weight: 800;
      }
      .name {
        font-size: 15px;
        font-weight: 800;
        line-height: 1.2;
        margin: 0 0 2px;
      }
      .meta {
        color: #475569;
        font-size: 12px;
      }
      .stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .days {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .day-pill {
        border-radius: 9999px;
        padding: 4px 7px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 11px;
        font-weight: 700;
      }
      .pill {
        border-radius: 9999px;
        padding: 5px 8px;
        background: #f1f5f9;
        color: #0f172a;
        font-size: 11px;
        font-weight: 700;
      }
      .button {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
        border-radius: 10px;
        padding: 8px 10px;
        text-decoration: none;
        background: #2563eb;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
      }
      .button-text {
        color: #fff;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
      }
    </style>
  </head>
  <body>
    <div class="map-badge">All doctors with map markers</div>
    <div class="legend">
      <div><strong>Legend</strong></div>
      <div class="legend-row"><span class="dot doctor"></span> Doctor</div>
    </div>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const payload = ${JSON.stringify(payload)};

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(character) {
          if (character === '&') return '&amp;';
          if (character === '<') return '&lt;';
          if (character === '>') return '&gt;';
          if (character === '"') return '&quot;';
          return '&#39;';
        });
      }

      function doctorInitials(name) {
        return String(name || 'D')
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase();
      }

      function renderStarRating(rating) {
        const rounded = Math.max(0, Math.min(5, Number(rating || 0)));
        return rounded.toFixed(1) + ' / 5';
      }

      const map = L.map('map', { scrollWheelZoom: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const doctorIcon = L.divIcon({
        className: 'doctor-location-icon',
        html: '<div class="doctor-marker"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const nearbyDoctorIcon = L.divIcon({
        className: 'doctor-location-icon nearby',
        html: '<div class="doctor-marker nearby"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const currentLocationIcon = L.divIcon({
        className: 'current-location-icon',
        html: '<div class="current-location-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const markers = [];

      if (payload.currentLocation) {
        L.marker([payload.currentLocation.lat, payload.currentLocation.lng], { icon: currentLocationIcon })
          .addTo(map)
          .bindPopup('<div class="popup"><strong>You are here</strong><div class="meta">' + escapeHtml(payload.currentLocation.label) + '</div></div>', { maxWidth: 240 });
      }

      (payload.doctors || []).forEach((doctor) => {
        const marker = L.marker([doctor.coordinates[1], doctor.coordinates[0]], { icon: doctor.nearby ? nearbyDoctorIcon : doctorIcon }).addTo(map);

        const imageMarkup = doctor.image
          ? '<img class="avatar" src="' + escapeHtml(doctor.image) + '" alt="' + escapeHtml(doctor.name) + '" />'
          : '<div class="avatar-fallback">' + escapeHtml(doctorInitials(doctor.name)) + '</div>';

        const availableDaysMarkup = doctor.availableDays.length
          ? '<div class="days">' + doctor.availableDays.slice(0, 4).map((day) => '<span class="day-pill">' + escapeHtml(String(day).slice(0, 3)) + '</span>').join('') + '</div>'
          : '<div class="meta">No schedule posted</div>';

        const popupHtml =
          '<div class="popup">' +
            '<div class="popup-card">' +
              imageMarkup +
              '<div>' +
                '<div class="name">' + escapeHtml(doctor.name) + '</div>' +
                '<div class="meta">' + escapeHtml(doctor.specialty) + '</div>' +
                '<div class="meta">' + escapeHtml(doctor.label) + '</div>' +
                (doctor.nearby ? '<div class="meta" style="color:#2563eb;font-weight:700;">Nearby doctor</div>' : '') +
              '</div>' +
            '</div>' +
            availableDaysMarkup +
            '<div class="stats">' +
              '<span class="pill">' + escapeHtml(renderStarRating(doctor.rating)) + '</span>' +
              '<span class="pill">' + escapeHtml(String(doctor.reviewCount || 0)) + ' reviews</span>' +
              '<span class="pill">' + escapeHtml(doctor.fee) + '</span>' +
              '<span class="pill">' + (doctor.registered ? 'Registered' : 'Not registered') + '</span>' +
            '</div>' +
            '<a class="button" href="/doctor-profile?id=' + encodeURIComponent(doctor.id) + '" target="_blank" rel="noreferrer"><span class="button-text">Details</span></a>' +
          '</div>';

        marker.bindPopup(popupHtml, { maxWidth: 280 });
        markers.push(marker);
      });

      if (markers.length > 0) {
        const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
        map.fitBounds(bounds.pad(0.15));
      } else {
        map.setView([0, 0], 2);
      }
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (error) {
    console.error('Failed to render doctors map:', error);
    res.status(500).send('Unable to render doctors map');
  }
});

/* --------------------------------------------------
   4. HTML Embed Map for Nearby Doctors
   -------------------------------------------------- */
router.get('/nearby-doctors', async (req, res) => {
  const lng = Number(req.query.lng);
  const lat = Number(req.query.lat);
  const label = req.query.label || 'Current location';

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return res.status(400).send('Invalid coordinates');
  }

  try {
    const nearbyDoctors = await Doctor.find({
      'location.geo': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: 5000
        }
      }
    }).lean();

    const doctors = buildDoctorMarkers(nearbyDoctors);

    const payload = {
      currentLocation: { lat, lng, label },
      doctors,
    };

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nearby doctors</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <style>
      html, body, #map { height: 100%; margin: 0; }
      body { overflow: hidden; background: #f8fafc; }
      .map-badge {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 500;
        background: rgba(15, 23, 42, 0.9);
        color: #fff;
        padding: 8px 10px;
        border-radius: 9999px;
        font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: 0.02em;
        pointer-events: none;
      }
      .legend {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 500;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 14px;
        padding: 10px 12px;
        font: 500 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #0f172a;
        box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
      }
      .legend-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
      }
      .dot.current { background: #2563eb; }
      .dot.doctor { background: #ef4444; }
      .current-marker {
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #2563eb;
        border: 3px solid #fff;
        box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.16);
      }
      .doctor-marker {
        position: relative;
        width: 22px;
        height: 22px;
        background: #ef4444;
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        box-shadow: 0 10px 20px rgba(239, 68, 68, 0.35);
        transform: rotate(-45deg);
      }
      .doctor-marker::after {
        content: '';
        position: absolute;
        inset: 50% auto auto 50%;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: #fff;
        transform: translate(-50%, -50%);
      }
      .popup {
        font: 600 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .popup small {
        display: block;
        color: #64748b;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="map-badge">Nearby doctors within 5 km</div>
    <div class="legend">
      <div><strong>Legend</strong></div>
      <div class="legend-row"><span class="dot current"></span> Your location</div>
      <div class="legend-row"><span class="dot doctor"></span> Nearby doctor</div>
    </div>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const payload = ${JSON.stringify(payload)};

      function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(character) {
          if (character === '&') return '&amp;';
          if (character === '<') return '&lt;';
          if (character === '>') return '&gt;';
          if (character === '"') return '&quot;';
          return '&#39;';
        });
      }

      const map = L.map('map', { scrollWheelZoom: true }).setView([payload.currentLocation.lat, payload.currentLocation.lng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const currentLocationIcon = L.divIcon({
        className: 'current-location-icon',
        html: '<div class="current-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const doctorIcon = L.divIcon({
        className: 'doctor-location-icon',
        html: '<div class="doctor-marker"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });

      const markers = [];

      const currentMarker = L.marker([payload.currentLocation.lat, payload.currentLocation.lng], {
        icon: currentLocationIcon,
      }).addTo(map);
      currentMarker.bindPopup('<div class="popup">You are here<small>' + escapeHtml(payload.currentLocation.label) + '</small></div>');
      markers.push(currentMarker);

      (payload.doctors || []).forEach((doctor) => {
        const marker = L.marker([doctor.coordinates[1], doctor.coordinates[0]], { icon: doctorIcon }).addTo(map);
        marker.bindPopup('<div class="popup">' + escapeHtml(doctor.name) + '<small>' + escapeHtml(doctor.specialty) + ' · ' + escapeHtml(doctor.label) + '</small></div>');
        markers.push(marker);
      });

      if (markers.length > 1) {
        const bounds = L.latLngBounds(markers.map((marker) => marker.getLatLng()));
        map.fitBounds(bounds.pad(0.2));
      } else {
        map.setView([payload.currentLocation.lat, payload.currentLocation.lng], 14);
      }

      L.circle([payload.currentLocation.lat, payload.currentLocation.lng], {
        radius: 3500,
        color: '#2563eb',
        weight: 1,
        fillColor: '#2563eb',
        fillOpacity: 0.08,
      }).addTo(map);
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (error) {
    console.error('Failed to render nearby doctors map:', error);
    res.status(500).send('Unable to render nearby doctors map');
  }
});

/* --------------------------------------------------
   5. Address Geocoding
   -------------------------------------------------- */
router.get('/geocode', async (req, res) => {
  const address = req.query.address;
  if (!address || !String(address).trim()) {
    return res.status(400).json({ error: 'Address query parameter is required' });
  }

  const trimmedAddress = String(address).trim();

  // Try Mapbox first if token is available
  if (MAPBOX_TOKEN) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedAddress)}.json?limit=1&types=address,place,locality,neighborhood&access_token=${MAPBOX_TOKEN}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const feature = data?.features?.[0];
        const coordinates = feature?.center;

        if (Array.isArray(coordinates) && coordinates.length >= 2) {
          return res.json({
            label: feature?.place_name || trimmedAddress,
            coordinates: [Number(coordinates[0]), Number(coordinates[1])],
            source: 'address'
          });
        }
      }
    } catch (e) {
      console.warn('Mapbox geocoding failed, falling back to Nominatim:', e.message);
    }
  }

  // Fallback to Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmedAddress)}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const first = Array.isArray(data) ? data[0] : null;
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return res.json({
          label: first?.display_name || trimmedAddress,
          coordinates: [lng, lat],
          source: 'address'
        });
      }
    }
  } catch (e) {
    console.error('Nominatim geocoding failed:', e.message);
  }

  return res.status(404).json({ error: 'Unable to geocode address' });
});

/* --------------------------------------------------
   6. Reverse Geocoding
   -------------------------------------------------- */
router.get('/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  if (MAPBOX_TOKEN) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=1&access_token=${MAPBOX_TOKEN}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const placeName = data?.features?.[0]?.place_name;
        if (placeName) {
          return res.json({ label: placeName });
        }
      }
    } catch (e) {
      console.error('Mapbox reverse geocoding failed:', e.message);
    }
  }

  return res.status(404).json({ error: 'Unable to reverse geocode coordinates' });
});

module.exports = router;
