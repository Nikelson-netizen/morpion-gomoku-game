const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const onlinePlayers = new Map();
const publicMatches = [];

function broadcastPlayers() {
  const players = [...onlinePlayers.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    status: p.status,
  }));

  io.emit("onlinePlayers", players);
}

function broadcastMatches() {
  io.emit("publicMatches", publicMatches);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("registerOnlinePlayer", ({ name }) => {
    const cleanName = String(name || "").trim().slice(0, 20);

    if (!cleanName) {
      socket.emit("errorMessage", "Invalid player name.");
      return;
    }

    onlinePlayers.set(socket.id, {
      name: cleanName,
      status: "available",
    });

    const players = [...onlinePlayers.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      status: p.status,
      isMe: id === socket.id,
    }));

    socket.emit("onlinePlayers", players);

    broadcastPlayers();
    broadcastMatches();
  });

  socket.on("invitePlayer", ({ targetId }) => {
    const me = onlinePlayers.get(socket.id);
    const other = onlinePlayers.get(targetId);

    if (!me) {
      socket.emit("errorMessage", "You must go online first.");
      return;
    }

    if (!other) {
      socket.emit("errorMessage", "This player is no longer online.");
      return;
    }

    if (socket.id === targetId) {
      socket.emit("errorMessage", "You cannot invite yourself.");
      return;
    }

    if (me.status !== "available" || other.status !== "available") {
      socket.emit("errorMessage", "One of the players is already in a game.");
      return;
    }

    me.status = "playing";
    other.status = "playing";

    publicMatches.push({
      id: `${socket.id}-${targetId}`,
      blackId: socket.id,
      whiteId: targetId,
      blackName: me.name,
      whiteName: other.name,
    });

    socket.emit("inviteSent", { ok: true });

    broadcastPlayers();
    broadcastMatches();
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    onlinePlayers.delete(socket.id);

    for (let i = publicMatches.length - 1; i >= 0; i--) {
      const match = publicMatches[i];
      if (match.blackId === socket.id || match.whiteId === socket.id) {
        const otherId = match.blackId === socket.id ? match.whiteId : match.blackId;
        const other = onlinePlayers.get(otherId);
        if (other) other.status = "available";
        publicMatches.splice(i, 1);
      }
    }

    broadcastPlayers();
    broadcastMatches();
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});