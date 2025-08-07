import { locations, searchLocations } from './locations.js';

// Map initialization variables
let map;
let mapFrames = [];
let radarLayers = {};
let animationPosition = 0;
let animationTimer = null;
let isPlaying = false; // Changed to false by default
let tilesLoading = 0;
let tilesLoaded = 0;
let isMapInteracting = false;
let isPaused = true; // Default to paused
let lastPastFramePosition = 0; // Added to track the most recent frame
let apiData = null; // Added to track API data
let radarCache = {}; // Added for caching radar tiles
let startingFromLastFrame = false; // Track if we're starting from the last frame

// Constants
const FRAME_RATE = 400; // milliseconds between frames (moderate speed)
const INTERACTION_FRAME_RATE = 500; // slower frame rate during interaction
const PRELOAD_FRAMES = 10; // Increased number of frames to preload
const MAX_CONCURRENT_TILE_LOADS = 8; // Increased from 4 to 8
const CACHE_VERSION = 1; // For cache versioning
const CACHE_NAME = 'weather-radar-cache-v' + CACHE_VERSION;
const END_FRAME_PAUSE_DURATION = 2000; // Duration to pause at the last frame (2 seconds)

// Favorite location functionality
const favoriteToggle = document.getElementById('favorite-toggle');
let savedMapState = null;

// DOM elements
const searchToggle = document.getElementById('search-toggle');
const searchBox = document.getElementById('search-box');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const playPauseButton = document.getElementById('play-pause');
const pauseIcon = document.getElementById('pause-icon');
const playIcon = document.getElementById('play-icon');
const currentTimeLabel = document.getElementById('current-time');
const endTimeLabel = document.getElementById('end-time');
const timelineTrack = document.getElementById('timeline-track');
const timelineProgress = document.getElementById('timeline-progress');
const locationToggle = document.getElementById('location-toggle');

// Add a variable to track the user location marker
let userLocationMarker = null;

// Initialize the map
function initMap() {
    // Default center if no saved location
    let center = [-95.7129, 37.0902]; // US center in lon, lat format
    let zoom = 4; // Can be any number from 2 to 18

    // Try to load saved location
    const savedLocation = loadMapState();
    if (savedLocation) {
        center = [savedLocation.lng, savedLocation.lat];
        zoom = savedLocation.zoom;
    }

    // Initialize MapLibre GL map with a custom dark style
    map = new maplibregl.Map({
        container: 'mapid',
        // Use Dark Matter style which is dark with light labels
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: center,
        zoom: zoom,
        minZoom: 2,
        maxZoom: 18,
        attributionControl: false // We'll add a custom attribution control
    });

    // Removed zoom controls as requested
    
    // Set up map event listeners
    map.on('load', function() {
        // Add custom attribution control to the map after the map is loaded
        map.addControl(new maplibregl.AttributionControl({
            compact: true, // Always use compact mode
            customAttribution: 'Radar data NOAA/NWS | Map data CartoDB'
        }), 'bottom-right');
        
        // Apply custom styling to the attribution control
        setTimeout(() => {
            const attributionButton = document.querySelector('.maplibregl-ctrl-attrib-button');
            if (attributionButton) {
                attributionButton.innerHTML = '<i class="fa-solid fa-info"></i>';
                attributionButton.classList.add('custom-attribution-button');
            }
            
            // Ensure attribution is collapsed by default
            const attributionControl = document.querySelector('.maplibregl-ctrl-attrib');
            if (attributionControl) {
                attributionControl.classList.add('maplibregl-ctrl-attrib-collapsed');
            }
        }, 100);
        
        // Enhance the base map style for better visibility with radar overlay
        const style = map.getStyle();
        
        // Increase contrast of the base map
        if (style && style.layers) {
            style.layers.forEach(layer => {
                // Make roads more visible but not too bright
                if (layer.id.includes('road') && layer.type === 'line') {
                    if (map.getLayer(layer.id)) {
                        // Make roads a subtle gray color
                        if (map.getPaintProperty(layer.id, 'line-color')) {
                            map.setPaintProperty(layer.id, 'line-color', '#aaaaaa');
                        }
                        
                        // Keep line width moderate
                        if (map.getPaintProperty(layer.id, 'line-width')) {
                            const currentWidth = map.getPaintProperty(layer.id, 'line-width');
                            if (typeof currentWidth === 'number') {
                                // Only increase width slightly
                                map.setPaintProperty(layer.id, 'line-width', currentWidth * 1.05);
                            }
                        }
                    }
                }
                
                // Enhance text labels
                if (layer.type === 'symbol') {
                    if (map.getLayer(layer.id)) {
                        // Make text brighter
                        if (map.getPaintProperty(layer.id, 'text-color')) {
                            map.setPaintProperty(layer.id, 'text-color', '#ffffff');
                        }
                        
                        // Add text halo for better readability
                        map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
                        map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0, 0, 0, 0.75)');
                    }
                }
            });
        }
        
        // Start loading radar data immediately while map finishes initializing
        setTimeout(() => fetchRadarData(), 50);
        
        // Initialize radar data
        // fetchRadarData();
        
        // Load saved map state if exists
        if (savedLocation) {
            checkCurrentView();
        } else {
            // Try to get user's location on initial load if no saved location
            getUserLocation();
        }
    });
    
    map.on('moveend', checkCurrentView);
    
    let mapMoveTimeout;
    map.on('movestart', function() {
        isMapInteracting = true;
        if (animationTimer) {
            stop();
        }
        
        isPaused = true;
    });

    map.on('move', function() {
        if (mapMoveTimeout) {
            clearTimeout(mapMoveTimeout);
        }
        
        mapMoveTimeout = setTimeout(function() {
            if (isMapInteracting && isPlaying) {
                isPaused = false;
                play();
            }
        }, 300);
    });

    map.on('moveend', function() {
        if (mapMoveTimeout) {
            clearTimeout(mapMoveTimeout);
        }
        
        mapMoveTimeout = setTimeout(function() {
            isMapInteracting = false;
            checkCurrentView();
            
            if (isPlaying) {
                isPaused = false;
                if (!animationTimer) {
                    play();
                }
            }
        }, 300);
    });
}

