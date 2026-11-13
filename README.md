# The Travel Shelf

A bookshelf of digital trip scrapbooks. It's a plain static site with no build step.

## Making scrapbooks

- **New book:** click **+ New scrapbook** on the shelf. The spine shows the place and date.
- **Edit a book:** open it and click **Edit pages**.
- **Move:** drag anything, including across to the facing page.
- **Resize / turn:** select something, then drag the round corner handle or the handle above it.
- **Type:** click something once to select it, then click it again.
- **Keyboard:** Delete removes, arrow keys nudge, Ctrl+Z undoes, Ctrl+D copies.
- **Your own stickers:** add a PNG with **Photo / video**, then set its frame to **No border**.
- **Backups:** **Book details → Download a backup (.zip)**. **Import a scrapbook** on the shelf restores one.

## Syncing (edit from any device)

Syncing uses [Supabase](https://supabase.com) (free tier: 500 MB database, 1 GB of photo and video storage, 50 MB per file).

1. **Make a project.** Sign up at supabase.com and create a new project (any name and region).
2. **Set up the database.** In the project, open **SQL Editor**, paste in everything from `supabase-setup.sql`, and click **Run**.
3. **Allow your site's address.** Open **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address, e.g. `https://scrappy.vercel.app`
   - **Redirect URLs:** add that same address, plus `http://localhost:5174` for testing on your computer.
4. **Connect the site.** Open **Project Settings → API**, copy the **Project URL** and the **anon public** key, and paste them into `config.js`. (The anon key is designed to be public; the database rules are what protect your books.)
5. **Sign in.** Visit the site, click **Owner sign-in** at the bottom of the shelf, enter your email, and open the link it sends you. Do this on each device you want to edit from.
6. **Add the sign-in code to the email.** In **Authentication → Emails → Magic Link**, add this line to the message and save: `<p>Or type this code on the site: <strong>{{ .Token }}</strong></p>`. Typing the code works on any device, and keeps working even if your email app "checks" the link first (which uses it up).
7. **Lock the door.** Once you've signed in once, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**, so nobody else can make an account on your site.

Once you're signed in:

- Every change saves to the browser immediately, then syncs to your account. It still works offline and syncs when you're back online.
- Any books you made before signing in are uploaded automatically.
- **Book details → Show on the public shelf** decides who sees a book. Off (the default) means only you can see it; on means anyone visiting the site can open it.
- Visitors who aren't signed in only see public books and can't change anything.
- If you edit the same book on two devices at once, the last save wins.
- Photos and videos are stored in a public bucket under long random file names, so a file can only be opened by someone who has its exact link.

## Without syncing

Leave `config.js` empty and books are saved only in the browser that made them. Visit the site with `?edit` on the end once to turn on the editing buttons in that browser (`?view` turns them off). On `localhost` they're always on.

To share a book in this mode, download its .zip, unzip it into `trips/<book-id>/`, add the id to `trips/index.json`, and push.

## Adding stickers

Edit `stickers.js`. Add an emoji to any list, or add a drawing to `graphics`.

## Run locally

```
python -m http.server 5174 --bind 127.0.0.1
```

Then open http://localhost:5174.

## Deploy

Push to GitHub, then in Vercel choose **Add New → Project**, import the repo, set Framework Preset to **Other**, and deploy.

Maps use © OpenStreetMap contributors, and place search uses Nominatim.
