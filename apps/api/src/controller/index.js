const analyticsController = require('./analyticsController');
const annotationController = require('./annotationController');
const authController = require('./authController');
const collectionController = require('./collectionController');
const compressionController = require('./compressionController');
const healthController = require('./healthController');
const organizationController = require('./organizationsController');
const realtimeController = require('./realtimeController');
const userController = require('./userController');

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
};