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
app.get('/api/config', async (req, res) => {
    console.log('Config API called');
    
    // Fetch HA config to get uuid
    if (credentials.ha_url && credentials.access_token) {
        try {
            const haConfigResponse = await fetch(credentials.ha_url + '/api/core/config', {
                headers: {
                    'Authorization': `Bearer ${credentials.access_token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (haConfigResponse.ok) {
                const responseText = await haConfigResponse.text();
                console.log('HA core config response text:', responseText);
                try {
                    const haConfig = JSON.parse(responseText);
                    console.log('HA core config parsed:', JSON.stringify(haConfig, null, 2));
                    console.log('HA UUID:', haConfig.uuid);
                } catch (e) {
                    console.log('Failed to parse HA core config JSON:', e.message);
                }
            } else {
                console.log('Failed to fetch HA core config:', haConfigResponse.status, haConfigResponse.statusText);
            }
        } catch (error) {
            console.log('Error fetching HA core config:', error.message);
        }
    }
    
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
    const wsProxy = new WebSocket.Server({ server, path: '/ws/ha' });
    
    wsProxy.on('connection', (clientWs) => {
        console.log('WebSocket proxy connection established from client');
        
        // Connect to HA WebSocket (without token in URL - we'll handle auth properly)
        const targetUrl = credentials.ha_url.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/api/websocket';
        console.log('Connecting to HA WebSocket:', targetUrl);
        const targetWs = new WebSocket(targetUrl);
        
        let haConnected = false;
        let clientMessages = [];
        
        targetWs.on('open', () => {
            console.log('Connected to HA WebSocket');
            haConnected = true;
            // Send any queued messages
            while (clientMessages.length > 0) {
                const msg = clientMessages.shift();
                targetWs.send(msg);
            }
        });
        
        // Forward messages from HA to client
        targetWs.on('message', (data, isBinary) => {
            // Handle binary audio data (for TTS streaming)
            if (isBinary) {
                console.log('Forwarding binary audio from HA, length:', data.length);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                }
                return;
            }
            
            const dataStr = data.toString();
            console.log('Received message from HA');
            console.log('Received from HA:', dataStr.substring(0, 200) + (dataStr.length > 200 ? '...' : ''));
            
            try {
                const message = JSON.parse(dataStr);
                
                // Handle auth_required from HA - send our server-side token
                if (message.type === 'auth_required') {
                    console.log('HA requires auth, sending server-side access token');
                    console.log('Token being sent:', credentials.access_token ? credentials.access_token.substring(0, 20) + '...' : 'NO TOKEN');
                    targetWs.send(JSON.stringify({
                        type: 'auth',
                        access_token: credentials.access_token
                    }));
                    // Don't forward auth_required to client - we handle it server-side
                    return;
                }
                
                // Forward auth_ok and auth_invalid to client so it knows the result
                if (message.type === 'auth_ok') {
                    console.log('HA auth successful, notifying client');
                    clientWs.send(JSON.stringify({ type: 'auth_ok' }));
                    return;
                }
                
                if (message.type === 'auth_invalid') {
                    console.log('HA auth failed:', message.message);
                    clientWs.send(JSON.stringify({ type: 'auth_invalid', message: message.message }));
                    return;
                }
            } catch (e) {
                // Not JSON, just forward as-is
            }
            
            // Forward all other messages to client
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });
        
        // Forward messages from client to HA
        clientWs.on('message', (data, isBinary) => {
            // Handle binary audio data (for STT)
            if (isBinary) {
                console.log('Forwarding binary audio data to HA, length:', data.length);
                if (haConnected && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(data);
                }
                return;
            }
            
            const dataStr = data.toString();
            console.log('Received from client:', dataStr);
            
            try {
                const message = JSON.parse(dataStr);
                
                // Client sends auth but we already handled it server-side, ignore
                if (message.type === 'auth') {
                    console.log('Ignoring client auth message (handled server-side)');
                    return;
                }
            } catch (e) {
                // Not JSON
            }
            
            // Forward to HA if connected, otherwise queue
            if (haConnected && targetWs.readyState === WebSocket.OPEN) {
                console.log('Forwarding to HA:', dataStr.substring(0, 100));
                targetWs.send(dataStr);
            } else {
                console.log('HA not connected yet, queueing message. haConnected:', haConnected, 'readyState:', targetWs.readyState);
                clientMessages.push(dataStr);
            }
        });
        
        targetWs.on('close', (code, reason) => {
            console.log('HA WebSocket closed:', code, reason ? reason.toString() : '');
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(code || 1000);
            }
        });
        
        targetWs.on('error', (error) => {
            console.error('HA WebSocket error:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1006, 'Proxy error');
            }
        });
        
        clientWs.on('close', (code, reason) => {
            console.log('Client WebSocket closed:', code, reason ? reason.toString() : '');
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close(code || 1000);
            }
        });
        
        clientWs.on('error', (error) => {
            console.error('Client WebSocket error:', error);
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close(1006, 'Client error');
            }
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
