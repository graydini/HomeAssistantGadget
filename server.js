const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.INGRESS_PORT || 8099;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'www')));

// Get options from Home Assistant add-on config or environment
let options = {
    device_name: 'Voice Widget',
    wake_word: 'hey_jarvis',
    stt_timeout: 15,
    auto_start_listening: false
};

// Try to load add-on options
try {
    if (fs.existsSync('/data/options.json')) {
        const addOnOptions = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        options = { ...options, ...addOnOptions };
    }
} catch (e) {
    console.log('Using default options');
}

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
    res.json({
        options,
        supervisor_token: process.env.SUPERVISOR_TOKEN || null,
        ingress_path: process.env.INGRESS_PATH || '',
        ha_url: process.env.HA_URL || null
    });
});

// API endpoint for saving device name
app.post('/api/device-name', (req, res) => {
    const { deviceName } = req.body;
    options.device_name = deviceName;
    
    // Persist to file if possible
    try {
        fs.writeFileSync('/data/device_name.txt', deviceName);
    } catch (e) {
        console.log('Could not persist device name');
    }
    
    res.json({ success: true, deviceName });
});

// Serve the main app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for real-time communication
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Handle different message types
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Voice Widget server running on port ${PORT}`);
});
