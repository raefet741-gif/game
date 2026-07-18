# 🚀 Deploying SPILL for free (public link anyone can open)

SPILL is a **long-running Node + Socket.IO server** that keeps each room's state **in
memory**. That means:

- ✅ You need a host that runs a **persistent server** with **WebSocket** support.
- ✅ It must run as a **single instance** (one process). Rooms live in RAM, so a second
  instance would have its own separate rooms and split players up.
- ❌ **Serverless** platforms (Vercel, Netlify Functions, Cloudflare Workers) are **not**
  a good fit — they don't hold long-lived WebSocket connections.

The app is already production-ready: it reads `process.env.PORT`, binds `0.0.0.0`, and the
client builds invite links / QR codes from the **public URL** automatically.

---

## ⭐ Recommended: Render (free, no credit card)

**1. Put the code on GitHub**

```bash
cd "Duo Game"
git init
git add .
git commit -m "SPILL party game"
```

Create an empty repo on github.com (e.g. `spill`), then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/spill.git
git push -u origin main
```

> No GitHub? Install **GitHub Desktop**, "Add Local Repository" → this folder → Publish.

**2. Create the service on Render**

1. Go to <https://render.com> and sign up (GitHub login is easiest).
2. **New +** → **Web Service** → connect your `spill` repo.
3. Render auto-detects Node. Confirm:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Click **Create Web Service**. First build takes ~2–3 minutes.

**3. Share the link**

Render gives you `https://spill-xxxx.onrender.com`. That's it — send it to anyone. They
open it, tap **Create a room**, and share the in-app link/QR with their friends.

> Tip: the `render.yaml` in this repo lets you use Render's **Blueprint** flow instead of
> the manual steps — New + → *Blueprint* → pick the repo.

### Free-tier caveats (all fine for a party game)
- The service **sleeps after ~15 min with no visitors**; the next visit wakes it in
  ~30–60s (a one-time "spinning up" delay).
- A sleep/restart **clears all rooms** (they're in memory). Just create a fresh room —
  scores/history aren't meant to persist between sessions anyway.
- Keep it at **one instance** (don't enable autoscaling).

---

## Alternatives (also free, no card)

- **Koyeb** (<https://www.koyeb.com>) — New App → deploy from GitHub or the included
  **Dockerfile**. One free web service, WebSockets supported, doesn't sleep as
  aggressively.
- **Fly.io** (<https://fly.io>) — `fly launch` with the included Dockerfile (needs a card
  on file for the free allowance, but won't charge on the small free tier). Global, keeps
  a persistent server; set `min_machines_running = 1` and a single machine.
- **Railway** (<https://railway.app>) — deploys from GitHub/Dockerfile; free trial credits.

All of these can build straight from the **`Dockerfile`** in this repo.

---

## Want it to never sleep? (optional)
On Render free the app sleeps when idle. To keep a game night snappy, either upgrade to a
paid instance, or ping `https://your-app.onrender.com/api/health` every ~10 min from a free
uptime monitor (e.g. UptimeRobot) **while you're actually playing**. Don't leave a
permanent pinger running — it just wastes the free tier.

---

## Custom domain (optional)
Every platform above lets you attach a domain for free (you just buy the domain). In
Render: **Settings → Custom Domains**. Point a CNAME at the Render URL and you'll get
automatic HTTPS.