function saveMapState() {
    if (!map) return;
    
    // Check if we're already at the favorite location
    if (favoriteToggle.classList.contains('active')) {
        // If star is already active, remove the favorite
        localStorage.removeItem('favoriteMapState');
        savedMapState = null;
        favoriteToggle.classList.remove('active');
        return;
    }
    
    // Otherwise, save the current location as favorite
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
        return savedMapState;
    }
    return null;
}

function checkCurrentView() {
    if (!map || !savedMapState) {
        favoriteToggle.classList.remove('active');
        return;
    }
    
    const center = map.getCenter();
    const zoom = map.getZoom();
    
    // Check if current view matches saved view (with small tolerance)
    const latDiff = Math.abs(center.lat - savedMapState.lat);
    const lngDiff = Math.abs(center.lng - savedMapState.lng);
    const zoomDiff = Math.abs(zoom - savedMapState.zoom);
    
    if (latDiff < 0.5 && lngDiff < 0.5 && zoomDiff < 0.5) {
        favoriteToggle.classList.add('active');
    } else {
        favoriteToggle.classList.remove('active');
    }
}

favoriteToggle.addEventListener('click', saveMapState);

// Search functionality
const searchContainer = document.getElementById('search-container');

// Handle search input
let highlightedIndex = -1;
let searchResultItems = [];
let currentSearchResults = [];
let selectedResultIndex = -1;

searchInput.addEventListener('input', function() {
    const query = this.value.trim();
    searchResults.innerHTML = '';
    highlightedIndex = -1;
    
    if (query.length < 2) return;
    
    // Use the imported searchLocations function
    const results = searchLocations(query);
    searchResultItems = results;
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result">No results found</div>';
        return;
    }
    
    results.forEach((location, index) => {
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result';
        resultElement.textContent = location.name;
        resultElement.addEventListener('click', function() {
            navigateToLocation(location);
            searchBox.classList.remove('expanded');
            searchInput.value = '';
            searchResults.innerHTML = '';
        });
        searchResults.appendChild(resultElement);
    });
});

// Handle keyboard navigation in search results
searchInput.addEventListener('keydown', function(e) {
    if (searchResultItems.length === 0) return;
    
    // Down arrow
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, searchResultItems.length - 1);
        highlightSearchResult(highlightedIndex);
    }
    // Up arrow
    else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        highlightSearchResult(highlightedIndex);
    }
    // Enter key
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResultItems.length) {
            navigateToLocation(searchResultItems[highlightedIndex]);
            searchBox.classList.remove('expanded');
            searchInput.value = '';
            searchResults.innerHTML = '';
        }
    }
});

