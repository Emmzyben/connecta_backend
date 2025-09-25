const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get likes (sent, received, mutual) for a user
router.get('/:userId/likes', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const likedUsersRef = admin.database().ref('likedUsers');
    const snapshot = await likedUsersRef.once('value');
    const data = snapshot.val() || {};

    const sentRaw = data[userId] || {};
    const sent = Object.entries(sentRaw).map(([targetId, info]) => ({
      id: targetId,
      timestamp: info.timestamp || 0,
    }));

    let received = [];
    let mutual = [];

    for (const likerId in data) {
      if (likerId !== userId && data[likerId][userId]) {
        const info = data[likerId][userId];
        const receivedLike = {
          id: likerId,
          timestamp: info.timestamp || 0,
        };

        received.push(receivedLike);

        if (sent.find((s) => s.id === likerId)) {
          mutual.push(receivedLike);
        }
      }
    }

    const filteredReceived = received.filter(
      (r) => !sent.find((s) => s.id === r.id)
    );

    // Fetch user profiles for all involved
    const fetchProfiles = async (entries) => {
      const profiles = await Promise.all(
        entries.map(async ({ id, timestamp }) => {
          const snap = await admin.database().ref(`users/${id}`).once('value');
          return snap.exists() ? { id, timestamp, ...snap.val() } : null;
        })
      );
      return profiles.filter(Boolean);
    };

    const [sentProfiles, receivedProfiles, mutualProfiles] =
      await Promise.all([
        fetchProfiles(sent),
        fetchProfiles(filteredReceived),
        fetchProfiles(mutual),
      ]);

    res.json({
      sent: sentProfiles.sort((a, b) => b.timestamp - a.timestamp),
      received: receivedProfiles.sort((a, b) => b.timestamp - a.timestamp),
      mutual: mutualProfiles.sort((a, b) => b.timestamp - a.timestamp),
    });
  } catch (error) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Like back a user
router.post('/:userId/like-back/:targetId', authenticateToken, async (req, res) => {
  const { userId, targetId } = req.params;
  try {
    const likeData = {
      value: true,
      timestamp: Date.now(),
    };

    await admin.database().ref(`likedUsers/${userId}/${targetId}`).set(likeData);

    // Get target user data (for notifications if needed)
    const snap = await admin.database().ref(`users/${targetId}`).once('value');
    const targetUser = snap.val();

    res.json({
      success: true,
      message: `You liked ${targetUser?.firstName || 'this user'} back!`,
    });
  } catch (error) {
    console.error('Like back error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
