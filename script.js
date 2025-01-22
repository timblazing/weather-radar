import { searchLocations, focusMapOnLocation } from './locations.js';

// Favorite location functionality
const favoriteToggle = document.getElementById('favorite-toggle');
let savedMapState = null;

function saveMapState() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const state = {
        lat: center.lat,
        lng: center.lng,
        zoom: zoom
    };
    localStorage.setItem('favoriteMapState', JSON.stringify(state));
    savedMapState = state;
    favoriteToggle.classList.add('active');
}

function loadMapState() {
    const saved = localStorage.getItem('favoriteMapState');
    if (saved) {
        savedMapState = JSON.parse(saved);
        map.setView([savedMapState.lat, savedMapState.lng], savedMapState.zoom);
        checkCurrentView();
    }
}

function checkCurrentView() {
    if (!savedMapState) {
        favoriteToggle.classList.remove('active');
        return;
    }
    
    const center = map.getCenter();
    const zoom = map.getZoom();
    
    // Check if current view matches saved view (with small tolerance)
    const latDiff = Math.abs(center.lat - savedMapState.lat);
    const lngDiff = Math.abs(center.lng - savedMapState.lng);
    const zoomDiff = Math.abs(zoom - savedMapState.zoom);
    
    if (latDiff < 0.0001 && lngDiff < 0.0001 && zoomDiff < 0.1) {
        favoriteToggle.classList.add('active');
    } else {
        favoriteToggle.classList.remove('active');
    }
}

favoriteToggle.addEventListener('click', saveMapState);

// Search functionality
const searchContainer = document.getElementById('search-container');
const searchToggle = document.getElementById('search-toggle');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = searchBox.classList.contains('expanded');
    if (!isExpanded) {
        searchBox.classList.add('expanded');
        favoriteToggle.style.display = 'none';
        setTimeout(() => searchInput.focus(), 300);
    } else {
        searchBox.classList.remove('expanded');
        favoriteToggle.style.display = 'block';
        searchInput.value = '';
        searchResults.innerHTML = '';
    }
});

searchInput.addEventListener('input', () => {
    const results = searchLocations(searchInput.value);
    searchResults.innerHTML = '';
    
    results.forEach(location => {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.textContent = location.name;
        div.addEventListener('click', () => {
            focusMapOnLocation(map, location);
            searchBox.classList.remove('expanded');
            favoriteToggle.style.display = 'block';
            searchInput.value = '';
            searchResults.innerHTML = '';
        });
        searchResults.appendChild(div);
    });
});

// Close search when clicking outside
document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
        searchBox.classList.remove('expanded');
        favoriteToggle.style.display = 'block';
        searchInput.value = '';
        searchResults.innerHTML = '';
    }
});

// Map configuration
// Current view is centered on Oklahoma City [latitude, longitude]
// To customize for your state:
// 1. Update the setView coordinates: map.setView([latitude, longitude], zoom)
//    - First number is latitude (e.g., 35.4676 for Oklahoma City)
//    - Second number is longitude (e.g., -97.5164 for Oklahoma City)
//    - Third number is zoom level (8 works well for state-level view)
var map = L.map('mapid', {
    attributionControl: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelDebounceTime: 100,
    wheelPxPerZoomLevel: 120,
    minZoom: 2,
    maxZoom: 12,
    preferCanvas: true,
    updateWhenIdle: true
}).setView([39.8283, -98.5795], 4); // Center of United States

// Load saved map state if exists
loadMapState();

// Update favorite icon when map view changes
map.on('moveend', checkCurrentView);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 18,
    keepBuffer: 4,
    updateWhenIdle: true,
    updateWhenZooming: false,
    tileBufferSize: 4
}).addTo(map);

var apiData = {};
var mapFrames = [];
var lastPastFramePosition = -1;
var radarLayers = [];

var optionKind = 'radar';
var optionTileSize = 512;
var optionColorScheme = 4;
var optionSmoothData = 1;
var optionSnowColors = 1;
var optionExtension = 'webp';

var animationPosition = 0;
var animationTimer = false;
var isPlaying = true;

const FRAME_RATE = 1000;
const PRELOAD_FRAMES = 10;

var loadingTilesCount = 0;
var loadedTilesCount = 0;

function startLoadingTile() {
    loadingTilesCount++;    
}

function finishLoadingTile() { 
    setTimeout(function() { loadedTilesCount++; }, 250);
}

function isTilesLoading() {
    return loadingTilesCount > loadedTilesCount;
}

const playPauseBtn = document.getElementById('play-pause');
const timelineProgress = document.getElementById('timeline-progress');
const timelineTrack = document.getElementById('timeline-track');
const currentTimeLabel = document.getElementById('current-time');
const endTimeLabel = document.getElementById('end-time');

let isDragging = false;

function updateTimelinePosition(e) {
    const rect = timelineTrack.getBoundingClientRect();
    let position = (e.clientX - rect.left) / rect.width;
    position = Math.max(0, Math.min(1, position));
    
    const framePosition = Math.round(position * (mapFrames.length - 1));
    showFrame(framePosition, true);
}

