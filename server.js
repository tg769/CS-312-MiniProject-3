require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'BlogDB',
  password: process.env.DB_PASSWORD || undefined,
  port: process.env.DB_PORT || 5432
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'blog secret',
  resave: false,
  saveUninitialized: false
}));

// makes the logged in user available in every view
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

const CATEGORIES = ['Tech', 'Lifestyle', 'Education'];

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/signin');
  }
  next();
}

app.get('/', requireLogin, async (req, res) => {
  const { category } = req.query;
  try {
    let result;
    if (category) {
      result = await db.query('SELECT * FROM blogs WHERE category = $1 ORDER BY date_created DESC', [category]);
    } else {
      result = await db.query('SELECT * FROM blogs ORDER BY date_created DESC');
    }
    res.render('index', { posts: result.rows, categories: CATEGORIES, activeCategory: category || '' });
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not load the blogs');
  }
});

app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
  const { password } = req.body;
  try {
    const user_id = req.body.user_id.trim();
    const name = req.body.name.trim();
    if (!user_id || !name) {
      return res.render('signup', { error: 'Please fill in your name and user ID' });
    }
    const existing = await db.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
    if (existing.rows.length > 0) {
      return res.render('signup', { error: 'That user ID is already taken, try a different one' });
    }
    const hashed = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)', [user_id, hashed, name]);
    res.redirect('/signin');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not sign up');
  }
});

app.get('/signin', (req, res) => {
  res.render('signin', { error: null });
});

app.post('/signin', async (req, res) => {
  const { password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE user_id = $1', [req.body.user_id.trim()]);
    const found = result.rows[0];
    if (!found || !(await bcrypt.compare(password, found.password))) {
      return res.render('signin', { error: 'Wrong user ID or password' });
    }
    req.session.user = { id: found.user_id, name: found.name };
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not sign in');
  }
});

app.get('/signout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/signin');
  });
});

app.post('/posts', requireLogin, async (req, res) => {
  const { title, body, category } = req.body;
  try {
    await db.query(
      'INSERT INTO blogs (creator_name, creator_user_id, title, body, category, date_created) VALUES ($1, $2, $3, $4, $5, NOW())',
      [req.session.user.name, req.session.user.id, title, body, category]
    );
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not create the post');
  }
});

app.get('/posts/:id/edit', requireLogin, async (req, res) => {
  try {
    // only the creator can open the edit page
    const result = await db.query(
      'SELECT * FROM blogs WHERE blog_id = $1 AND creator_user_id = $2',
      [req.params.id, req.session.user.id]
    );
    if (result.rows.length === 0) {
      return res.redirect('/');
    }
    res.render('edit', { post: result.rows[0], categories: CATEGORIES });
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

app.post('/posts/:id/edit', requireLogin, async (req, res) => {
  const { title, body, category } = req.body;
  try {
    await db.query(
      'UPDATE blogs SET title = $1, body = $2, category = $3 WHERE blog_id = $4 AND creator_user_id = $5',
      [title, body, category, req.params.id, req.session.user.id]
    );
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not update the post');
  }
});

app.post('/posts/:id/delete', requireLogin, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2',
      [req.params.id, req.session.user.id]
    );
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not delete the post');
  }
});

app.get('/account', requireLogin, (req, res) => {
  res.render('account', { error: null, success: null });
});

app.post('/account', requireLogin, async (req, res) => {
  const newPassword = req.body.password;
  const oldId = req.session.user.id;
  try {
    const newId = req.body.user_id.trim();
    if (!newId) {
      return res.render('account', { error: 'User ID can not be empty', success: null });
    }
    if (newId !== oldId) {
      const existing = await db.query('SELECT * FROM users WHERE user_id = $1', [newId]);
      if (existing.rows.length > 0) {
        return res.render('account', { error: 'That user ID is already taken, try a different one', success: null });
      }
    }
    // leaving the password empty keeps the old one
    if (newPassword) {
      const hashed = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET user_id = $1, password = $2 WHERE user_id = $3', [newId, hashed, oldId]);
    } else {
      await db.query('UPDATE users SET user_id = $1 WHERE user_id = $2', [newId, oldId]);
    }
    req.session.user.id = newId;
    res.render('account', { error: null, success: 'Account updated' });
  } catch (err) {
    console.log(err);
    res.status(500).send('Could not update the account');
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
