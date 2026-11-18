# Momentum

Your workouts, recovery, food, tasks, calendar and goals in one app. It runs on your iPhone like a normal app, works offline, and keeps your data on your phone.

## Put it online (one time, about 5 minutes, on your PC)

1. Unzip this folder.
2. Go to github.com and sign in. Click **+** (top right) › **New repository**.
3. Name it `momentum`, choose **Public**, and click **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Open the unzipped `momentum` folder, select **everything inside it** (index.html, css, js, fonts, icons, vendor and the rest), and drag it all onto the GitHub page. Use Chrome or Edge so the folders upload too.
6. Click **Commit changes**.
7. Go to **Settings › Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then click **Save**.
8. Wait 1–2 minutes and refresh. Your link appears at the top of that page: `https://YOUR-USERNAME.github.io/momentum/`

## Install it on your iPhone

1. Open your link in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Momentum from the new icon. It runs full screen with no browser bar.

## Good to know

- **Your data stays on your phone.** Nothing is uploaded, and the GitHub page only holds the app's code. Back up every week or two in Settings › Back up my data, and save the file to iCloud Drive.
- **Reminders:** reminders pop up in the app while it's open. For an alert when the app is closed, open the task and tap **Save and add to iPhone Calendar**. Then open the file from Files › Downloads and tap **Add to Calendar**.
- **Barcode scanning** uses Open Food Facts, a free food database. Allow camera access the first time. If a product isn't in the database, enter it once from the label and it's saved for next time.
- **Updating the app:** upload the changed files the same way (GitHub replaces the old ones). Change `VERSION` at the top of `sw.js` so your phone picks up the new version, then close and reopen the app twice.

## How the code is organized

- `index.html`: the page shell
- `css/app.css`: all styling. Colors are at the top in `:root`.
- `js/store.js`: the data the app saves, plus default settings
- `js/logic.js`: recovery, records, streaks, weekly recap and goal math
- `js/views/`: one file per tab (today, train, food, goals, progress, settings)
- `sw.js`: offline support
- `vendor/html5-qrcode.min.js`: the barcode reader (Apache 2.0 license)
- `fonts/`: Plus Jakarta Sans (SIL Open Font License)
