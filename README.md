# Weather Radar

A real-time weather radar visualization web application using strictly free resources. The application provides an interactive map interface with animated radar data.

## Features

- Real-time weather radar data from RainViewer API.
- Interactive dark-themed map using Leaflet.js
- Animated radar timeline with play/pause controls.
- Search bar for US States and all 195 countries.
- Favorite button to save your preferred default map view.
- Responsive design that works on both desktop and mobile devices.
- Custom-styled controls for better visibility.
- Keyboard controls for frame-by-frame navigation.

## Quick Start

I prefer to run this website as a docker container, but of course you could just clone and open index.html locally.

1. Clone this repository:
```bash
git clone https://github.com/timblazing/weather-radar.git
```

2. Build and run the Docker container:
```bash
cd weather-radar && docker-compose up -d --build
```

3. Open your browser and navigate to:
```
http://localhost:3004
```

## Customization

By default, the map is centered on the United States. To customize the map for a different state or region:

1. Find the coordinates (latitude and longitude) for your desired location:
   - Use [LatLong.net](https://www.latlong.net/) - simply enter your city/state name
   - Or use [Google Maps](https://support.google.com/maps/answer/18539) - right-click any location and copy the coordinates

2. In `script.js`, locate the map initialization code near line 50 and update the coordinates (and optionally the zoom level):

```javascript
function initMap() {
    // Default center if no saved location
    let center = [-95.7129, 37.0902]; // US center in lon, lat format
    let zoom = 4; // Can be any number from 2 to 18
    ...
```

Note that MapLibre GL uses **lon/lat format**, which is backwards from the standard. So, if you have a lat, lon of "40.7484, -73.9856" (aka, New York City), you would input it as:

```javascript
let center = [-73.9856, 40.7484]; // New York City, NY, USA
```

## Technologies Used

- HTML5
- JavaScript
- MapLibre GL JS for map visualization
- RainViewer API for weather data
- CARTO dark basemap
- Docker & Nginx for deployment
- Font Awesome for icons
- Google Fonts (Open Sans)

## Credits

- Weather data provided by [RainViewer](https://www.rainviewer.com/)
- Maps powered by [MapLibre GL JS](https://maplibre.org/)
- Base map tiles by [CARTO](https://carto.com/)
