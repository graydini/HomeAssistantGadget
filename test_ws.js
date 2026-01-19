const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8099/ws/ha');
ws.on('open', () => { 
    console.log('Connected');
});
ws.on('message', (data) => { 
    console.log('Received:', data.toString());
    // Send auth response
    const authMsg = JSON.stringify({
        type: 'auth',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIzMjcyMDZlMjMyNjU0NGE0ODc5OTBkODMzNTA3ZWRiYiIsImlhdCI6MTc2ODc3MjE0OSwiZXhwIjoyMDg0MTMyMTQ5fQ.UYH4q_xQqLRAZug_YQUKUB22x1mdQg6twXbtxLZ4fS0'
    });
    console.log('Sending auth:', authMsg);
    ws.send(authMsg);
});
ws.on('error', (err) => console.error('Error:', err));
ws.on('close', (code, reason) => console.log('Closed:', code, reason.toString()));