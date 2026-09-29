// Adds the Firebase config for Android push when google-services.json is present (download it from the
// Firebase console, see README "Push notifications"). Everything else lives in app.json.
const fs = require('fs');

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(fs.existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
  },
});
