const jwt = require('jsonwebtoken');
const admin = require('../firebase'); 

const JWT_SECRET = 'your_jwt_secret_here';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.sendStatus(403);

    const userId = decoded.userId;
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) return res.sendStatus(403);

    const user = snapshot.val();

    // Invalidate token if issued before passwordUpdatedAt
    if (
      user.passwordUpdatedAt &&
      decoded.iat * 1000 < new Date(user.passwordUpdatedAt).getTime()
    ) {
      return res
        .status(401)
        .json({ error: 'Password was changed, please log in again' });
    }

    req.user = decoded;
    next();
  });
}

module.exports = authenticateToken;