// Function to handle navigation to a location
function navigateToLocation(location) {
    if (location && location.lng && location.lat) {
        // Use the map's flyTo method to navigate to the location
        map.flyTo({
            center: [location.lng, location.lat],
            zoom: location.zoom || 7,
            essential: true,
            duration: 1500
        });
    }
}

// Close search when clicking outside
document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
        searchBox.classList.remove('expanded');
        favoriteToggle.style.display = 'block';
        searchInput.value = '';
        searchResults.innerHTML = '';
        currentSearchResults = [];
        selectedResultIndex = -1;
    }
});

var optionKind = 'radar';
var optionTileSize = 512;
var optionColorScheme = 4;
var optionSmoothData = 1;
var optionSnowColors = 1;
var optionExtension = 'png';

var loadingTilesCount = 0;
var loadedTilesCount = 0;
var tileLoadStartTime = 0;
var tileLoadTimeout = null;
var pendingTileLoads = [];
var activeTileLoads = 0;

function startLoadingTile() {
    loadingTilesCount++;
    activeTileLoads++;
}

function finishLoadingTile() {
    loadedTilesCount++;
    activeTileLoads--;
    
    if (pendingTileLoads.length > 0 && activeTileLoads < MAX_CONCURRENT_TILE_LOADS) {
        const nextTile = pendingTileLoads.shift();
        if (nextTile && nextTile.load) {
            nextTile.load();
        }
    }
}

function isTilesLoading() {
    return loadingTilesCount > loadedTilesCount;
}

function resetTileCounters() {
    loadingTilesCount = 0;
    loadedTilesCount = 0;
    activeTileLoads = 0;
    pendingTileLoads = [];
    if (tileLoadTimeout) {
        clearTimeout(tileLoadTimeout);
        tileLoadTimeout = null;
    }
}

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
    Object.keys(radarLayers).forEach(path => {
        if (map.getLayer(path)) {
            map.removeLayer(path);
        }
        if (map.getSource(path)) {
            map.removeSource(path);
        }
    });
    radarLayers = {};
    resetTileCounters();
}

function addLayer(frame) {
    if (!radarLayers[frame.path]) {
        var colorScheme = optionKind == 'satellite' ? optionColorScheme == 255 ? 255 : 0 : optionColorScheme;
        var smooth = optionKind == 'satellite' ? 0 : optionSmoothData;
        var snow = optionKind == 'satellite' ? 0 : optionSnowColors;
        
        const sourceId = frame.path;
        const layerId = frame.path;
        
        try {
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [apiData.host + frame.path + '/' + optionTileSize + '/{z}/{x}/{y}/' + colorScheme + '/' + smooth + '_' + snow + '.' + optionExtension],
                    tileSize: 256,
                    attribution: ''
                });
            }
            
            if (!map.getLayer(layerId)) {
                // Find the first label layer to insert the radar layer before it
                let firstLabelLayerId = null;
                const style = map.getStyle();
                
                if (style && style.layers) {
                    for (const layer of style.layers) {
                        if (layer.type === 'symbol' || 
                            layer.id.includes('label') || 
                            layer.id.includes('place') || 
                            layer.id.includes('poi')) {
                            firstLabelLayerId = layer.id;
                            break;
                        }
                    }
                }
                
                // Add the radar layer before the first label layer
                map.addLayer({
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    paint: {
                        'raster-opacity': 0.01,
                        'raster-opacity-transition': {
                            duration: 0
                        }
                    },
                    layout: {
                        visibility: 'visible'
                    }
                }, firstLabelLayerId);
            }
            
            radarLayers[frame.path] = {
                sourceId: sourceId,
                layerId: layerId
            };
        } catch (e) {
            console.warn("Error adding radar layer:", e);
        }
    }
}

