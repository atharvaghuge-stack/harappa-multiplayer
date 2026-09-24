# HARAPPA — Build • Trade • Grow

A polished 2–4 player online multiplayer Harappan Civilization board game.

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:
   npm install
   npm start
4. Open http://localhost:10000

For LAN play, find your computer's local IP and open `http://YOUR-IP:10000` on another device on the same Wi‑Fi.

## Deploy publicly

Recommended simple option: Render.

1. Create a GitHub repository and upload the contents of this folder.
2. In Render, choose New → Web Service and connect the GitHub repo.
3. Runtime: Node.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Deploy.
7. Open the generated `https://YOUR-SERVICE.onrender.com` URL.
8. Create a room and send the room code to the other players.

This app uses Socket.IO WebSockets for real-time state synchronization. The server is authoritative for turns, resources, builds, trades and events.

## Rules

- 2–4 players.
- Each player starts with Food 2, Bricks 2, Metal 1, Beads 1, Trade 1.
- Each turn: Roll → collect the resource of the landing space → choose Build, Explore or Trade → receive an event → End Turn.
- Game lasts 6 rounds.
- House +2, Drainage +3, Great Bath +4, Workshop +3, Trade Centre +4.
- Great Bath requires Drainage.
- A trade gives the active player +1 Prosperity.
- Highest Prosperity after round 6 wins.

## Notes

The free Render web service is suitable for a college/hobby project. Free services can spin down after inactivity, so the first visit after a quiet period may take a little longer.
