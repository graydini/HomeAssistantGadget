const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const { createProxyMiddleware } = require('http-proxy-middleware');
const ini = require('ini');

const app = express();
const PORT = process.env.INGRESS_PORT || 8099;

// Get options from Home Assistant add-on config or environment
let options = {
    device_name: 'Voice Widget',
    wake_word: 'hey_jarvis',
    stt_timeout: 15,
    auto_start_listening: false
};

// Load credentials from file
let credentials = {};
try {
    if (fs.existsSync(path.join(__dirname, 'credentals.ini'))) {
        const config = ini.parse(fs.readFileSync(path.join(__dirname, 'credentals.ini'), 'utf-8'));
        credentials = {
            ha_url: config.HomeAssistantURL,
            access_token: config.AccessToken
        };
        
        // Ensure HA URL has protocol
        if (credentials.ha_url && !credentials.ha_url.startsWith('http://') && !credentials.ha_url.startsWith('https://')) {
            credentials.ha_url = 'http://' + credentials.ha_url;
        }
        
        console.log('Credentials loaded:', { ha_url: credentials.ha_url, has_token: !!credentials.access_token });
    }
} catch (e) {
    console.log('Could not load credentials file, using environment variables');
}

// Try to load add-on options
try {
    if (fs.existsSync('/data/options.json')) {
        const addOnOptions = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
        options = { ...options, ...addOnOptions };
    }
} catch (e) {
    console.log('Using default options');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'www')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
app.use('/openwakeword', express.static(path.join(__dirname, 'node_modules/openwakeword-wasm-browser')));

// Proxy requests to Home Assistant
if (credentials.ha_url) {
    console.log('Configuring HTTP proxy for Home Assistant API...');
    app.use('/api/ha', createProxyMiddleware({
        target: credentials.ha_url,
        changeOrigin: true,
        secure: false, // Disable SSL verification for now
        logLevel: 'debug',
        pathRewrite: {
            '^/api/ha': '/api'
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log('Proxying request to:', proxyReq.getHeader('host') + proxyReq.path);
            // Add authorization header
            if (credentials.access_token) {
                proxyReq.setHeader('Authorization', `Bearer ${credentials.access_token}`);
            }
        },
        onError: (err, req, res) => {
            console.error('HTTP proxy error:', err);
            res.status(500).json({ error: 'Proxy error', details: err.message });
        }
    }));
}

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
    console.log('Config API called');
    res.json({
        options,
        credentials,
        supervisor_token: process.env.SUPERVISOR_TOKEN || null,
        ingress_path: process.env.INGRESS_PATH || '',
        ha_url: process.env.HA_URL || credentials.ha_url || null
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

// WebSocket proxy using ws library
if (credentials.ha_url) {
    const WebSocket = require('ws');
    const wsProxy = new WebSocket.Server({ server, path: '/ws/ha' });
    
    wsProxy.on('connection', (clientWs) => {
        console.log('WebSocket proxy connection established from client');
        
        // Connect to HA WebSocket
        const targetUrl = credentials.ha_url.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/api/websocket';
        console.log('Connecting to HA WebSocket:', targetUrl);
        const targetWs = new WebSocket(targetUrl);
        
        targetWs.on('open', () => {
            console.log('Connected to HA WebSocket');
        });
        
        // Forward messages from HA to client
        targetWs.on('message', (data) => {
            console.log('Forwarding message from HA to client:', data.toString());
            clientWs.send(data);
        });
        
        // Forward messages from client to HA
        clientWs.on('message', (data) => {
            console.log('Forwarding message from client to HA:', data.toString());
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(data);
            }
        });
        
        targetWs.on('close', (code, reason) => {
            console.log('HA WebSocket closed:', code, reason.toString());
            clientWs.close(code, reason);
        });
        
        targetWs.on('error', (error) => {
            console.error('HA WebSocket error:', error);
            clientWs.close(1006, 'Proxy error');
        });
        
        clientWs.on('message', (data) => {
            targetWs.send(data);
        });
        
        clientWs.on('close', (code, reason) => {
            console.log('Client WebSocket closed:', code, reason.toString());
            targetWs.close(code, reason);
        });
        
        clientWs.on('error', (error) => {
            console.error('Client WebSocket error:', error);
            targetWs.close(1006, 'Client error');
        });
    });
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Voice Widget server running on port ${PORT}`);
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