function cleanupLayers(currentPosition) {
    // Calculate which frames to keep (current, previous, next)
    var framesWithMargin = 5;
    var currentFrame = mapFrames[currentPosition];
    
    var farthestFrame = currentPosition;
    var nearestFrame = currentPosition;
    
    for (let i = 1; i <= framesWithMargin; i++) {
        farthestFrame = Math.min(mapFrames.length - 1, currentPosition + i);
        nearestFrame = Math.max(0, currentPosition - i);
    }
    
    var framesToKeep = [];
    for (let j = nearestFrame; j <= farthestFrame; j++) {
        if (mapFrames[j]) framesToKeep.push(mapFrames[j].path);
    }
    
    // Remove all other frames
    Object.keys(radarLayers).forEach(function(path) {
        if (!framesToKeep.includes(path)) {
            try {
                if (map.getLayer(path)) {
                    map.removeLayer(path);
                }
                
                if (map.getSource(path)) {
                    map.removeSource(path);
                }
                
                delete radarLayers[path];
            } catch (e) {
                console.warn("Error cleaning up layers:", e);
            }
        }
    });
    
    resetTileCounters();
}

// Fixed function to properly show frames
function showFrame(nextPosition, force = false) {
    var preloadingDirection = nextPosition - animationPosition > 0 ? 1 : -1;

    changeRadarPosition(nextPosition, false, force);
    
    // Preload the next frame in sequence
    let nextPreloadPosition = nextPosition + preloadingDirection;
    if (nextPreloadPosition >= mapFrames.length) nextPreloadPosition = 0;
    if (nextPreloadPosition < 0) nextPreloadPosition = mapFrames.length - 1;
    
    changeRadarPosition(nextPreloadPosition, true);
}

function changeRadarPosition(position, preloadOnly = false, force = false) {
    if (!mapFrames || mapFrames.length === 0) return;
    
    // Ensure position is within bounds
    while (position >= mapFrames.length) position -= mapFrames.length;
    while (position < 0) position += mapFrames.length;
    
    const frame = mapFrames[position];
    if (!frame) return;
    
    // Keep track of the current position
    if (!preloadOnly) {
        animationPosition = position;
        
        // Update timeline
        updateTimeline(position);
    }
    
    // Ensure the layer for this frame exists
    if (!radarLayers[frame.path]) {
        addLayer(frame);
    }
    
    if (preloadOnly) {
        return;
    }
    
    // Update layer visibility and opacity
    Object.keys(radarLayers).forEach(path => {
        try {
            if (map.getLayer(path)) {
                const opacity = path === frame.path ? 0.7 : 0;
                map.setPaintProperty(path, 'raster-opacity', opacity);
            }
        } catch (e) {
            console.warn("Error updating layer opacity:", e);
        }
    });
    
    // Start preloading more frames
    preloadFrames(position + 1, PRELOAD_FRAMES);
}

// Function to preload and cache radar frames
function preloadFrame(frame) {
    if (!frame || !frame.path || radarCache[frame.path]) {
        return;
    }
    
    // Mark this frame as cached to prevent duplicate loading
    radarCache[frame.path] = true;
    
    // Add the layer to the map
    addLayer(frame);
}

// Updated preloadFrames function for better performance
function preloadFrames(startPosition, count) {
    if (!mapFrames || mapFrames.length === 0) return;
    
    let position = startPosition;
    const positionsToLoad = [];
    
    // Create array of positions to load
    for (let i = 0; i < count; i++) {
        if (position >= mapFrames.length) position = 0;
        if (position < 0) position = mapFrames.length - 1;
        
        // Skip duplicate positions
        if (!positionsToLoad.includes(position)) {
            positionsToLoad.push(position);
        }
        
        position++;
    }
    
    // Load frames with a slight stagger
    positionsToLoad.forEach((pos, index) => {
        if (mapFrames[pos]) {
            setTimeout(() => {
                preloadFrame(mapFrames[pos]);
            }, index * 30);
        }
    });
}

function stop() {
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
        return true;
    }
    return false;
}

function play() {
    if (animationTimer) {
        clearTimeout(animationTimer);
    }
    
    var nextPosition = animationPosition + 1;
    
    // Check if we're at the last frame and need to loop back to the beginning
    if (nextPosition >= mapFrames.length) {
        // If we're starting from the last frame (first click of play), skip the pause
        if (startingFromLastFrame) {
            console.log("Starting from last frame - skipping end pause");
            startingFromLastFrame = false; // Reset the flag
            nextPosition = 0;
            showFrame(nextPosition);
            animationTimer = setTimeout(play, FRAME_RATE);
            return;
        }
        
        // If we've reached the end, stay on the last frame for a specified duration
        showFrame(mapFrames.length - 1);
        
        // Add visual indication that we're pausing at the end
        const timeline = document.getElementById('timeline-track');
        timeline.classList.add('timeline-end-pause');
        
        // Set a timeout to remove the visual indication and loop back
        animationTimer = setTimeout(() => {
            timeline.classList.remove('timeline-end-pause');
            // Loop back to the beginning
            nextPosition = 0;
            showFrame(nextPosition);
            
            // Continue the animation
            if (isPlaying && !isPaused) {
                animationTimer = setTimeout(play, FRAME_RATE);
            }
        }, END_FRAME_PAUSE_DURATION);
        
        return;
    }
    
    // Normal progression through frames
    showFrame(nextPosition);
    
    // Set the timer for the next frame
    animationTimer = setTimeout(play, FRAME_RATE);
}

