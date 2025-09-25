// routes/matches.js
const express = require('express');
const admin = require('./firebase'); 
const authenticateToken = require('./middleware/authMiddleware');

const router = express.Router();
const db = admin.database();

// Helper: calculate age from birthday string
function getAge(birthdayString) {
  const [day, month, year] = birthdayString.split('/');
  const birthDate = new Date(`${year}-${month}-${day}`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

// GET /matches/:userId?search=&minAge=&maxAge=&gender=&location=
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { search, minAge, maxAge, gender, location } = req.query;

    // 1. Get current user
    const currentUserSnap = await db.ref(`users/${userId}`).once('value');
    if (!currentUserSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentUser = currentUserSnap.val();

    // 2. Get all users
    const usersSnap = await db.ref('users').once('value');
    const allUsers = usersSnap.val() || {};

    // 3. Apply compatibility logic
    const matches = Object.entries(allUsers)
      .filter(([id]) => id !== userId)
      .map(([id, user]) => ({ id, ...user }))
      .filter((u) => {
        if (u.profileCompleted === 'incomplete') return false;

        if (currentUser.genderPreferred && u.gender !== currentUser.genderPreferred) {
          return false;
        }

        if (currentUser.agePreference && u.birthday) {
          const age = getAge(u.birthday);
          if (currentUser.agePreference.includes('+')) {
            const min = parseInt(currentUser.agePreference.replace('+', ''), 10);
            if (age < min) return false;
          } else {
            const [min, max] = currentUser.agePreference.split('-').map(Number);
            if (age < min || age > max) return false;
          }
        }

        let hasCommon = false;

        if (
          currentUser.relationshipGoals?.length &&
          u.relationshipGoals?.length &&
          currentUser.relationshipGoals.some((goal) =>
            u.relationshipGoals.includes(goal)
          )
        ) {
          hasCommon = true;
        }

        if (
          currentUser.interests?.length &&
          u.interests?.length &&
          currentUser.interests.some((interest) =>
            u.interests.includes(interest)
          )
        ) {
          hasCommon = true;
        }

        if (
          currentUser.locationPreference &&
          u.location &&
          (
            currentUser.locationPreference.country === u.location.country ||
            currentUser.locationPreference.state === u.location.state ||
            currentUser.locationPreference.city === u.location.city
          )
        ) {
          hasCommon = true;
        }

        return hasCommon;
      })
      .filter((u) => {
        // 🔎 Apply frontend-like search/filters on backend
        const age = u.birthday ? getAge(u.birthday) : null;
        if (minAge && age && age < parseInt(minAge)) return false;
        if (maxAge && age && age > parseInt(maxAge)) return false;
        if (gender && u.gender !== gender) return false;
        if (
          search &&
          !(
            u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
            u.lastName?.toLowerCase().includes(search.toLowerCase())
          )
        ) {
          return false;
        }
        if (location && u.location) {
          const loc = location.toLowerCase();
          if (
            !(
              u.location.city?.toLowerCase().includes(loc) ||
              u.location.state?.toLowerCase().includes(loc) ||
              u.location.country?.toLowerCase().includes(loc)
            )
          ) {
            return false;
          }
        }
        return true;
      });

    res.json(matches);
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

module.exports = router;
