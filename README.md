# Binafast

A small shared trip planner for two or three people. One static page, no build step.

- **Plan**: day-by-day itinerary with that night's hotel, timed items, a day total and day notes
- **Items**: hotels, food, activities, transport and shopping, with filters (category, status, day) and sorting (date, price, name)
- **Costs**: trip total, booked vs planned, by category and by day
- **Trip**: whole-trip notes, trip dates, currency, and the link to share

Edits sync live between everyone who has the trip link.

## How it works

| Part | What | Cost |
| --- | --- | --- |
| Hosting | GitHub Pages serving `index.html` | Free |
| Database | Firebase Cloud Firestore (Spark plan) | Free at this size |
| Login | None. Each trip has a long random code in its link (`?t=...`); the link is the key | n/a |

Anyone who has the link can view and edit that trip, so share it only with the people travelling with you.

## Setup (about 10 minutes, once)

### 1. Create the database

1. Go to <https://console.firebase.google.com> and create a project (Analytics is not needed).
2. **Build > Firestore Database > Create database**. Pick a region near you and start in production mode.
3. Open the **Rules** tab, replace the contents with [`firestore.rules`](firestore.rules) from this repo, and press **Publish**.
4. **Project settings > Your apps > Web (`</>`)**, register an app (no hosting needed), and copy the `firebaseConfig` values.

### 2. Connect the app

Paste those values into [`config.js`](config.js) and commit. These values are public identifiers, not secrets; the rules decide who can read and write.

### 3. Deploy

**Settings > Pages > Build and deployment > Deploy from a branch**, choose `main` and `/ (root)`, and save.
After a minute the app is at `https://<your-username>.github.io/Binafast/`.

Any static host works the same way (Netlify, Vercel, Cloudflare Pages): there is nothing to build.

### 4. Start a trip

Open the site, press **Start a new trip**, then copy the link from the **Trip** tab and send it to your travel partners. On a phone, use "Add to Home Screen" to keep it handy.

## Files

- `index.html` - the whole app (markup, styles, script)
- `config.js` - your Firebase config
- `firestore.rules` - database access rules to paste into the Firebase console
- `logo.jpg` - app logo and icon

## Data layout

```
trips/{tripCode}/items/{itemId}     name, category, status, date, endDate, time, price, city | mode/from/to, link, notes
trips/{tripCode}/trip/main          name, start, end, currency, notes
trips/{tripCode}/daynotes/{date}    text
```

## Not included

Reading details from screenshots or links needs an AI service with a paid key, so it is left out of this version. Everything is entered by hand.
