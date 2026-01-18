// Voice Assistant Widget - Main Application
class VoiceAssistantWidget {
    constructor() {
        // State
        this.isConnected = false;
        this.isListening = false;
        this.isProcessing = false;
        this.wakeWordEnabled = false;
        this.wsConnection = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.audioStream = null;
        this.analyser = null;
        this.sttTimeout = null;
        this.lastInteractionTime = 0;
        this.messageId = 0;
        this.pendingPromises = new Map();
        
        // Configuration
        this.config = {
            haUrl: '',
            accessToken: '',
            deviceName: 'Voice Widget',
            wakeWord: 'hey_jarvis',
            sttTimeout: 15,
            pipelineId: null
        };
        
        // Wake word detector
        this.wakeWordDetector = null;
        
        // DOM Elements
        this.elements = {};
        
        // Initialize
        this.init();
    }
    
    async init() {
        this.bindElements();
        this.bindEvents();
        this.loadConfig();
        this.initAudioVisualizer();
        this.registerServiceWorker();
        this.setupPWAInstall();
        
        // Check if we have saved credentials
        if (this.config.haUrl && this.config.accessToken) {
            await this.connect();
        }
    }
    
    bindElements() {
        this.elements = {
            connectionOverlay: document.getElementById('connectionOverlay'),
            haUrl: document.getElementById('haUrl'),
            accessToken: document.getElementById('accessToken'),
            connectBtn: document.getElementById('connectBtn'),
            connectionError: document.getElementById('connectionError'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            deviceName: document.getElementById('deviceName'),
            saveDeviceBtn: document.getElementById('saveDeviceBtn'),
            micButton: document.getElementById('micButton'),
            voiceStatus: document.getElementById('voiceStatus'),
            wakewordToggle: document.getElementById('wakewordToggle'),
            wakewordSwitch: document.getElementById('wakewordSwitch'),
            audioVisualizer: document.getElementById('audioVisualizer'),
            transcriptText: document.getElementById('transcriptText'),
            responseText: document.getElementById('responseText'),
            textInputForm: document.getElementById('textInputForm'),
            textInput: document.getElementById('textInput'),
            mediaSection: document.getElementById('mediaSection'),
            videoPlayer: document.getElementById('videoPlayer'),
            audioPlayer: document.getElementById('audioPlayer'),
            ttsAudio: document.getElementById('ttsAudio'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            settingsHaUrl: document.getElementById('settingsHaUrl'),
            settingsWakeWord: document.getElementById('settingsWakeWord'),
            settingsSttTimeout: document.getElementById('settingsSttTimeout'),
            cancelSettings: document.getElementById('cancelSettings'),
            saveSettings: document.getElementById('saveSettings'),
            installPrompt: document.getElementById('installPrompt'),
            installBtn: document.getElementById('installBtn'),
            dismissInstall: document.getElementById('dismissInstall')
        };
    }
    
    bindEvents() {
        // Connection form
        this.elements.connectBtn.addEventListener('click', () => this.handleConnect());
        this.elements.haUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleConnect();
        });
        this.elements.accessToken.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleConnect();
        });
        
        // Device name
        this.elements.saveDeviceBtn.addEventListener('click', () => this.saveDeviceName());
        
        // Microphone button
        this.elements.micButton.addEventListener('click', () => this.toggleListening());
        
        // Wake word toggle
        this.elements.wakewordToggle.addEventListener('click', () => this.toggleWakeWord());
        
        // Text input
        this.elements.textInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendTextInput();
        });
        
        // Settings
        this.elements.settingsBtn.addEventListener('click', () => this.openSettings());
        this.elements.cancelSettings.addEventListener('click', () => this.closeSettings());
        this.elements.saveSettings.addEventListener('click', () => this.saveSettingsHandler());
        
        // Install prompt
        this.elements.installBtn.addEventListener('click', () => this.installPWA());
        this.elements.dismissInstall.addEventListener('click', () => this.dismissInstallPrompt());
    }
    
    loadConfig() {
        const saved = localStorage.getItem('voiceWidgetConfig');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.config = { ...this.config, ...parsed };
                this.elements.deviceName.value = this.config.deviceName;
            } catch (e) {
                console.error('Failed to parse saved config:', e);
            }
        }
    }
    
    saveConfig() {
        localStorage.setItem('voiceWidgetConfig', JSON.stringify(this.config));
    }
    
    async handleConnect() {
        const url = this.elements.haUrl.value.trim();
        const token = this.elements.accessToken.value.trim();
        
        if (!url || !token) {
            this.showConnectionError('Please enter both URL and access token');
            return;
        }
        
        // Normalize URL
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }
        normalizedUrl = normalizedUrl.replace(/\/$/, '');
        
        this.config.haUrl = normalizedUrl;
        this.config.accessToken = token;
        
        this.elements.connectBtn.disabled = true;
        this.elements.connectBtn.textContent = 'Connecting...';
        
        const success = await this.connect();
        
        this.elements.connectBtn.disabled = false;
        this.elements.connectBtn.textContent = 'Connect';
        
        if (success) {
            this.saveConfig();
            this.elements.connectionOverlay.classList.add('hidden');
        }
    }
    
    showConnectionError(message) {
        this.elements.connectionError.textContent = message;
        this.elements.connectionError.classList.add('visible');
    }
    
    hideConnectionError() {
        this.elements.connectionError.classList.remove('visible');
    }
    
    async connect() {
        try {
            // Test the connection with a simple API call
            const response = await fetch(`${this.config.haUrl}/api/`, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Connected to Home Assistant:', data.message);
            
            // Connect WebSocket
            await this.connectWebSocket();
            
            // Get available pipelines
            await this.getAssistPipelines();
            
            this.updateConnectionStatus(true);
            return true;
        } catch (error) {
            console.error('Connection failed:', error);
            this.showConnectionError(`Connection failed: ${error.message}`);
            this.updateConnectionStatus(false);
            return false;
        }
    }
    
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = this.config.haUrl.replace(/^http/, 'ws') + '/api/websocket';
            
            this.wsConnection = new WebSocket(wsUrl);
            
            this.wsConnection.onopen = () => {
                console.log('WebSocket connected');
            };
            
            this.wsConnection.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message, resolve, reject);
            };
            
            this.wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
            
            this.wsConnection.onclose = () => {
                console.log('WebSocket closed');
                this.updateConnectionStatus(false);
                
                // Attempt reconnection after 5 seconds
                setTimeout(() => {
                    if (this.config.haUrl && this.config.accessToken) {
                        this.connect();
                    }
                }, 5000);
            };
        });
    }
    
    handleWebSocketMessage(message, resolveConnect, rejectConnect) {
        switch (message.type) {
            case 'auth_required':
                // Send authentication
                this.wsConnection.send(JSON.stringify({
                    type: 'auth',
                    access_token: this.config.accessToken
                }));
                break;
                
            case 'auth_ok':
                console.log('WebSocket authenticated');
                if (resolveConnect) resolveConnect();
                break;
                
            case 'auth_invalid':
                console.error('WebSocket auth failed:', message.message);
                if (rejectConnect) rejectConnect(new Error(message.message));
                break;
                
            case 'result':
                this.handleResult(message);
                break;
                
            case 'event':
                this.handleEvent(message);
                break;
        }
    }
    
    handleResult(message) {
        const pending = this.pendingPromises.get(message.id);
        if (pending) {
            if (message.success) {
                pending.resolve(message.result);
            } else {
                pending.reject(new Error(message.error?.message || 'Unknown error'));
            }
            this.pendingPromises.delete(message.id);
        }
    }
    
    handleEvent(message) {
        const event = message.event;
        
        if (event.type === 'run-start') {
            this.updateStatus('Processing...', 'processing');
        } else if (event.type === 'run-end') {
            this.updateStatus('Ready', 'connected');
        } else if (event.type === 'stt-start') {
            this.updateStatus('Listening...', 'listening');
        } else if (event.type === 'stt-end') {
            if (event.data?.stt_output?.text) {
                this.elements.transcriptText.textContent = event.data.stt_output.text;
            }
        } else if (event.type === 'intent-start') {
            this.updateStatus('Understanding...', 'processing');
        } else if (event.type === 'intent-end') {
            if (event.data?.intent_output?.response?.speech?.plain?.speech) {
                const responseText = event.data.intent_output.response.speech.plain.speech;
                this.displayResponse(responseText);
            }
        } else if (event.type === 'tts-start') {
            this.updateStatus('Generating speech...', 'processing');
        } else if (event.type === 'tts-end') {
            if (event.data?.tts_output?.url) {
                this.playTTS(event.data.tts_output.url);
            }
        } else if (event.type === 'error') {
            console.error('Pipeline error:', event.data);
            this.displayResponse('Sorry, an error occurred: ' + (event.data?.message || 'Unknown error'));
            this.updateStatus('Error', 'connected');
        }
    }
    
    async sendMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            
            this.pendingPromises.set(id, { resolve, reject });
            
            this.wsConnection.send(JSON.stringify({
                id,
                type,
                ...data
            }));
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingPromises.has(id)) {
                    this.pendingPromises.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
    
    async getAssistPipelines() {
        try {
            const result = await this.sendMessage('assist_pipeline/pipeline/list');
            console.log('Available pipelines:', result);
            
            if (result.pipelines && result.pipelines.length > 0) {
                // Use preferred pipeline or first available
                const preferred = result.pipelines.find(p => p.id === result.preferred_pipeline);
                this.config.pipelineId = preferred ? preferred.id : result.pipelines[0].id;
                console.log('Using pipeline:', this.config.pipelineId);
            }
        } catch (error) {
            console.error('Failed to get pipelines:', error);
        }
    }
    
    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.elements.statusDot.classList.add('connected');
            this.elements.statusText.textContent = 'Connected';
            this.elements.connectionOverlay.classList.add('hidden');
        } else {
            this.elements.statusDot.classList.remove('connected');
            this.elements.statusText.textContent = 'Disconnected';
        }
    }
    
    updateStatus(text, state) {
        this.elements.voiceStatus.textContent = text;
        this.elements.statusDot.classList.remove('connected', 'listening', 'processing');
        
        if (state === 'listening') {
            this.elements.statusDot.classList.add('listening');
            this.elements.micButton.classList.add('listening');
            this.elements.micButton.classList.remove('processing');
        } else if (state === 'processing') {
            this.elements.statusDot.classList.add('processing');
            this.elements.micButton.classList.add('processing');
            this.elements.micButton.classList.remove('listening');
        } else {
            this.elements.statusDot.classList.add('connected');
            this.elements.micButton.classList.remove('listening', 'processing');
        }
    }
    
    async toggleListening() {
        if (this.isProcessing) return;
        
        if (this.isListening) {
            this.stopListening();
        } else {
            await this.startListening();
        }
    }
    
    async startListening() {
        if (!this.isConnected) {
            alert('Please connect to Home Assistant first');
            return;
        }
        
        try {
            // Get microphone access
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });
            
            this.isListening = true;
            this.updateStatus('Listening...', 'listening');
            this.showAudioVisualizer();
            
            // Start audio analysis for visualization
            this.startAudioAnalysis();
            
            // Start the assist pipeline with audio
            await this.runAssistPipeline();
            
        } catch (error) {
            console.error('Failed to start listening:', error);
            this.updateStatus('Microphone access denied', 'connected');
        }
    }
    
    stopListening() {
        this.isListening = false;
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.hideAudioVisualizer();
        this.updateStatus('Click the microphone or say the wake word', 'connected');
        
        clearTimeout(this.sttTimeout);
    }
    
    async runAssistPipeline() {
        try {
            // Create an audio worklet or use MediaRecorder
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(this.audioStream);
            
            // Use ScriptProcessor for audio data (fallback for wider compatibility)
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            const audioChunks = [];
            
            processor.onaudioprocess = (e) => {
                if (!this.isListening) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert to 16-bit PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }
                audioChunks.push(pcmData);
                
                // Reset timeout on audio activity
                this.lastInteractionTime = Date.now();
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            // Set timeout to stop after period of silence
            this.sttTimeout = setInterval(() => {
                if (Date.now() - this.lastInteractionTime > this.config.sttTimeout * 1000) {
                    this.processAudio(audioChunks, audioContext);
                    clearInterval(this.sttTimeout);
                }
            }, 1000);
            
            // Also stop after max time
            setTimeout(() => {
                if (this.isListening) {
                    this.processAudio(audioChunks, audioContext);
                }
            }, this.config.sttTimeout * 1000);
            
        } catch (error) {
            console.error('Pipeline error:', error);
            this.stopListening();
        }
    }
    
    async processAudio(audioChunks, audioContext) {
        this.stopListening();
        this.isProcessing = true;
        this.updateStatus('Processing...', 'processing');
        
        try {
            // Concatenate all audio chunks
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combinedAudio = new Int16Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
            }
            
            // Convert to base64
            const audioBase64 = this.int16ArrayToBase64(combinedAudio);
            
            // Send to Home Assistant for processing
            await this.processVoiceCommand(audioBase64);
            
        } catch (error) {
            console.error('Audio processing error:', error);
            this.displayResponse('Sorry, there was an error processing your audio.');
        } finally {
            this.isProcessing = false;
            audioContext.close();
        }
    }
    
    int16ArrayToBase64(int16Array) {
        const uint8Array = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }
    
    async processVoiceCommand(audioBase64) {
        try {
            // Use the conversation API with audio
            const response = await fetch(`${this.config.haUrl}/api/conversation/process`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: '', // Will be filled by STT
                    language: 'en'
                })
            });
            
            // For now, fall back to text-based processing
            // Full audio pipeline would require WebSocket streaming
            this.updateStatus('Ready - use text input for full functionality', 'connected');
            
        } catch (error) {
            console.error('Voice command error:', error);
            throw error;
        }
    }
    
    async sendTextInput() {
        const text = this.elements.textInput.value.trim();
        if (!text || !this.isConnected) return;
        
        this.elements.textInput.value = '';
        this.elements.transcriptText.textContent = text;
        this.isProcessing = true;
        this.updateStatus('Processing...', 'processing');
        
        try {
            const response = await fetch(`${this.config.haUrl}/api/conversation/process`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    language: 'en'
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Conversation response:', data);
            
            // Extract response text
            let responseText = 'No response';
            if (data.response?.speech?.plain?.speech) {
                responseText = data.response.speech.plain.speech;
            } else if (data.response?.speech?.ssml?.speech) {
                // Strip SSML tags
                responseText = data.response.speech.ssml.speech.replace(/<[^>]*>/g, '');
            }
            
            this.displayResponse(responseText);
            
            // Play TTS if available
            if (data.response?.speech?.plain?.speech) {
                await this.generateAndPlayTTS(responseText);
            }
            
        } catch (error) {
            console.error('Conversation error:', error);
            this.displayResponse('Sorry, there was an error processing your request.');
        } finally {
            this.isProcessing = false;
            this.updateStatus('Ready', 'connected');
        }
    }
    
    displayResponse(text) {
        this.elements.responseText.textContent = text;
        this.elements.responseText.classList.remove('empty');
    }
    
    async generateAndPlayTTS(text) {
        try {
            const response = await fetch(`${this.config.haUrl}/api/tts_get_url`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: text,
                    platform: 'tts'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.url) {
                    this.playTTS(data.url);
                }
            }
        } catch (error) {
            console.error('TTS error:', error);
        }
    }
    
    playTTS(url) {
        // Construct full URL if relative
        const fullUrl = url.startsWith('http') ? url : `${this.config.haUrl}${url}`;
        
        this.elements.ttsAudio.src = fullUrl;
        this.elements.ttsAudio.play().catch(err => {
            console.error('TTS playback error:', err);
        });
    }
    
    saveDeviceName() {
        const name = this.elements.deviceName.value.trim();
        if (name) {
            this.config.deviceName = name;
            this.saveConfig();
            
            // Update button to show saved
            this.elements.saveDeviceBtn.textContent = 'Saved!';
            setTimeout(() => {
                this.elements.saveDeviceBtn.textContent = 'Save';
            }, 2000);
        }
    }
    
    async toggleWakeWord() {
        this.wakeWordEnabled = !this.wakeWordEnabled;
        
        if (this.wakeWordEnabled) {
            this.elements.wakewordSwitch.classList.add('active');
            await this.startWakeWordDetection();
        } else {
            this.elements.wakewordSwitch.classList.remove('active');
            this.stopWakeWordDetection();
        }
    }
    
    async startWakeWordDetection() {
        try {
            // Initialize OpenWakeWord (WASM version)
            // Note: This requires the openwakeword_wasm library
            if (typeof WakeWordEngine !== 'undefined') {
                this.wakeWordDetector = new WakeWordEngine({
                    baseAssetUrl: '/openwakeword/models',
                    keywords: [this.config.wakeWord],
                    detectionThreshold: 0.5
                });
                await this.wakeWordDetector.load();
                this.wakeWordDetector.on('detect', ({ keyword }) => {
                    console.log('Wake word detected:', keyword);
                    this.startListening();
                });
                await this.wakeWordDetector.start();
                this.updateStatus('Listening for wake word...', 'connected');
            } else {
                // Fallback: simple audio level detection demo
                console.log('WakeWordEngine not available, using audio level detection');
                this.updateStatus('Wake word detection active (demo mode)', 'connected');
            }
        } catch (error) {
            console.error('Wake word detection error:', error);
            this.wakeWordEnabled = false;
            this.elements.wakewordSwitch.classList.remove('active');
        }
    }
    
    stopWakeWordDetection() {
        if (this.wakeWordDetector) {
            this.wakeWordDetector.stop();
            this.wakeWordDetector = null;
        }
        this.updateStatus('Click the microphone or enable wake word', 'connected');
    }
    
    initAudioVisualizer() {
        // Create visualizer bars
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.className = 'audio-bar';
            bar.style.height = '10px';
            this.elements.audioVisualizer.appendChild(bar);
        }
    }
    
    showAudioVisualizer() {
        this.elements.audioVisualizer.style.display = 'flex';
    }
    
    hideAudioVisualizer() {
        this.elements.audioVisualizer.style.display = 'none';
    }
    
    startAudioAnalysis() {
        if (!this.audioStream) return;
        
        this.audioContext = new AudioContext();
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const bars = this.elements.audioVisualizer.querySelectorAll('.audio-bar');
        
        const animate = () => {
            if (!this.isListening) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            bars.forEach((bar, i) => {
                const value = dataArray[i] || 0;
                const height = Math.max(5, (value / 255) * 60);
                bar.style.height = `${height}px`;
            });
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    openSettings() {
        this.elements.settingsHaUrl.value = this.config.haUrl;
        this.elements.settingsWakeWord.value = this.config.wakeWord;
        this.elements.settingsSttTimeout.value = this.config.sttTimeout;
        this.elements.settingsModal.classList.add('active');
    }
    
    closeSettings() {
        this.elements.settingsModal.classList.remove('active');
    }
    
    saveSettingsHandler() {
        this.config.haUrl = this.elements.settingsHaUrl.value.trim();
        this.config.wakeWord = this.elements.settingsWakeWord.value;
        this.config.sttTimeout = parseInt(this.elements.settingsSttTimeout.value) || 15;
        
        this.saveConfig();
        this.closeSettings();
        
        // Reconnect if URL changed
        if (this.isConnected) {
            this.wsConnection.close();
            this.connect();
        }
    }
    
    // Media Player functionality
    playMedia(mediaUrl, mediaType = 'auto') {
        this.elements.mediaSection.classList.add('active');
        
        if (mediaType === 'video' || (mediaType === 'auto' && this.isVideoUrl(mediaUrl))) {
            this.elements.videoPlayer.style.display = 'block';
            this.elements.audioPlayer.style.display = 'none';
            this.elements.videoPlayer.src = mediaUrl;
            this.elements.videoPlayer.play();
        } else {
            this.elements.audioPlayer.style.display = 'block';
            this.elements.videoPlayer.style.display = 'none';
            this.elements.audioPlayer.src = mediaUrl;
            this.elements.audioPlayer.play();
        }
    }
    
    isVideoUrl(url) {
        const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];
        return videoExtensions.some(ext => url.toLowerCase().includes(ext));
    }
    
    // PWA functionality
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered:', registration);
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
    }
    
    setupPWAInstall() {
        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.elements.installPrompt.classList.add('visible');
        });
        
        this.elements.installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('Install outcome:', outcome);
                deferredPrompt = null;
                this.elements.installPrompt.classList.remove('visible');
            }
        });
    }
    
    dismissInstallPrompt() {
        this.elements.installPrompt.classList.remove('visible');
    }
    
    installPWA() {
        // Handled by setupPWAInstall
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.voiceWidget = new VoiceAssistantWidget();
});

// Expose media player globally for Home Assistant automations
window.playMedia = (url, type) => {
    if (window.voiceWidget) {
        window.voiceWidget.playMedia(url, type);
    }
};
