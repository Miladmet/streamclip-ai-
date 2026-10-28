export class TwitchIRC {
  constructor(channel, { onClipCommand = () => {}, onMessage = () => {}, cooldownMs = 10_000 } = {}) {
    this.channel = channel.toLowerCase().replace(/^#/, "");
    this.onClipCommand = onClipCommand;
    this.onMessage = onMessage;
    this.cooldownMs = cooldownMs;
    this.lastClipAt = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.manualClose = false;
  }

  connect() {
    if (!this.channel || this.channel === "your_channel") {
      throw new Error("Enter a real Twitch channel name before connecting chat.");
    }
    this.manualClose = false;
    this.socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

    this.socket.addEventListener("open", () => {
      this.socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      this.socket.send("PASS SCHMOOPIIE");
      this.socket.send(`NICK justinfan${Math.floor(Math.random() * 900000 + 100000)}`);
      this.socket.send(`JOIN #${this.channel}`);
    });

    this.socket.addEventListener("message", event => this.#handle(event.data));
    this.socket.addEventListener("close", () => {
      if (!this.manualClose) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    });
  }

  #handle(raw) {
    for (const line of String(raw).split(/\r\n/)) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        this.socket?.readyState === WebSocket.OPEN &&
          this.socket.send("PONG :tmi.twitch.tv");
        continue;
      }

      // Twitch IRC tags may precede the prefix; parse username and trailing text.
      const match = line.match(/(?:^| ):(\w+)!.*? PRIVMSG #\S+ :(.*)$/);
      if (!match) continue;

      const message = { username: match[1], text: match[2], receivedAt: performance.now() };
      this.onMessage(message);

      if (message.text.trim().toLowerCase() === "!clip") {
        const now = Date.now();
        if (now - this.lastClipAt < this.cooldownMs) continue;
        this.lastClipAt = now;
        this.onClipCommand(message);
      }
    }
  }

  disconnect() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}
