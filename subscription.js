const express = require('express');
const admin = require('firebase-admin');
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get user subscription data only
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const subscriptionRef = admin.database().ref(`subscriptions/${userId}`);
    const snapshot = await subscriptionRef.once('value');

    if (snapshot.exists()) {
      const subscriptionData = snapshot.val();
      res.json({ subscription: subscriptionData });
    } else {
      res.json({ subscription: null });
    }
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
