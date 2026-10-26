# Changelog

## 1.5.0

- Rank selector for the report card; per-rank stat baselines are still being collected, so grades use the all-rank averages for now
- Season 10.5 hero list, including Elsa Bloodstone, Gorr, Cyclops, Devil Dinosaur, The Hood, Black Cat and Deadpool's three roles
- Blank or unreadable stats now stop the grade instead of being treated as zero; `11 200` works as a thousands separator
- "Why this grade?" breakdown on every card with the per-10-minute value, role average, weight and points
- Fixed the per-10-minute death check used by the immortal roast pool
- Nice mode and Hide names in image toggles; exported images now carry a small unofficial-project footer
- Paste image button, stale-results warning, confirmations before clearing or replacing a squad, and a window that fits smaller screens
- Accessibility labels for every stat box, live status messages, visible focus rings and better mobile input sizing
- Share image capture now freezes entrance animations, waits for fonts and captures at the display's pixel density
- Electron 45 and @electron/packager 20; single-instance lock; packaged app now includes the third-party notices
- OCR now tries several timer lines and accepts `MM:SS` as well as `MM:SS:CC`; unreadable values stay blank
- Data source linked in the README and in the app

## 1.4.0

- Redesigned results: grade stamps, halftone grade badges, the Anton display font and stat bars comparing each player to the role average
- Copy image and Save image buttons for sharing results
- 304 roast and compliment lines (up from 202) and 60 award lines (up from 13)
- Recently used lines stay out of the next shuffle, so reshuffles can't repeat them right away
- New app icon

## 1.3.0

- Grading recalibrated against real per-10-minute role averages, so an average game is a B- in every role
- Situational roasts trigger relative to the same averages

## 1.2.0

- Over 200 roast and compliment lines with situational categories and stat placeholders
- Shuffle-deck rotation so lines don't repeat until a pool is used up

## 1.1.0

- Screenshot import: paste a scoreboard and the app reads names, roles, stats and match length offline
- Damage blocked and assists columns; grades scale with match length
- Remembers friends' heroes and corrects slightly misread names
- Hero list, `11.2k` shorthand and Enter-to-advance

## 1.0.0

- First desktop version: enter up to six players, grade them, roast them, crown an MVP
