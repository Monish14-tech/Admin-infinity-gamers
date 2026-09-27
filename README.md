# Infinity Gamers — Standalone Admin Management Portal

Dedicated, private administrative portal for **Infinity Gamers (PS5 Gaming Lounge, Coimbatore)**. Completely decoupled from the public customer-facing website for maximum privacy and security.

---

## Features
- **Security & Privacy**: Zero public links or access from the customer website.
- **PS5 Station Lock Tracking**: Live station monitor for PS5 Station 1 and PS5 Station 2. Enforces locking so an active console cannot be double-booked.
- **Real-Time Running Timers**: Live elapsed minutes counter updating in real time.
- **Repeat Customer Auto-Detection**: Instant lookup by phone number or customer name. Displays total visit counts, cumulative hours, and favorite games.
- **One-Click Checkout & Billing**: Automatically calculates play duration and billing amount upon checkout.
- **Dynamic Leaderboard Management**: Automatic tier allocation (Diamond Squad, Platinum, Gold, Rookie).
- **Public News & Tournament Publisher**: Publish tournaments and knockout announcements that automatically display on the public site in real time.
- **Configurable API Endpoint**: Seamlessly connects to the public production backend on Render (`https://infinity-gamers.onrender.com`) or local server (`http://localhost:3000`).

---

## Local Development

```bash
# 1. Start the admin portal server (runs on port 4000 by default)
npm start

# 2. Open in your browser:
http://localhost:4000
```

---

## Deploying as a Standalone Site on Render

### Step 1: Create a New GitHub Repository
1. Go to [GitHub](https://github.com/new) and create a new repository:
   - Name: `infinity-gamers-admin`
   - Privacy: **Private** (recommended)

### Step 2: Push This Folder to GitHub
Run the following commands in this directory:
```bash
git init
git add .
git commit -m "Initial commit: Standalone Infinity Gamers Admin Portal"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/infinity-gamers-admin.git
git push -u origin main
```

### Step 3: Deploy on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your new `infinity-gamers-admin` repository.
4. Render will auto-detect settings from `render.yaml`:
   - **Environment**: Node
   - **Build Command**: *(leave blank)*
   - **Start Command**: `npm start`
5. Click **Create Web Service**.

Your admin console will be live on its own dedicated URL (e.g. `https://infinity-gamers-admin.onrender.com`)!
