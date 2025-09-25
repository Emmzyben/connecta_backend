// routes/favorites.js
const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get favorites list
router.get('/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const favRef = admin.database().ref(`favorites/${userId}`);
    const snapshot = await favRef.once('value');
    const favorites = snapshot.val() || {};

    const results = [];
    for (const favId of Object.keys(favorites)) {
      const userSnap = await admin.database().ref(`users/${favId}`).once('value');
      if (userSnap.exists()) {
        results.push({
          id: favId,
          ...userSnap.val(),
          favoritedAt: favorites[favId].timestamp,
        });
      }
    }

    results.sort((a, b) => b.favoritedAt - a.favoritedAt);
    res.json(results);
  } catch (err) {
    console.error("Get favorites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove favorite
router.delete('/:userId/:favoriteId', authenticateToken, async (req, res) => {
  const { userId, favoriteId } = req.params;
  try {
    await admin.database().ref(`favorites/${userId}/${favoriteId}`).remove();
    res.json({ success: true });
  } catch (err) {
    console.error("Remove favorite error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send like
router.post('/:userId/like/:targetUserId', authenticateToken, async (req, res) => {
  const { userId, targetUserId } = req.params;
  try {
    const userSnap = await admin.database().ref(`users/${userId}`).once('value');
    const currentUser = userSnap.val();

    // Premium check
    if (!currentUser?.isPremium) {
      const likeSnap = await admin.database().ref(`likedUsers/${userId}`).once('value');
      const likeCount = likeSnap.exists() ? Object.keys(likeSnap.val()).length : 0;
      if (likeCount >= 5) {
        return res.status(403).json({ error: "Free users can only send 5 likes" });
      }
    }

    // Save like
    await admin.database().ref(`likedUsers/${userId}/${targetUserId}`).set({
      value: true,
      timestamp: Date.now(),
    });

    // Check if it's a match
    const backSnap = await admin.database().ref(`likedUsers/${targetUserId}/${userId}`).once('value');
    const isMatch = backSnap.exists();

    res.json({ success: true, isMatch });
  } catch (err) {
    console.error("Send like error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
