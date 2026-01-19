# Home Assistant Voice Widget

A self-contained voice assistant web interface that integrates with Home Assistant. It provides:

- **Voice Input**: Click-to-speak or wake word detection
- **Text Input**: Type messages to the assistant
- **TTS Playback**: Hear assistant responses
- **Media Receiver**: Named target for media playback automation
- **PWA Support**: Install as a desktop or mobile app

## Quick Start (Standalone Mode)

1. **Configure credentials:**
   - Copy `credentials.ini.example` to `credentals.ini`
   - Edit `credentals.ini` with your Home Assistant URL and access token

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open the widget:**
   - Navigate to `http://localhost:8099` in your browser
   - The widget will automatically connect using the credentials from `credentals.ini`

4. **Use the widget:**
   - Click the microphone button to speak
   - Type in the text box to send messages
   - Enable "Wake Word Detection" for hands-free activation

## Installing as Home Assistant Add-on

When installed as a Home Assistant add-on, the widget automatically receives credentials from Home Assistant and doesn't require manual configuration.

## Configuration

### Credentials File (Standalone Mode)

For local development, create a `credentals.ini` file in the project root:

```ini
HomeAssistantURL=https://your-ha-instance.com:8123
AccessToken=your-long-lived-access-token
```

### Widget Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Device Name | Identifier for this widget in Home Assistant | "Voice Widget" |
| Wake Word | Wake word model to use | "hey_jarvis" |
| STT Timeout | Seconds to wait after last speech | 15 |

### Home Assistant Configuration

The widget uses these Home Assistant APIs:
- `/api/conversation/process` - For processing voice/text commands
- `/api/websocket` - For real-time events and assist pipeline

### Getting a Long-Lived Access Token

1. Go to your Home Assistant instance
2. Click your profile (bottom left)
3. Scroll to "Long-Lived Access Tokens"
4. Click "Create Token"
5. Give it a name (e.g., "Voice Widget")
6. Copy the token (it will only be shown once!)

## Features

### Voice Interaction
- Click the microphone to start listening
- Audio visualizer shows when listening
- Automatic timeout after silence
- TTS playback of responses

### Wake Word Detection
- Uses OpenWakeWord (WASM) for browser-based wake word detection
- Supported wake words: Hey Jarvis, Alexa, Hey Mycroft, Hey Rhasspy, Timer, Weather
- Enable via the toggle switch

### Media Player
- Receives media from Home Assistant automations
- Auto-plays video and audio content
- Example automation:
  ```yaml
  service: media_player.play_media
  target:
    entity_id: media_player.voice_widget
  data:
    media_content_id: "https://example.com/video.mp4"
    media_content_type: "video/mp4"
  ```

### PWA Support
- Install as a standalone app on desktop/mobile
- Offline capable (cached assets)
- App-like experience

## Project Structure

```
home-assistant-voice-widget/
├── config.yaml          # Home Assistant add-on configuration
├── Dockerfile           # Container build file
├── package.json         # Node.js dependencies
├── server.js            # Backend server
├── test.sh              # Test script
├── credentials.ini      # Your HA credentials (gitignore this!)
└── www/
    ├── index.html       # Main web interface
    ├── app.js           # Frontend application
    ├── sw.js            # Service worker for PWA
    ├── manifest.json    # PWA manifest
    └── icons/           # App icons
```

## Testing

Run the test script to verify connectivity:

```bash
./test.sh
```

Expected output:
```
=== Voice Assistant Widget Test Suite ===

1. Testing Home Assistant API Connection...
   ✓ API connection successful
2. Testing Conversation API...
   ✓ Conversation API working
3. Testing WebSocket authentication...
   ✓ API states accessible (WebSocket will work)
4. Testing local widget server...
   ✓ Local server running on port 8099
5. Testing local API config...
   ✓ Config API working

=== Test Complete ===
```

## Browser Requirements

- Modern browser with:
  - Web Audio API
  - MediaRecorder API
  - WebSocket support
  - Microphone access (requires HTTPS in production)

## Security Notes

- Never commit your access token to version control
- Use HTTPS in production for microphone access
- The token is stored in browser localStorage
- Consider using OAuth2 for production deployments

## Troubleshooting

### "Microphone access denied"
- Ensure you're using HTTPS (or localhost)
- Check browser permissions
- Grant microphone access when prompted

### "WebSocket connection failed"
- Check Home Assistant URL is accessible
- Verify the access token is valid
- Ensure WebSocket API is enabled in HA

### "No response from assistant"
- Verify your Home Assistant has a voice assistant configured
- Check the conversation integration is set up
- Look at Home Assistant logs for errors

## License

MIT License

Copyright (c) 2024 Home Assistant Voice Widget

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Attribution

This project uses the following third-party libraries and resources:

- **OpenWakeWord WASM** - Browser-based wake word detection
  - Repository: https://github.com/dnavarrom/openwakeword_wasm
  - License: MIT
  - Copyright (c) 2024 David Navarro

- **Express.js** - Web framework for Node.js
  - License: MIT

- **ws** - WebSocket library for Node.js
  - License: MIT

- **http-proxy-middleware** - HTTP proxy middleware
  - License: MIT
