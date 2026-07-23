// Real-time WebSocket Controller
const rooms = new Map();
const userSockets = new Map();

module.exports.handleWebSocket = (connection, request) => {
  try {
    const socket = connection.socket || connection;
    const query = (request && request.query) || {};
    const mediaId = query.mediaId || "default";
    const userId = query.userId;

    if (!rooms.has(mediaId)) {
      rooms.set(mediaId, new Set());
    }
    const room = rooms.get(mediaId);
    room.add(socket);

    if (userId) {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket);
      console.log(`[Realtime WS] Registered user socket for userId: ${userId}`);
    }

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
      if (userId && userSockets.has(userId)) {
        const uSockets = userSockets.get(userId);
        uSockets.delete(socket);
        if (uSockets.size === 0) {
          userSockets.delete(userId);
        }
      }
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

module.exports.sendNotificationToUser = (userId, notification) => {
  try {
    if (!userId || !userSockets.has(userId)) return;
    const sockets = userSockets.get(userId);
    const payload = JSON.stringify({ type: 'NEW_NOTIFICATION', notification });
    for (const socket of sockets) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(payload);
      }
    }
  } catch (err) {
    console.error(`[Realtime WS] Error sending notification to user ${userId}:`, err);
  }
};



