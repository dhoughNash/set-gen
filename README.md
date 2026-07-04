# Set List Developer

A Hatch Show Print–styled set list builder for live performances.  
Manage your song catalog and auto-generate optimized sets by run time, tempo, mood, and composition mix.

**Stack:** Vanilla JS (ES modules) · Supabase (song database) · Netlify (hosting)

---

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/dhoughNash/set-gen.git
cd set-gen
```

### 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `set-gen`, pick a region

### 3. Create the songs table

In Supabase → **SQL Editor**, run:

```sql
create table songs (
  id    text primary key,
  title text not null,
  tempo text not null default 'up',
  type  text not null default 'original',
  len   integer not null default 0,
  intro integer not null default 0,
  mood  text,
  created_at timestamp with time zone default now()
);

alter table songs enable row level security;

create policy "Allow all"
  on songs for all
  using (true)
  with check (true);
```

### 4. Add your Supabase keys

```bash
cp js/config.example.js js/config.js
```

Open `js/config.js` and fill in your values from  
**Supabase → Settings → API**:

```js
export const SUPABASE_URL      = 'https://your-project-id.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

> `config.js` is gitignored — your keys stay local.

### 5. Serve locally

Because the app uses ES modules (`type="module"`), you need a local server — just opening `index.html` directly won't work.

```bash
# Python (built-in)
python3 -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080`.

---

## Netlify Deploy

1. Push to GitHub
2. In Netlify → **Add new site → Import from Git** → pick `dhoughNash/set-gen`
3. Build settings: leave blank (no build command, publish directory is `.`)
4. No environment variables needed — the anon key is safe to ship in client-side JS with RLS enabled

That's it. Netlify auto-deploys on every push to `main`.

---

## Project Structure

```
set-gen/
├── index.html              # App shell (HTML only)
├── css/
│   └── style.css           # All styles
├── js/
│   ├── app.js              # App logic (songs, generator, setlist)
│   ├── db.js               # Supabase storage layer
│   ├── config.js           # Your keys — gitignored, never committed
│   └── config.example.js   # Safe template — committed to repo
├── netlify.toml
└── README.md
```

---

## How It Works

| Data | Storage | Why |
|------|---------|-----|
| Song catalog | Supabase `songs` table | Permanent, cross-device |
| Active setlist order | `localStorage` | Ephemeral working state — regenerated each session |

Songs are written to Supabase on every add/edit/delete. The generated setlist (song order, locks) is kept in localStorage so it survives a page refresh but doesn't need to live in the database.
