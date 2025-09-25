const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get user data by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = snapshot.val();
    res.json({ user: { id: userId, ...user } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count for user
router.get('/:userId/unread-count', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const conversationsRef = admin.database().ref('conversations');
    const snapshot = await conversationsRef.once('value');
    const allConversations = snapshot.val() || {};

    let totalUnread = 0;
    Object.values(allConversations).forEach(conv => {
      if (conv.unreadCounts && conv.unreadCounts[userId]) {
        totalUnread += conv.unreadCounts[userId];
      }
    });

    res.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get likes count for user
router.get('/:userId/likes-count', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const likedUsersRef = admin.database().ref('likedUsers');
    const snapshot = await likedUsersRef.once('value');
    const data = snapshot.val() || {};

    const sentRaw = data[userId] || {};
    const sent = Object.keys(sentRaw);

    let received = [];
    for (const likerId in data) {
      if (likerId !== userId && data[likerId][userId]) {
        received.push(likerId);
      }
    }

    const requests = received.filter(id => !sent.includes(id));
    res.json({ likesCount: requests.length });
  } catch (error) {
    console.error('Get likes count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update online status for user
router.post('/:userId/online-status', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { onlineStatus } = req.body;
  if (!onlineStatus || !['online', 'offline'].includes(onlineStatus)) {
    return res.status(400).json({ error: 'Invalid online status' });
  }

  try {
    const userRef = admin.database().ref(`users/${userId}`);
    await userRef.update({
      onlineStatus,
      last_changed: Date.now(),
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Update online status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversations for user
router.get('/:userId/conversations', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const conversationsRef = admin.database().ref('conversations');
    const snapshot = await conversationsRef.once('value');
    const allConversations = snapshot.val() || {};

    const userConversations = Object.keys(allConversations)
      .map((convId) => {
        const data = allConversations[convId];
        if (!data.participants || !data.participants[userId]) return null;

        const otherUserId = Object.keys(data.participants).find(
          (id) => id !== userId
        );
        const otherUser = data.participants[otherUserId];

        return {
          id: convId,
          userName: otherUser?.userName || 'Unknown',
          userPhoto: otherUser?.userPhoto || null,
          lastMessage: data.lastMessage || '',
          lastMessageTime: data.lastMessageTime || '',
          unreadCount: data.unreadCounts?.[userId] || 0,
          otherUserId,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
      );

    res.json(userConversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update free limit hit status
router.post('/:userId/freeLimitHit', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { freeLimitHit } = req.body;

  try {
    const userRef = admin.database().ref(`users/${userId}`);
    await userRef.update({
      freeLimitHit: freeLimitHit || false,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Update free limit hit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
