import { GameSession } from "./session.js";
// Manual ICE signaling: works from static HTTPS hosting without a signaling service.
const encode = (o) => btoa(JSON.stringify(o));
const decode = (text) => {
  if (text.length > 60000) throw Error("Connection code is too large");
  return JSON.parse(atob(text.trim()));
};
function connectionCode(pc, address) {
  const description = {
    type: pc.localDescription.type,
    sdp: pc.localDescription.sdp,
  };
  if (address) {
    if (
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(address) ||
      address.split(".").some((n) => Number(n) > 255)
    )
      throw Error("Enter a valid local IPv4 address");
    description.sdp = description.sdp.replace(/[a-zA-Z0-9-]+\.local/g, address);
  }
  return encode(description);
}
async function gather(pc) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", change);
      reject(Error("Could not gather local network candidates"));
    }, 12000);
    function change() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", change);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", change);
  });
}
function channelMessages(channel, onMessage) {
  let serial = 0;
  const parts = new Map();
  channel.onmessage = ({ data }) => {
    try {
      const frame = JSON.parse(data);
      if (frame.chunk !== undefined) {
        let part = parts.get(frame.id);
        if (!part) {
          if (frame.total > 2000) return;
          part = { data: new Array(frame.total), received: 0 };
          parts.set(frame.id, part);
        }
        if (part.data[frame.chunk] === undefined) {
          part.data[frame.chunk] = frame.text;
          part.received++;
        }
        if (part.received === part.data.length) {
          parts.delete(frame.id);
          onMessage(JSON.parse(part.data.join("")));
        }
      } else onMessage(frame);
    } catch {}
  };
  return (msg) => {
    if (channel.readyState !== "open") return;
    const text = JSON.stringify(msg);
    if (text.length < 12000) {
      channel.send(text);
      return;
    }
    const id = ++serial,
      total = Math.ceil(text.length / 12000);
    for (let chunk = 0; chunk < total; chunk++)
      channel.send(
        JSON.stringify({
          id,
          chunk,
          total,
          text: text.slice(chunk * 12000, (chunk + 1) * 12000),
        }),
      );
  };
}
export class PeerRoom {
  constructor(seed, name, onStatus = () => {}) {
    this.seed = seed;
    this.name = name;
    this.status = onStatus;
    this.connections = [];
    this.readyState = 0;
    this.pending = [];
    this._onmessage = null;
    this.onclose = null;
    this.session = null;
    this.peerId = "host";
  }
  set onmessage(fn) {
    this._onmessage = fn;
    for (const m of this.pending) fn({ data: JSON.stringify(m) });
    this.pending = [];
  }
  get onmessage() {
    return this._onmessage;
  }
  emit(m) {
    if (this._onmessage) this._onmessage({ data: JSON.stringify(m) });
    else this.pending.push(m);
  }
  startHost() {
    this.session = new GameSession(this.seed);
    this.readyState = 1;
    this.session.join("host", this.name, (m) => this.emit(m));
  }
  async invite(address = "") {
    if (!this.session) this.startHost();
    if (this.connections.length >= 7) throw Error("Maximum seven guests");
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      }),
      channel = pc.createDataChannel("mindblast", { ordered: true }),
      id = "guest-" + (this.connections.length + 1);
    const send = channelMessages(channel, (m) => {
      if (m.type === "join") {
        this.session.join(id, m.name, send);
      } else this.session.handle(id, m);
    });
    channel.onopen = () => this.status("Guest connected");
    channel.onclose = () => {
      this.session.leave(id);
      this.status("Guest disconnected");
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed")
        this.status(
          "Direct connection failed. Check that both devices share a LAN without client isolation, then create a new invitation.",
        );
    };
    this.connections.push(pc);
    this.pendingPeer = pc;
    await pc.setLocalDescription(await pc.createOffer());
    await gather(pc);
    return connectionCode(pc, address);
  }
  async accept(answer) {
    if (!this.pendingPeer) throw Error("Create an invitation first");
    await this.pendingPeer.setRemoteDescription(decode(answer));
    this.status("Connecting directly over the local network…");
  }
  async answer(offer, address = "") {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.connections.push(pc);
    pc.ondatachannel = ({ channel }) => {
      this.sendRemote = channelMessages(channel, (m) => this.emit(m));
      channel.onopen = () => {
        this.readyState = 1;
        this.sendRemote({ type: "join", name: this.name });
        this.status("Connected directly to host");
      };
      channel.onclose = () => {
        this.readyState = 3;
        this.onclose?.({ reason: "Peer disconnected" });
      };
    };
    await pc.setRemoteDescription(decode(offer));
    await pc.setLocalDescription(await pc.createAnswer());
    await gather(pc);
    return connectionCode(pc, address);
  }
  send(raw) {
    const m = JSON.parse(raw);
    if (this.session) this.session.handle("host", m);
    else this.sendRemote?.(m);
  }
  close() {
    for (const pc of this.connections) pc.close();
    this.connections = [];
    this.readyState = 3;
    this.onclose?.({ reason: "Disconnected" });
  }
}
