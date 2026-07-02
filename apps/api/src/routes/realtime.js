const { handleWebSocket } = require("../controller");

module.exports = function (fastify, opts, done) {
  // WebSocket connection handler using controller
  fastify.get("/", { websocket: true }, handleWebSocket);

  done();
};
