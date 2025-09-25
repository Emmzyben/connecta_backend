const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const notifications = [];

    // Get likes notifications
    const likesRef = admin.database().ref('likedUsers');
    const likesSnapshot = await likesRef.once('value');
    const likesData = likesSnapshot.val() || {};

    for (const likerId in likesData) {
      if (likerId !== userId && likesData[likerId][userId]) {
        const timestamp = likesData[likerId][userId].timestamp || Date.now();

        // Get liker user data
        const userSnapshot = await admin.database().ref(`users/${likerId}`).once('value');
        if (userSnapshot.exists()) {
          const profile = userSnapshot.val();
          notifications.push({
            id: `like-${likerId}`,
            type: 'like',
            senderId: likerId,
            timestamp,
            name: `${profile.firstName} ${profile.lastName}`,
            avatar: profile.photos?.[0] || null,
          });
        }
      }
    }

    // Get message notifications
    const conversationsRef = admin.database().ref('conversations');
    const conversationsSnapshot = await conversationsRef.once('value');
    const conversationsData = conversationsSnapshot.val() || {};

    for (const convId in conversationsData) {
      const conv = conversationsData[convId];
      if (!conv.participants || !conv.lastMessage) continue;

      // Only show conversations where the user is a participant
      if (conv.participants[userId]) {
        // Find the other user in the conversation
        const otherUserId = Object.keys(conv.participants).find(id => id !== userId);
        if (!otherUserId) continue;

        // Get other user data
        const userSnapshot = await admin.database().ref(`users/${otherUserId}`).once('value');
        if (userSnapshot.exists()) {
          const profile = userSnapshot.val();
          notifications.push({
            id: `message-${convId}`,
            type: 'message',
            senderId: otherUserId,
            timestamp: conv.lastMessageTime || Date.now(),
            name: `${profile.firstName} ${profile.lastName}`,
            avatar: profile.photos?.[0] || null,
            lastMessage: conv.lastMessage,
            unread: conv.unreadCounts?.[userId] || 0,
          });
        }
      }
    }

    // Sort notifications by timestamp (newest first)
    const sortedNotifications = notifications.sort((a, b) => b.timestamp - a.timestamp);

    res.json({ notifications: sortedNotifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark notifications as read (for messages)
router.post('/mark-read', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { conversationId } = req.body;

  if (!conversationId) {
    return res.status(400).json({ error: 'Conversation ID is required' });
  }

  try {
    const conversationRef = admin.database().ref(`conversations/${conversationId}`);
    const snapshot = await conversationRef.once('value');

    if (snapshot.exists()) {
      const conversation = snapshot.val();

      // Reset unread count for this user
      if (conversation.unreadCounts && conversation.unreadCounts[userId]) {
        await conversationRef.child('unreadCounts').child(userId).set(0);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
