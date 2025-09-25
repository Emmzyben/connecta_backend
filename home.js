const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

const database = admin.database();

router.get('/users', authenticateToken, async (req, res) => {
  try {
    const userSnap = await database.ref(`users`).get();
    const allUsers = userSnap.val() || {};

    res.json({ users: allUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/like/:targetId', authenticateToken, async (req, res) => {
  const { targetId } = req.params;
  const userId = req.user?.userId; 

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }

  try {
    const userSnap = await database.ref(`users/${userId}`).get();
    const currentUser = userSnap.val();

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPremium = currentUser?.isPremium === true;

    if (!isPremium) {
      const likesSnap = await database.ref(`likedUsers/${userId}`).get();
      const likesData = likesSnap.val() || {};

      if (Object.keys(likesData).length >= 5) {
        return res.status(403).json({ message: 'Free users can only like 5 people' });
      }
    }

    await database.ref(`likedUsers/${userId}/${targetId}`).set({
      value: true,
      timestamp: Date.now(),
    });

    const checkSnap = await database.ref(`likedUsers/${targetId}/${userId}`).get();

    if (checkSnap.exists()) {
      return res.json({ message: 'It’s a match!' });
    }

    res.json({ message: 'User liked successfully' });
  } catch (err) {
    console.error('Error in /like route:', err);
    res.status(500).json({ error: err.message });
  }
});




// ✅ Favorite a user
router.post('/favorite/:targetId', authenticateToken, async (req, res) => {
  const { targetId } = req.params;
  const userId = req.user?.userId; 

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }

  try {
    await database.ref(`favorites/${userId}/${targetId}`).set({
      timestamp: Date.now(),
    });
    res.json({ message: 'User favorited successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
