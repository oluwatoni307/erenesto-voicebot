class AudioChatbot {
  constructor(config = {}) {
    this.config = {
      title: config.title || "Voice Assistant",
      model: config.model || "gpt-4o-realtime-preview-2024-12-17",
      instructions: config.prompt || "Respond concisely",
    };

    this.localStream = null;
    this.pc = null;
    this.dc = null;
    this.isPaused = false;
    this.connectionState = "disconnected";

    // DOM elements
    this.headerTitle = document.getElementById("headerTitle");
    this.connectionIcon = document.getElementById("connectionIcon");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.statusText = document.getElementById("status");
    this.hintText = document.getElementById("hint");
    this.mainMicIcon = document.getElementById("mainMicIcon");
    this.waveContainer = document.getElementById("waveContainer");
    this.startButton = document.getElementById("startButton");
    this.pauseButton = document.getElementById("pauseButton");
    this.stopButton = document.getElementById("stopButton");
    this.audioEl = document.getElementById("audioOutput");

    // Initial UI setup
    this.setTitle();
    this.updateConnectionStatus("disconnected");
    this.waveContainer.style.display = "none";

    // Event listeners
    this.addEventListeners();
  }

  setTitle() {
    this.headerTitle.textContent = this.config.title;
  }

  updateConnectionStatus(state) {
    this.connectionState = state;
    let color, text;
    switch (state) {
      case "disconnected":
        color = "bg-red-500";
        text = "Disconnected";
        break;
      case "connecting":
        color = "bg-yellow-500";
        text = "Connecting";
        break;
      case "connected":
        color = "bg-green-500";
        text = "Connected";
        break;
    }
    this.connectionIcon.className = `w-2 h-2 ${color} rounded-full`;
    this.connectionStatus.textContent = text;
  }

  addEventListeners() {
    this.startButton.addEventListener("click", () => this.startConversation());
    this.pauseButton.addEventListener("click", () => this.togglePause());
    this.stopButton.addEventListener("click", () => this.stopConversation());

    this.audioEl.addEventListener("play", () => {
      this.statusText.textContent = "You are connected";
      this.hintText.textContent = "you can start by saying hi";
    });
    this.audioEl.addEventListener("pause", () => this.updateStatusText());
    this.audioEl.addEventListener("ended", () => this.updateStatusText());
  }

  async startConversation() {
    this.startButton.disabled = true;
    this.pauseButton.disabled = false;
    this.stopButton.disabled = false;
    this.updateConnectionStatus("connecting");
    this.statusText.textContent = "Connecting...";
    this.hintText.textContent = "Establishing connection...";

    const ephemeralKey = await this.getSessionKey();
    if (ephemeralKey) {
      await this.initWebRTC(ephemeralKey);
      this.updateConnectionStatus("connected");
      this.updateUIForListening();
    } else {
      this.stopConversation();
    }
  }

  stopConversation() {
    this.cleanupWebRTC();
    this.isPaused = false;
    this.updateConnectionStatus("disconnected");
    this.statusText.textContent = "Start Conversation";
    this.hintText.textContent = "Click the microphone to start listening";
    this.mainMicIcon.className = "ri-mic-off-line text-6xl text-gray-300";
    this.waveContainer.style.display = "none";
    this.startButton.disabled = false;
    this.pauseButton.disabled = true;
    this.stopButton.disabled = true;
    this.updatePauseButton();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.pauseConversation();
    } else {
      this.resumeConversation();
    }
    this.updatePauseButton();
  }

  pauseConversation() {
    if (this.localStream) {
      this.localStream.getAudioTracks()[0].enabled = false;
    }
    this.statusText.textContent = "Continue Conversation";
    this.hintText.textContent = "Click resume to continue";
    this.mainMicIcon.className = "ri-mic-off-line text-6xl text-gray-300";
    this.waveContainer.style.display = "none";
  }

  resumeConversation() {
    if (this.localStream) {
      this.localStream.getAudioTracks()[0].enabled = true;
    }
    this.updateUIForListening();
  }

  updateUIForListening() {
    this.statusText.textContent = "Listening...";
    this.hintText.textContent = "Speak now or click pause to stop";
    this.mainMicIcon.className = "ri-mic-line text-6xl text-primary";
    this.waveContainer.style.display = "flex";
  }

  updateStatusText() {
    if (this.isPaused) {
      this.statusText.textContent = "Continue Conversation";
      this.hintText.textContent = "Click resume to continue";
    } else if (this.connectionState === "connected") {
      this.statusText.textContent = "Listening...";
      this.hintText.textContent = "Speak now or click pause to stop";
    } else {
      this.statusText.textContent = "Start Conversation";
      this.hintText.textContent = "Click the microphone to start listening";
    }
  }

  updatePauseButton() {
    const span = this.pauseButton.querySelector("span");
    const icon = this.pauseButton.querySelector("i");
    if (this.isPaused) {
      span.textContent = "Resume";
      icon.className = "ri-play-line text-xl";
    } else {
      span.textContent = "Pause";
      icon.className = "ri-pause-line text-xl";
    }
  }

  async getSessionKey() {
    try {
      const response = await fetch("https://ernesto-sessionkey-1.onrender.com/session", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to get session key");
      return await response.json();
    } catch (error) {
      console.error("Error fetching session key:", error);
      this.statusText.textContent = "Failed to connect. Please try again.";
      return null;
    }
  }

  async initWebRTC(ephemeralKey) {
    try {
      this.pc = new RTCPeerConnection();
      this.pc.ontrack = (e) => (this.audioEl.srcObject = e.streams[0]);
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.pc.addTrack(this.localStream.getTracks()[0]);
      this.dc = this.pc.createDataChannel("oai-events");

      this.dc.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (!this.isPaused && event.type === "input_audio_buffer.speech_started") {
          this.statusText.textContent = "You're Speaking...";
          this.hintText.textContent = "Keep speaking...";
        } else if (event.type === "input_audio_buffer.speech_stopped") {
          if (!this.isPaused) this.updateUIForListening();
        }
      };

      this.dc.onopen = () => {
        this.dc.send(JSON.stringify({
          type: "session.update",
          session: { instructions: this.config.instructions },
        }));
      };

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const response = await fetch(`https://api.openai.com/v1/realtime?model=${this.config.model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });
      const answer = { type: "answer", sdp: await response.text() };
      await this.pc.setRemoteDescription(answer);
    } catch (error) {
      console.error("Error initializing WebRTC:", error);
      this.statusText.textContent = "Failed to initialize. Please try again.";
      this.stopConversation();
    }
  }

  cleanupWebRTC() {
    if (this.pc) this.pc.close();
    if (this.localStream) this.localStream.getTracks().forEach(track => track.stop());
    this.pc = null;
    this.dc = null;
    this.localStream = null;
    this.audioEl.srcObject = null;
  }
}