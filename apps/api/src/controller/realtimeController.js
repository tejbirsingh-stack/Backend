// Real-time WebSocket Controller
const rooms = new Map();

module.exports.handleWebSocket = (connection, request) => {
  try {
    const socket = connection.socket || connection;
    const query = (request && request.query) || {};
    const mediaId = query.mediaId || "default";

    if (!rooms.has(mediaId)) {
      rooms.set(mediaId, new Set());
    }
    const room = rooms.get(mediaId);
    room.add(socket);

    console.log(`[Realtime WS] Client connected to room: ${mediaId}. Active clients: ${room.size}`);
    if (request && request.log) {
      request.log.info(`WebSocket client connected to room: ${mediaId}. Active clients in room: ${room.size}`);
    }

    // When a new client connects, request state sync from one existing client in the room
    if (room.size > 1) {
      for (const client of room) {
        if (client !== socket && client.readyState === 1 /* OPEN */) {
          client.send(JSON.stringify({ type: "REQUEST_SYNC" }));
          break;
        }
      }
    }

    socket.on("message", (rawMessage) => {
      try {
        const messageStr = rawMessage.toString();
        // Broadcast message to all other connected clients in the same room
        for (const client of room) {
          if (client !== socket && client.readyState === 1 /* OPEN */) {
            client.send(messageStr);
          }
        }
      } catch (err) {
        console.error(`[Realtime WS] Message error in room ${mediaId}:`, err);
      }
    });

    socket.on("close", () => {
      room.delete(socket);
      console.log(`[Realtime WS] Client disconnected from room: ${mediaId}. Active clients: ${room.size}`);
      if (room.size === 0) {
        rooms.delete(mediaId);
      }
    });

    socket.on("error", (err) => {
      console.error(`[Realtime WS] Socket error in room ${mediaId}:`, err);
    });
  } catch (err) {
    console.error("[Realtime WS] Handler top-level error:", err);
  }
};


