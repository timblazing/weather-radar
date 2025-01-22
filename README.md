# Weather Radar

A real-time weather radar visualization web application using strictly free resources. The application provides an interactive map interface with animated radar data,

## Features

- Real-time weather radar data from RainViewer API
- Interactive dark-themed map using Leaflet.js
- Animated radar timeline with play/pause controls
- Responsive design that works on both desktop and mobile devices
- Custom-styled controls for better visibility
- Keyboard controls for frame-by-frame navigation

## Quick Start

1. I prefer to run this website as a docker container, but of course you could just clone and open the index.html locally.

2. Clone this repository:
```bash
git clone https://github.com/timblazing/weather-radar.git
```

3. Build and run the Docker container:
```bash
cd weather-radar && docker-compose up -d --build
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Customization

By default, the map is centered on Oklahoma City (35.4676°N, 97.5164°W) with a zoom level of 8, which provides a good view of the state. To customize the map for a different state or region:

1. Find the coordinates (latitude and longitude) for your desired location:
   - Use [LatLong.net](https://www.latlong.net/) - simply enter your city/state name
   - Or use [Google Maps](https://support.google.com/maps/answer/18539) - right-click any location and copy the coordinates

2. In `index.html`, locate the map initialization code and update the `setView` coordinates:
```javascript
}).setView([latitude, longitude], zoom);
```

The zoom level (third parameter) can be adjusted:
- 8: Good for state-level view
- 6: Broader regional view
- 10: Metro area view

## Technologies Used

- HTML5
- JavaScript
- Leaflet.js for map visualization
- RainViewer API for weather data
- CARTO dark basemap
- Docker & Nginx for deployment
- Font Awesome for icons
- Google Fonts (Open Sans)

## License

This project is open source and available under the MIT License.

## Credits

- Weather data provided by [RainViewer](https://www.rainviewer.com/)
- Maps powered by [Leaflet](https://leafletjs.com/)
- Base map tiles by [CARTO](https://carto.com/)
