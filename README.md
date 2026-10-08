# CS312 Blog Web App

Blog app made with Node.js, Express, EJS and PostgreSQL. You can sign up, sign in, and create, edit and delete your own posts.

## Running it

1. In pgAdmin create a database called BlogDB with a `users` table and a `blogs` table (columns below) and add some sample data
2. Copy `.env.example` to `.env` and put in your PostgreSQL user and password
3. Run `npm install` and then `npm start`
4. Open `http://localhost:3000`

## Database

- `users`: user_id (primary key), password, name
- `blogs`: blog_id (primary key), creator_name, creator_user_id (foreign key to users), title, body, category, date_created

Passwords are saved as bcrypt hashes.
