// Voice Assistant Widget - Main Application
class VoiceAssistantWidget {
    constructor() {
        // State
        this.isConnected = false;
        this.isListening = false;
        this.isProcessing = false;
        this.wakeWordEnabled = false;
        this.authFailed = false;
        this.connectionSuccessful = false;
        this.authResolved = false;
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
        await this.loadServerConfig();
        this.loadConfig();
        this.initAudioVisualizer();
        this.registerServiceWorker();
        this.setupPWAInstall();
        
        // Check if we have credentials from server or saved
        if (this.config.haUrl && this.config.accessToken) {
            const connected = await this.connect();
            if (connected) {
                this.elements.connectionOverlay.classList.add('hidden');
            } else {
                // Show connection overlay if auto-connect failed
                this.elements.connectionOverlay.classList.remove('hidden');
            }
        } else {
            // Show connection overlay for manual entry
            this.elements.connectionOverlay.classList.remove('hidden');
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
                // Only load non-credential config from localStorage
                this.config.deviceName = parsed.deviceName || this.config.deviceName;
                this.config.wakeWord = parsed.wakeWord || this.config.wakeWord;
                this.config.sttTimeout = parsed.sttTimeout || this.config.sttTimeout;
                this.elements.deviceName.value = this.config.deviceName;
            } catch (e) {
                console.error('Failed to parse saved config:', e);
            }
        }
    }
    
    async loadServerConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const serverConfig = await response.json();
                
                // Set credentials from server
                if (serverConfig.credentials) {
                    this.config.haUrl = serverConfig.credentials.ha_url;
                    this.config.accessToken = serverConfig.credentials.access_token;
                }
                
                // Set HA URL from environment if available
                if (serverConfig.ha_url) {
                    this.config.haUrl = serverConfig.ha_url;
                }
                
                // Set other options
                if (serverConfig.options) {
                    this.config.deviceName = serverConfig.options.device_name;
                    this.config.wakeWord = serverConfig.options.wake_word;
                    this.config.sttTimeout = serverConfig.options.stt_timeout;
                }
                
                console.log('Loaded server config');
            }
        } catch (error) {
            console.error('Failed to load server config:', error);
        }
    }
    
    saveConfig() {
        // Only save non-sensitive config to localStorage
        const configToSave = {
            deviceName: this.config.deviceName,
            wakeWord: this.config.wakeWord,
            sttTimeout: this.config.sttTimeout
        };
        localStorage.setItem('voiceWidgetConfig', JSON.stringify(configToSave));
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
            // Test the connection with a simple API call through local proxy
            const response = await fetch('/api/ha/', {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Connected to Home Assistant:', data.message);
            
            // Connect WebSocket through proxy
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
        this.authResolved = false;
        return new Promise((resolve, reject) => {
            // Use the same host as the page, not hardcoded localhost
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/ha`;
            console.log('Connecting to WebSocket:', wsUrl);
            
            this.wsConnection = new WebSocket(wsUrl);
            window.webSocket = this.wsConnection; // Expose WebSocket globally for testing

            this.wsConnection.onopen = () => {
                console.log('WebSocket connected');
                console.log('Attempting to hide connection overlay');
                this.elements.connectionOverlay.classList.add('hidden');
            };
            
            this.wsConnection.onmessage = async (event) => {
                let data = event.data;
                if (data instanceof Blob) {
                    data = await data.text();
                }
                const message = JSON.parse(data);
                this.handleWebSocketMessage(message, resolve, reject);
            };
            
            this.wsConnection.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
            
            this.wsConnection.onclose = () => {
                console.log('WebSocket closed');
                this.updateConnectionStatus(false);
                
                if (!this.authResolved) {
                    reject(new Error('WebSocket closed before authentication response'));
                    this.authResolved = true;
                }
                
                // Attempt reconnection after 5 seconds if previously connected and auth didn't fail
                if (this.connectionSuccessful && !this.authFailed) {
                    setTimeout(() => {
                        if (this.config.haUrl && this.config.accessToken) {
                            this.connect();
                        }
                    }, 5000);
                }
            };
        });
    }
    
    handleWebSocketMessage(message, resolveConnect, rejectConnect) {
        console.log('Received WebSocket message:', message);
        switch (message.type) {
            case 'auth_required':
                console.log('Sending auth to HA WebSocket');
                this.wsConnection.send(JSON.stringify({
                    type: 'auth',
                    access_token: this.config.accessToken
                }));
                break;
                
            case 'auth_ok':
                console.log('WebSocket authenticated');
                this.authFailed = false;
                this.authResolved = true;
                if (resolveConnect) resolveConnect();
                break;
                
            case 'auth_invalid':
                console.error('WebSocket auth failed:', message.message);
                this.authFailed = true;
                this.authResolved = true;
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
        // Check if this is a pipeline run result with runner_data
        if (message.id === this.pipelineSubscriptionId && message.success) {
            // This is the initial pipeline run response
            console.log('Pipeline started:', message.result);
            // The runner_data comes in the run-start event, not the result
        }
        
        const pending = this.pendingPromises.get(message.id);
        if (pending) {
            if (message.success) {
                pending.resolve(message.result);
            } else {
                pending.reject(new Error(message.error?.message || 'Unknown error'));
            }
            this.pendingPromises.delete(message.id);
        }
        
        // Handle pipeline run errors
        if (message.id === this.pipelineSubscriptionId && !message.success) {
            console.error('Pipeline run error:', message.error);
            this.stopListening();
            this.displayResponse('Pipeline error: ' + (message.error?.message || 'Unknown error'));
            this.updateStatus('Error', 'connected');
        }
    }
    
    handleEvent(message) {
        const event = message.event;
        console.log('Pipeline event:', event.type, event);
        
        if (event.type === 'run-start') {
            // Extract the binary handler ID for audio streaming
            if (event.data?.runner_data?.stt_binary_handler_id !== undefined) {
                this.sttBinaryHandlerId = event.data.runner_data.stt_binary_handler_id;
                console.log('STT binary handler ID:', this.sttBinaryHandlerId);
                
                // Resolve the pending pipeline promise now that we have the handler ID
                if (this.pipelineResolve) {
                    this.pipelineResolve();
                    this.pipelineResolve = null;
                    this.pipelineReject = null;
                }
            }
            this.updateStatus('Pipeline started...', 'processing');
        } else if (event.type === 'run-end') {
            this.isProcessing = false;
            this.stopListening();
            this.stopAudioStreaming();
            this.updateStatus('Ready', 'connected');
        } else if (event.type === 'stt-start') {
            console.log('STT started with engine:', event.data?.engine);
            this.updateStatus('Listening...', 'listening');
        } else if (event.type === 'stt-vad-start') {
            console.log('Voice activity detected');
            this.updateStatus('Hearing you...', 'listening');
        } else if (event.type === 'stt-vad-end') {
            console.log('Voice activity ended');
            this.updateStatus('Processing speech...', 'processing');
        } else if (event.type === 'stt-end') {
            if (event.data?.stt_output?.text) {
                console.log('STT result:', event.data.stt_output.text);
                this.elements.transcriptText.textContent = event.data.stt_output.text;
            }
            this.stopAudioStreaming();
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
            this.isProcessing = false;
            this.stopListening();
            this.stopAudioStreaming();
            this.displayResponse('Sorry, an error occurred: ' + (event.data?.message || 'Unknown error'));
            this.updateStatus('Error - ' + (event.data?.code || 'unknown'), 'connected');
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
            // Use WebSocket command to get pipelines
            const result = await this.sendMessage('assist_pipeline/pipeline/list');
            console.log('Available pipelines:', result);
            
            if (result.pipelines && result.pipelines.length > 0) {
                // Store all pipelines for later use
                this.availablePipelines = result.pipelines;
                
                // Find pipelines by capability
                const voicePipeline = result.pipelines.find(p => p.stt_engine !== null);
                const textPipeline = result.pipelines.find(p => p.id === result.preferred_pipeline) || 
                                   result.pipelines.find(p => p.name.toLowerCase().includes('computer'));
                
                // Store pipeline IDs
                this.config.voicePipelineId = voicePipeline ? voicePipeline.id : null;
                this.config.textPipelineId = textPipeline ? textPipeline.id : result.pipelines[0].id;
                
                // Use text pipeline as default (for manual input)
                this.config.pipelineId = this.config.textPipelineId;
                
                console.log('Voice pipeline:', this.config.voicePipelineId, 'Text pipeline:', this.config.textPipelineId);
                console.log('Using default pipeline:', this.config.pipelineId);
            } else {
                console.log('No pipelines found, will use default');
                this.config.pipelineId = null;
                this.config.voicePipelineId = null;
                this.config.textPipelineId = null;
            }
        } catch (error) {
            console.error('Failed to get pipelines:', error);
            this.config.pipelineId = null;
            this.config.voicePipelineId = null;
            this.config.textPipelineId = null;
        }
    }
    
    updateConnectionStatus(connected) {
        this.isConnected = connected;
        this.connectionSuccessful = connected;
        
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
            // Get microphone access if not already available (from wake word detection)
            if (!this.audioStream) {
                this.audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 16000
                    }
                });
            }
            
            this.isListening = true;
            this.updateStatus('Listening...', 'listening');
            this.showAudioVisualizer();
            
            // Start audio analysis for visualization
            this.startAudioAnalysis();
            
            // Start the assist pipeline with audio
            await this.runAssistPipeline(true);
            
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
    
    async runAssistPipeline(isVoiceInput = false) {
        try {
            // Subscribe to pipeline events
            this.pipelineSubscriptionId = ++this.messageId;
            this.sttBinaryHandlerId = null;
            
            // Choose the appropriate pipeline
            const pipelineId = isVoiceInput ? this.config.voicePipelineId : this.config.textPipelineId;
            
            // Create the pipeline run request
            const pipelineRequest = {
                id: this.pipelineSubscriptionId,
                type: 'assist_pipeline/run',
                start_stage: isVoiceInput ? 'stt' : 'intent',
                end_stage: 'tts',
                input: isVoiceInput ? {
                    sample_rate: 16000
                } : {
                    text: '' // Will be filled by STT
                }
            };
            
            // Add pipeline ID if available
            if (pipelineId) {
                pipelineRequest.pipeline = pipelineId;
            }
            
            // Set up handler for pipeline events
            this.pendingPipelineEvents = new Promise((resolve, reject) => {
                this.pipelineResolve = resolve;
                this.pipelineReject = reject;
            });
            
            console.log('Starting assist pipeline:', pipelineRequest);
            this.wsConnection.send(JSON.stringify(pipelineRequest));
            
            // For voice input, wait for the run-start event to get the binary handler ID
            if (isVoiceInput) {
                await this.pendingPipelineEvents;
                // Start capturing audio and sending it
                await this.startAudioStreaming();
            }
            
        } catch (error) {
            console.error('Pipeline error:', error);
            this.stopListening();
            this.displayResponse('Sorry, there was an error starting the voice pipeline: ' + error.message);
        }
    }
    
    async startAudioStreaming() {
        try {
            const audioContext = new AudioContext({ sampleRate: 16000 });
            this.activeAudioContext = audioContext;
            const source = audioContext.createMediaStreamSource(this.audioStream);
            
            // Use ScriptProcessor for audio data
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            this.audioProcessor = processor;
            
            processor.onaudioprocess = (e) => {
                if (!this.isListening || this.sttBinaryHandlerId === null) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert to 16-bit PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }
                
                // Create binary message: handler_id byte + audio data
                const buffer = new ArrayBuffer(1 + pcmData.byteLength);
                const view = new Uint8Array(buffer);
                view[0] = this.sttBinaryHandlerId;
                view.set(new Uint8Array(pcmData.buffer), 1);
                
                // Send binary audio data over WebSocket
                if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
                    this.wsConnection.send(buffer);
                }
                
                // Reset timeout on audio activity
                this.lastInteractionTime = Date.now();
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            // Set timeout to stop after period of silence
            this.sttTimeout = setInterval(() => {
                if (Date.now() - this.lastInteractionTime > this.config.sttTimeout * 1000) {
                    console.log('STT timeout reached, stopping audio stream');
                    this.stopAudioStreaming();
                    clearInterval(this.sttTimeout);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Audio streaming error:', error);
            throw error;
        }
    }
    
    stopAudioStreaming() {
        // Send end-of-audio signal (single byte with handler ID)
        if (this.sttBinaryHandlerId !== null && this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
            const endSignal = new Uint8Array([this.sttBinaryHandlerId]);
            this.wsConnection.send(endSignal);
            console.log('Sent end-of-audio signal');
        }
        
        // Clean up audio processor
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        
        if (this.activeAudioContext) {
            this.activeAudioContext.close();
            this.activeAudioContext = null;
        }
        
        this.sttBinaryHandlerId = null;
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
            const response = await fetch('/api/ha/conversation/process', {
                method: 'POST',
                headers: {
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
        if (!text) return;
        
        if (!this.isConnected) {
            this.displayResponse('Not connected to Home Assistant. Please wait for connection.');
            return;
        }
        
        this.elements.textInput.value = '';
        this.elements.transcriptText.textContent = text;
        this.isProcessing = true;
        this.updateStatus('Processing...', 'processing');
        
        try {
            // Use assist_pipeline/run with intent stage for text input
            this.pipelineSubscriptionId = ++this.messageId;
            
            const pipelineRequest = {
                id: this.pipelineSubscriptionId,
                type: 'assist_pipeline/run',
                start_stage: 'intent',
                end_stage: 'tts',
                input: {
                    text: text
                }
            };
            
            // Add pipeline ID if available
            if (this.config.pipelineId) {
                pipelineRequest.pipeline = this.config.pipelineId;
            }
            
            console.log('Running text pipeline:', pipelineRequest);
            this.wsConnection.send(JSON.stringify(pipelineRequest));
            
            // The events will be handled by handleEvent
            
        } catch (error) {
            console.error('Text input error:', error);
            this.displayResponse('Sorry, there was an error processing your request: ' + error.message);
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
            const response = await fetch('/api/ha/tts_get_url', {
                method: 'POST',
                headers: {
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
        console.log('Wake word toggle clicked, current state:', this.wakeWordEnabled);
        this.wakeWordEnabled = !this.wakeWordEnabled;
        console.log('New wake word state:', this.wakeWordEnabled);
        
        if (this.wakeWordEnabled) {
            // Request microphone permission first
            try {
                this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                console.log('Microphone access granted');
            } catch (error) {
                console.error('Microphone access denied:', error);
                alert('Microphone access is required for wake word detection');
                this.wakeWordEnabled = false;
                return;
            }
            
            this.elements.wakewordSwitch.classList.add('active');
            await this.startWakeWordDetection();
        } else {
            this.elements.wakewordSwitch.classList.remove('active');
            this.stopWakeWordDetection();
        }
    }
    
    async startWakeWordDetection() {
        // Wait for WakeWordEngine to load
        let attempts = 0;
        while (typeof WakeWordEngine === 'undefined' && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
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
                this.wakeWordDetector.on('ready', () => {
                    console.log('Wake word engine ready');
                });
                this.wakeWordDetector.on('error', (error) => {
                    console.error('Wake word engine error:', error);
                });
                await this.wakeWordDetector.start();
                console.log('Wake word engine started');
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
