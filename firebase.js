// firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('./connecta-f12c3-firebase-adminsdk-fbsvc-1dca2bad83.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://connecta-f12c3-default-rtdb.firebaseio.com"
  });
}

module.exports = admin;