let fetchTimeout = null;

function fetchRadarData() {
    if (fetchTimeout) {
        clearTimeout(fetchTimeout);
    }
    
    fetchTimeout = setTimeout(() => {
        fetch("https://api.rainviewer.com/public/weather-maps.json")
            .then(response => response.json())
            .then(data => {
                apiData = data;
                if (apiData.radar && apiData.radar.past) {
                    // Stop any existing animation
                    if (animationTimer) {
                        stop();
                    }
                    
                    // Use the original frames without interpolation
                    mapFrames = apiData.radar.past;
                    lastPastFramePosition = mapFrames.length - 1;
                    
                    console.log(`Loaded ${mapFrames.length} radar frames`);
                    
                    // Preload frames for faster access
                    if (mapFrames.length > 0) {
                        // Preload most recent frame first for immediate display
                        addLayer(mapFrames[lastPastFramePosition]);
                        
                        // Then preload more frames in the background
                        preloadFrames(lastPastFramePosition - 1, Math.min(PRELOAD_FRAMES, mapFrames.length));
                    }
                    
                    // Show the most recent frame (last frame)
                    showFrame(lastPastFramePosition, true);
                    
                    // Don't auto-play, stay paused at the most recent frame
                    isPlaying = false;
                    isPaused = true;
                    
                    // Update the play/pause button UI
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                    
                    // Update timeline to show the most recent frame
                    updateTimeline(lastPastFramePosition);
                }
            })
            .catch(error => {
                console.error("Error fetching radar data:", error);
                setTimeout(fetchRadarData, 30000);
            });
    }, 100);
}

function updateTimeline(position) {
    if (!mapFrames || !mapFrames[position]) return;
    
    // Update time display
    const frameTime = new Date(mapFrames[position].time * 1000);
    const formattedTime = frameTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    currentTimeLabel.textContent = formattedTime;
    
    // Update progress indicator
    const progress = position / (mapFrames.length - 1) * 100;
    timelineProgress.style.width = progress + '%';
}

// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize MapLibre GL RTL text plugin
    maplibregl.setRTLTextPlugin(
        'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
        null,
        true
    );
    
    // Initialize the map
    initMap();
    
    // Set up event listeners
    favoriteToggle.addEventListener('click', saveMapState);
    
    // Location button event listener
    locationToggle.addEventListener('click', getUserLocation);
    
    // SIMPLIFIED SEARCH TOGGLE HANDLER
    searchToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        searchBox.classList.toggle('expanded');
        
        if (searchBox.classList.contains('expanded')) {
            searchInput.focus();
        } else {
            searchInput.blur();
            searchInput.value = '';
            searchResults.innerHTML = '';
        }
    });
    
    // Timeline track event listeners - remove duplicate listeners
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
    
    // Play/pause button event listener
    playPauseButton.addEventListener('click', function() {
        console.log("Play/Pause clicked - current state:", isPlaying, isPaused);
        
        if (animationTimer) {
            console.log("Stopping animation");
            stop();
            isPlaying = false;
            isPaused = true;
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        } else {
            console.log("Starting animation");
            // Check if we're at the last frame when starting playback
            startingFromLastFrame = (animationPosition === lastPastFramePosition);
            if (startingFromLastFrame) {
                console.log("Starting from last frame - will skip pause");
            }
            
            isPlaying = true;
            isPaused = false;
            play();
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        }
    });
    
    // Close search when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            searchBox.classList.remove('expanded');
            favoriteToggle.style.display = 'block';
            searchInput.value = '';
            searchResults.innerHTML = '';
            currentSearchResults = [];
            selectedResultIndex = -1;
        }
    });
    
    // Search input event listeners
    searchInput.addEventListener('input', () => {
        const results = searchLocations(searchInput.value);
        searchResults.innerHTML = '';
        currentSearchResults = results; // Store the current results
        selectedResultIndex = -1; // Reset selection
        
        results.forEach((location, index) => {
            const div = document.createElement('div');
            div.className = 'search-result';
            div.textContent = location.name;
            
            // Add hover effect
            div.addEventListener('mouseenter', () => {
                selectedResultIndex = index;
                highlightSearchResult(index);
            });
            
            div.addEventListener('click', () => {
                navigateToLocation(location);
            });
            
            searchResults.appendChild(div);
        });
    });
    
    // Add keydown event listener for keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (currentSearchResults.length === 0) return;
        
        switch (e.key) {
            case 'ArrowDown':
                // Move selection down
                selectedResultIndex = Math.min(selectedResultIndex + 1, currentSearchResults.length - 1);
                highlightSearchResult(selectedResultIndex);
                e.preventDefault(); // Prevent cursor from moving in input
                break;
                
            case 'ArrowUp':
                // Move selection up
                selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
                highlightSearchResult(selectedResultIndex);
                e.preventDefault(); // Prevent cursor from moving in input
                break;
                
            case 'Enter':
                // If a result is selected, navigate to it
                if (selectedResultIndex >= 0 && selectedResultIndex < currentSearchResults.length) {
                    navigateToLocation(currentSearchResults[selectedResultIndex]);
                } 
                // If no result is selected but there are results, navigate to the first one
                else if (currentSearchResults.length > 0) {
                    navigateToLocation(currentSearchResults[0]);
                }
                e.preventDefault();
                break;
                
            case 'Escape':
                // Close the search box
                searchBox.classList.remove('expanded');
                favoriteToggle.style.display = 'block';
                searchInput.value = '';
                searchResults.innerHTML = '';
                currentSearchResults = [];
                selectedResultIndex = -1;
                e.preventDefault();
                break;
        }
    });
    
    // Keyboard navigation for left/right arrows
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') {
            stop();
            showFrame(animationPosition - 1);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            stop();
            showFrame(animationPosition + 1);
            e.preventDefault();
        }
    });
    
    // Set up auto-refresh for radar data
    fetchRadarData();
    setInterval(fetchRadarData, 300000); // Refresh every 5 minutes (300000 ms)
});

function highlightSearchResult(index) {
    const results = document.querySelectorAll('.search-result');
    results.forEach((result, i) => {
        if (i === index) {
            result.classList.add('highlighted');
        } else {
            result.classList.remove('highlighted');
        }
    });
}

// Update locations.js to work with MapLibre GL JS
export function focusMapOnLocation(map, location) {
    map.flyTo({
        center: [location.lng, location.lat],
        zoom: location.zoom,
        essential: true,
        duration: 1000
    });
}

// Function to get user's current location and center the map
function getUserLocation() {
    if (navigator.geolocation) {
        locationToggle.classList.add('active');
        
        navigator.geolocation.getCurrentPosition(
            // Success callback
            function(position) {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Fly to user location with zoom level 10
                map.flyTo({
                    center: [userLocation.lng, userLocation.lat],
                    zoom: 9,
                    essential: true,
                    duration: 1500
                });
                
                // Remove existing marker if it exists
                if (userLocationMarker) {
                    userLocationMarker.remove();
                }
                
                // Create a DOM element for the marker (blue dot)
                const el = document.createElement('div');
                el.className = 'user-location-marker';
                
                // Add the marker to the map with no default marker element
                userLocationMarker = new maplibregl.Marker({
                    element: el,
                    // Disable the default marker
                    anchor: 'center'
                })
                .setLngLat([userLocation.lng, userLocation.lat])
                .addTo(map);
                
                setTimeout(() => {
                    locationToggle.classList.remove('active');
                }, 2000);
            },
            // Error callback
            function(error) {
                console.error("Error getting user location:", error);
                locationToggle.classList.remove('active');
                
                // Show a brief error message
                const errorMessage = document.createElement('div');
                errorMessage.className = 'location-error';
                errorMessage.textContent = 'Could not access your location';
                document.body.appendChild(errorMessage);
                
                setTimeout(() => {
                    errorMessage.remove();
                }, 3000);
            },
            // Options
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.error("Geolocation is not supported by this browser");
    }
}
