const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();

// Get a reference to the database
const database = admin.database();

/**
 * GET conversation messages
 */
router.get("/messages/:conversationId", authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const snapshot = await database.ref(`messages/${conversationId}`).get();

    if (!snapshot.exists()) return res.json([]);

    const messages = Object.keys(snapshot.val())
      .map((key) => ({ id: key, ...snapshot.val()[key] }))
      .sort((a, b) => a.timestamp - b.timestamp);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST new message (text only, media handled in frontend)
 */

router.post("/messages/:conversationId", authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text, senderId, receiverId, type, mediaUrl } = req.body;

    const messageData = {
      text: text || null,
      senderId,
      receiverId,
      timestamp: Date.now(),
      type: type || "text",
      mediaUrl: mediaUrl || null,
      read: false,
    };

    // Push new message
    await database.ref(`messages/${conversationId}`).push(messageData);

    // Fetch user data for participants
    const [senderSnap, receiverSnap] = await Promise.all([
      database.ref(`users/${senderId}`).get(),
      database.ref(`users/${receiverId}`).get(),
    ]);

    const senderData = senderSnap.exists() ? senderSnap.val() : {};
    const receiverData = receiverSnap.exists() ? receiverSnap.val() : {};

    // Get existing conversation
    const convRef = database.ref(`conversations/${conversationId}`);
    const snapshot = await convRef.get();
    const existing = snapshot.exists() ? snapshot.val() : {};

    // Handle unread counts
    const prevUnread = existing?.unreadCounts?.[receiverId] || 0;

    // Build participants (always refresh from user data)
    const participants = {
      [senderId]: {
        userName: senderData.firstName || "Unknown",
        userPhoto: senderData.photos?.[0] || null,
      },
      [receiverId]: {
        userName: receiverData.firstName || "Unknown",
        userPhoto: receiverData.photos?.[0] || null,
      },
    };

    // Build conversation object
    const convData = {
      lastMessage:
        text ||
        (type === "image" ? "📷 Photo" : type === "video" ? "🎥 Video" : ""),
      lastMessageTime: messageData.timestamp,
      participants,
      unreadCounts: {
        [senderId]: 0,
        [receiverId]: prevUnread + 1,
      },
    };

    // If first message → also set createdAt
    if (!snapshot.exists()) {
      convData.createdAt = messageData.timestamp;
    }

    await convRef.set(convData);

    res.json({ success: true, message: messageData, conversation: convData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET user data
 */
router.get("/user/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const snapshot = await database.ref(`users/${userId}`).get();
    res.json(snapshot.exists() ? snapshot.val() : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Typing status
 */
router.post("/typing/:conversationId/:userId", authenticateToken, async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const { typing } = req.body;
    await database.ref(`typingStatus/${conversationId}/${userId}`).set(typing === true);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Reset unread count
 */
router.post("/conversations/:conversationId/resetUnread", authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const convRef = database.ref(`conversations/${conversationId}`);
    const snapshot = await convRef.get();
    if (!snapshot.exists()) return res.json({ success: false });

    const data = snapshot.val();
    await convRef.update({
      unreadCounts: { ...(data.unreadCounts || {}), [userId]: 0 },
      lastRead: { ...(data.lastRead || {}), [userId]: new Date().toISOString() },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET typing status
 */
router.get("/typing/:conversationId/:userId", authenticateToken, async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const snapshot = await database.ref(`typingStatus/${conversationId}/${userId}`).get();
    const typing = snapshot.exists() ? snapshot.val() : false;
    res.json({ typing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