timelineTrack.addEventListener('mousedown', function(e) {
    isDragging = true;
    stop();
    isPlaying = false;
    document.getElementById('pause-icon').style.display = 'none';
    document.getElementById('play-icon').style.display = 'block';
    updateTimelinePosition(e);
});

document.addEventListener('mousemove', function(e) {
    if (isDragging) {
        updateTimelinePosition(e);
    }
});

document.addEventListener('mouseup', function() {
    isDragging = false;
});

function clearAllLayers() {
    Object.values(radarLayers).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    radarLayers = {};
    loadingTilesCount = 0;
    loadedTilesCount = 0;
}

playPauseBtn.addEventListener('click', function() {
    if (isPlaying) {
        stop();
        document.getElementById('pause-icon').style.display = 'none';
        document.getElementById('play-icon').style.display = 'block';
    } else {
        play();
        document.getElementById('play-icon').style.display = 'none';
        document.getElementById('pause-icon').style.display = 'block';
    }
    isPlaying = !isPlaying;
});

function addLayer(frame) {
    if (!radarLayers[frame.path]) {
        var colorScheme = optionKind == 'satellite' ? optionColorScheme == 255 ? 255 : 0 : optionColorScheme;
        var smooth = optionKind == 'satellite' ? 0 : optionSmoothData;
        var snow = optionKind == 'satellite' ? 0 : optionSnowColors;

        var source = new L.TileLayer(apiData.host + frame.path + '/' + optionTileSize + '/{z}/{x}/{y}/' + colorScheme + '/' + smooth + '_' + snow + '.' + optionExtension, {
            tileSize: 256,
            zIndex: 5,
            opacity: 0.01,
            className: 'radar-layer',
            keepBuffer: 4,
            updateWhenIdle: true,
            updateWhenZooming: false,
            tileBufferSize: 4,
            preferCanvas: true
        });

        source.on('loading', startLoadingTile);
        source.on('load', finishLoadingTile);
        source.on('remove', finishLoadingTile);

        radarLayers[frame.path] = source;
    }
    if (!map.hasLayer(radarLayers[frame.path])) {
        map.addLayer(radarLayers[frame.path]);
    }
}

function changeRadarPosition(position, preloadOnly, force) {
    while (position >= mapFrames.length) {
        position -= mapFrames.length;
    }
    while (position < 0) {
        position += mapFrames.length;
    }

    var currentFrame = mapFrames[animationPosition];
    var nextFrame = mapFrames[position];

    addLayer(nextFrame);

    if (preloadOnly) {
        return;
    }

    if (isTilesLoading() && !force) {
        if (radarLayers[nextFrame.path]) {
            radarLayers[nextFrame.path].setOpacity(0);
        }
        return;
    }

    animationPosition = position;

    if (radarLayers[currentFrame.path]) {
        radarLayers[currentFrame.path].setOpacity(0);
    }
    if (radarLayers[nextFrame.path]) {
        radarLayers[nextFrame.path].setOpacity(1);
    }

    const date = new Date(nextFrame.time * 1000);
    const formattedTime = date.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    currentTimeLabel.textContent = formattedTime;

    const progress = (position / (mapFrames.length - 1)) * 100;
    timelineProgress.style.width = `${progress}%`;
}

function showFrame(nextPosition, force) {
    var preloadingDirection = nextPosition - animationPosition > 0 ? 1 : -1;

    changeRadarPosition(nextPosition, false, force);
    changeRadarPosition(nextPosition + preloadingDirection, true);
}

function stop() {
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = false;
        return true;
    }
    return false;
}

function play() {
    var nextPosition = animationPosition + 1;
    
    if (nextPosition >= mapFrames.length) {
        nextPosition = 0;
    }
    
    showFrame(nextPosition);
    animationTimer = setTimeout(play, FRAME_RATE);
}

function playStop() {
    if (!stop()) {
        play();
    }
}

document.onkeydown = function (e) {
    e = e || window.event;
    switch (e.which || e.keyCode) {
        case 37:
            stop();
            showFrame(animationPosition - 1);
            break;

        case 39:
            stop();
            showFrame(animationPosition + 1);
            break;

        default:
            return;
    }
    e.preventDefault();
    return false;
}

fetch("https://api.rainviewer.com/public/weather-maps.json")
    .then(response => response.json())
    .then(data => {
        apiData = data;
        if (apiData.radar && apiData.radar.past) {
            mapFrames = apiData.radar.past;
            lastPastFramePosition = mapFrames.length - 1;
            
            showFrame(lastPastFramePosition, true);

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '',
                zIndex: 1000,
                className: 'streets-layer',
                keepBuffer: 4,
                updateWhenIdle: true,
                updateWhenZooming: false,
                tileBufferSize: 4,
                preferCanvas: true
            }).addTo(map);

            play();
        }
    });
