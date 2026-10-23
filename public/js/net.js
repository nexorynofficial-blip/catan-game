// WebSocket client. Exposes window.Net.
(function () {
  const Net = {
    ws: null, code: null, playerId: null, host: false,
    _onState: null, _onError: null, _onChat: null, _onJoined: null,
    connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${proto}//${location.host}`);
      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'state' && this._onState) this._onState(msg.state);
        if (msg.type === 'error' && this._onError) this._onError(msg.message);
        if (msg.type === 'chat' && this._onChat) this._onChat(msg);
        if (msg.type === 'joined') {
          this.code = msg.code; this.playerId = msg.playerId; this.host = msg.host;
          localStorage.setItem('catan.code', msg.code);
          localStorage.setItem('catan.pid', msg.playerId);
          if (this._onJoined) this._onJoined(msg);
        }
      };
      this.ws.onclose = () => { if (this._onError) this._onError('disconnected'); };
      return new Promise(res => { this.ws.onopen = res; });
    },
    send(type, extra = {}) {
      const payload = { type, code: this.code, playerId: this.playerId, ...extra };
      this.ws.send(JSON.stringify(payload));
    },
    on(evt, cb) { this['_on' + evt[0].toUpperCase() + evt.slice(1)] = cb; },
  };
  window.Net = Net;
})();
