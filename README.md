# Lineup — Cards & Chips (TV edition)

A five-in-a-row card-and-chip board game built for the TV. Plays entirely with a TV remote's D-pad (arrows + OK + Back), and also works with a keyboard, mouse, or touch.

**Play:** https://natmo0470-netizen.github.io/lineup-tv/

## Features
- 2 or 3 players, any mix of humans and CPU opponents
- Remote-first controls with big, high-contrast focus states and a TV-safe margin
- Pass-the-remote screen that hides hands when more than one human is playing
- Wild and remove jacks, dead-card swaps, locked lineups, and free corners

## Controls
| Remote | Action |
| --- | --- |
| ◀ ▶ | Choose a card |
| OK | Select card / place chip |
| ◀ ▲ ▼ ▶ (on board) | Move between spaces |
| Back | Change card / open menu |

## Rules
Play a card from your hand and put a chip on a matching board space (every card appears twice). Five of your chips in a row — across, down, or diagonally — makes a Lineup. Corners count for everyone.
- ♦ ♣ jacks are wild: place on any open space.
- ♥ ♠ jacks remove an opponent's chip (not one in a finished Lineup).
- A card whose spaces are both taken is dead — swap it once per turn.
- 2 players need 2 Lineups; 3 players need 1.

Single file (`index.html`), no build step, no dependencies.
