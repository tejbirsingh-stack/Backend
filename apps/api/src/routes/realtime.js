module.exports = function (fastify, opts, done) {
  // WebSocket connection handler
  fastify.get("/", { websocket: true }, (connection, req) => {
    connection.socket.on("message", (message) => {
      connection.socket.send(
        JSON.stringify({
          message: "WebSocket connections not yet fully implemented",
          received: message.toString(),
        })
      );
    });
  });

  done();
};
