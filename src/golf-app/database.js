const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'golf_players.db');

function createDatabase() {
  const db = new Database(DB_PATH);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      handicap REAL DEFAULT 0,
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      zip_code TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      playing_frequency TEXT DEFAULT 'weekly',
      skill_level TEXT DEFAULT 'intermediate',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preferred_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_name TEXT NOT NULL,
      city TEXT DEFAULT '',
      UNIQUE(user_id, course_name)
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      message TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requester_id, receiver_id)
    );
  `);

  return db;
}

function seedDatabase(db) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (count > 0) return;

  const hash = bcrypt.hashSync('password123', 10);

  const players = [
    {
      name: 'James Mitchell', email: 'james@example.com', handicap: 8.4,
      city: 'Austin', state: 'TX', playing_frequency: 'weekly', skill_level: 'intermediate',
      bio: 'Weekend golfer looking for friendly rounds. Love early morning tee times!',
      courses: ['Barton Creek Country Club', 'Lions Municipal Golf Course']
    },
    {
      name: 'Sarah Chen', email: 'sarah@example.com', handicap: 12.1,
      city: 'Austin', state: 'TX', playing_frequency: 'multiple_weekly', skill_level: 'intermediate',
      bio: 'Former college athlete now hooked on golf. Always up for 18 holes!',
      courses: ['Austin Country Club', 'Avery Ranch Golf Club']
    },
    {
      name: 'Mike Rodriguez', email: 'mike@example.com', handicap: 3.2,
      city: 'Austin', state: 'TX', playing_frequency: 'daily', skill_level: 'advanced',
      bio: 'Scratch golfer seeking competitive rounds. Happy to share tips too.',
      courses: ['Barton Creek Country Club', 'The University of Texas Golf Club']
    },
    {
      name: 'Emma Thompson', email: 'emma@example.com', handicap: 18.7,
      city: 'Round Rock', state: 'TX', playing_frequency: 'weekly', skill_level: 'beginner',
      bio: 'New to the game but loving every minute. Patient partners welcome!',
      courses: ['Forest Creek Golf Club', 'Avery Ranch Golf Club']
    },
    {
      name: 'David Park', email: 'david@example.com', handicap: 15.3,
      city: 'Cedar Park', state: 'TX', playing_frequency: 'biweekly', skill_level: 'intermediate',
      bio: 'Golf is my therapy. Looking for laid-back rounds with good company.',
      courses: ['Crystal Falls Golf Course', 'Avery Ranch Golf Club']
    },
    {
      name: 'Lisa Anderson', email: 'lisa@example.com', handicap: 22.5,
      city: 'Austin', state: 'TX', playing_frequency: 'biweekly', skill_level: 'beginner',
      bio: "Social golfer who loves the 19th hole as much as the 18! Let's have fun out there.",
      courses: ['Lions Municipal Golf Course', 'Morris Williams Golf Course']
    },
    {
      name: 'Tom Wilson', email: 'tom@example.com', handicap: 6.8,
      city: 'Georgetown', state: 'TX', playing_frequency: 'multiple_weekly', skill_level: 'advanced',
      bio: 'Competitive player, former club champion. Looking for stroke play and match play.',
      courses: ['Berry Creek Country Club', 'Cimarron Hills Golf & Country Club']
    },
    {
      name: 'Rachel Green', email: 'rachel@example.com', handicap: 14.2,
      city: 'Austin', state: 'TX', playing_frequency: 'weekly', skill_level: 'intermediate',
      bio: 'Work hard, golf harder. Early bird golfer — 7am tee times preferred.',
      courses: ['Barton Creek Country Club', 'Falconhead Golf Club']
    },
    {
      name: 'Chris Johnson', email: 'chris@example.com', handicap: 9.5,
      city: 'Pflugerville', state: 'TX', playing_frequency: 'multiple_weekly', skill_level: 'intermediate',
      bio: 'Scratch golfer in training! Love working on my game and meeting new people.',
      courses: ['Blackhawk Golf Club', 'Forest Creek Golf Club']
    },
    {
      name: 'Amanda Foster', email: 'amanda@example.com', handicap: 19.8,
      city: 'Austin', state: 'TX', playing_frequency: 'weekly', skill_level: 'beginner',
      bio: 'Golf newbie with enthusiasm! Looking for patient partners to learn alongside.',
      courses: ['Morris Williams Golf Course', 'Lions Municipal Golf Course']
    },
    {
      name: 'Ryan Burke', email: 'ryan@example.com', handicap: 1.4,
      city: 'Austin', state: 'TX', playing_frequency: 'daily', skill_level: 'expert',
      bio: 'Near scratch golfer. Play competitively in local tournaments. Always game for a good round.',
      courses: ['Austin Country Club', 'Barton Creek Country Club', 'The University of Texas Golf Club']
    },
    {
      name: 'Nicole Davis', email: 'nicole@example.com', handicap: 11.0,
      city: 'Buda', state: 'TX', playing_frequency: 'weekly', skill_level: 'intermediate',
      bio: "Golf is life! Love playing in all weather. Weekend warrior looking for regular partners.",
      courses: ['Plum Creek Golf Course', 'Falconhead Golf Club']
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, handicap, city, state, bio, playing_frequency, skill_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCourse = db.prepare(`
    INSERT OR IGNORE INTO preferred_courses (user_id, course_name, city) VALUES (?, ?, ?)
  `);

  for (const p of players) {
    const result = insertUser.run(p.email, hash, p.name, p.handicap, p.city, p.state, p.bio, p.playing_frequency, p.skill_level);
    for (const course of p.courses) {
      insertCourse.run(result.lastInsertRowid, course, p.city);
    }
  }

  console.log(`  Seeded ${players.length} sample players (login: any@example.com / password123)`);
}

module.exports = { createDatabase, seedDatabase };
