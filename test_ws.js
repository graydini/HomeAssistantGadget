const WebSocket = require('ws');
const fs = require('fs');

// Load credentials from credentals.ini
let BASE_URL, TOKEN;
try {
    const config = fs.readFileSync('credentals.ini', 'utf8');
    const lines = config.split('\n');
    for (const line of lines) {
        if (line.startsWith('HomeAssistantURL=')) {
            BASE_URL = line.split('=')[1].trim();
        } else if (line.startsWith('AccessToken=')) {
            TOKEN = line.split('=')[1].trim();
        }
    }
} catch (err) {
    console.error('Error reading credentals.ini:', err.message);
    process.exit(1);
}

if (!BASE_URL || !TOKEN) {
    console.error('Missing HomeAssistantURL or AccessToken in credentals.ini');
    process.exit(1);
}

const ws = new WebSocket('ws://localhost:8099/ws/ha');
ws.on('open', () => {
    console.log('Connected');
});
ws.on('message', (data) => {
    console.log('Received:', data.toString());
    // Send auth response
    const authMsg = JSON.stringify({
        type: 'auth',
        access_token: TOKEN
    });
    console.log('Sending auth:', authMsg);
    ws.send(authMsg);
});
ws.on('error', (err) => console.error('Error:', err));
ws.on('close', (code, reason) => console.log('Closed:', code, reason.toString()));