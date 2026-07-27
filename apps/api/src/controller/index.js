const analyticsController = require('./analyticsController');
const annotationController = require('./annotationController');
const authController = require('./authController');
const collectionController = require('./collectionController');
const compressionController = require('./compressionController');
const healthController = require('./healthController');
const mediaController = require('./mediaController');
const organizationController = require('./organizationsController');
const realtimeController = require('./realtimeController');
const userController = require('./userController');
const roomController = require('./roomController');
const cronController = require('./cronController');
const notificationController = require('./notificationController');

module.exports = {
  ...annotationController,
  ...authController,
  ...healthController,
  ...collectionController,
  ...compressionController,
  ...analyticsController,
  ...organizationController,
  ...realtimeController,
  ...userController,
  ...mediaController,
  ...roomController,
  ...cronController,
  ...notificationController,
  ...require('./workSpaceController'),
};