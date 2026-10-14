# Lineup — Cards & Chips (TV edition)

A five-in-a-row card-and-chip party game. The board lives on the TV; every player's hand lives privately on their own phone.

**Play:** open https://natmo0470-netizen.github.io/lineup-tv/ in the TV's browser, then everyone scans the QR code.

## How it works
- The TV opens a room and shows a QR code + 4-letter room code.
- Each player scans it, types a name, and picks a team on their phone.
- **2 teams** (up to 4 players) or **3 teams** (up to 6 players), with 1–2 players per team. A team with nobody on it is played by the CPU.
- On your turn your phone buzzes: tap a card, tap a glowing space, tap **Place**. The TV highlights where you're looking so the room can follow along.
- Dropped connection? Re-scan the code (or just reopen the link) and your hand comes back.
- No phones? Choose **Play with TV remote only** for the original pass-the-remote mode.

Phones connect straight to the TV's browser with WebRTC via [PeerJS](https://peerjs.com/) — no server to run. Everyone being on the same Wi-Fi works best.

## Rules
Play a card and put a chip on a matching space (every card appears twice). Five in a row — across, down, or diagonal — is a Lineup. Corners count for everyone.
- ♦ ♣ jacks are wild: place on any open space.
- ♥ ♠ jacks remove an opponent's chip (not one in a finished Lineup).
- A card whose spaces are both taken is dead — swap it once per turn.
- 2 teams need 2 Lineups; 3 teams need 1. Teams alternate turns; teammates take turns within their team.

## Files
- `index.html` — TV screen (host, board, lobby)
- `play.html` — phone controller (private hand)
- `common.js` — shared board layout + networking
- `vendor/qrcode.js` — QR generator (MIT, Kazuhiko Arase)
