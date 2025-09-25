const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');
const router = express.Router();
const sendEmail = require('./utils/sendEmail');
const JWT_SECRET = 'your_jwt_secret_here'; 
const TOKEN_EXPIRATION = '1h';

// Helper to generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });
}

// Register new user
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields'});
  }

  try {
    const usersRef = admin.database().ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    if (snapshot.exists()) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserRef = usersRef.push();
    const newUser = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      isPremium: false,
      createdAt: new Date().toISOString(),
      privacy: { showAge: true, showOnlineStatus: true },
      profileCompleted: 'pending',
      emailVerified: 'unverified',
    };

    await newUserRef.set(newUser);
    const token = generateToken(newUserRef.key);

    res.status(201).json({ token, userId: newUserRef.key });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const usersRef = admin.database().ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    if (!snapshot.exists()) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    let userId = null;
    let userData = null;
    snapshot.forEach(child => {
      userId = child.key;
      userData = child.val();
    });

    const passwordMatch = await bcrypt.compare(password, userData.password);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(userId);
    res.json({ token, userId });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user data (protected)
router.put('/user', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const updates = { ...req.body };

  try {
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
      updates.passwordUpdatedAt = new Date().toISOString();
    }

    await userRef.update(updates);
    const updatedUser = (await userRef.once('value')).val();

    res.json({ user: { id: userId, ...updatedUser } });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected)
router.get('/user', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = snapshot.val();
    res.json({ user: { id: userId, ...user } });
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account (protected)
router.delete('/user', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const userRef = admin.database().ref(`users/${userId}`);
    await userRef.remove();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/send-verification', authenticateToken, async (req, res) => {
  const userId = req.user.userId; // get from token
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'User not found' });

    // Generate 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Save to db with expiry
    const verificationData = { code, createdAt: Date.now() };
    await userRef.update({ verification: verificationData });

    // Send email
    const subject = 'Your Verification Code';
    const message = `Your verification code is: ${code}`;
    const emailSent = await sendEmail(email, subject, message);
    if (!emailSent) return res.status(500).json({ error: 'Failed to send email' });

    return res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify email (protected)
router.post('/verify-email', authenticateToken, async (req, res) => {
  const userId = req.user.userId; // get from token
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const userRef = admin.database().ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'User not found' });

    const user = snapshot.val();
    if (!user.verification) return res.status(400).json({ error: 'No verification code found' });

    const { code: savedCode, createdAt } = user.verification;
    if (Date.now() - createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: 'Verification code expired' });
    }

    if (savedCode !== code) return res.status(400).json({ error: 'Invalid code' });

    // mark verified
    await userRef.update({ emailVerified: 'verified', verification: null });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Forgot password route
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    const usersRef = admin.database().ref("users");
    const snapshot = await usersRef
      .orderByChild("email")
      .equalTo(email.trim())
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User with this email not found" });
    }

    // Generate reset token
    const generateToken = (length = 32) => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let token = "";
      for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return token;
    };

    const token = generateToken(40);
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
    const userKey = Object.keys(snapshot.val())[0];

    await admin.database().ref(`users/${userKey}`).update({
      resetToken: token,
      resetExpires: expiresAt,
    });

    // Create reset link
    const resetLink = `https://connecta.uk/passwordReset.php?token=${encodeURIComponent(
      token
    )}&email=${encodeURIComponent(email.trim())}`;

    const subject = "Password Reset Link";
    const emailBody = `
      <p>You requested to reset your password. This link will expire in 30 minutes:</p>
      <p><a href="${resetLink}" target="_blank">${resetLink}</a></p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    // Send email
    const emailSent = await sendEmail(email.trim(), subject, emailBody);

    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send reset email" });
    }

    return res.json({
      success: true,
      message: "Password reset instructions sent to email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const usersRef = admin.database().ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    let userKey = null;
    let userData = null;
    snapshot.forEach(child => {
      userKey = child.key;
      userData = child.val();
    });

    if (
      !userData.resetToken ||
      userData.resetToken !== token ||
      Date.now() > userData.resetExpires
    ) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await admin.database().ref(`users/${userKey}`).update({
      password: hashedPassword,
      resetToken: null,
      resetExpires: null,
      passwordUpdatedAt: new Date().toISOString(), 
    });

    res.json({ success: true, message: 'Password reset successful. Please log in again.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
