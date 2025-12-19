
# Property Brokerage Website

A property brokerage website where customers can browse available properties for sale and admins can add/delete listings (no login required).

## Features
- Customers can view all available properties for sale (houses, apartments, land, cars, materials, and more).
- Admins can add new properties (with image, description, price) and delete listings.
- Images are uploaded and stored in the `uploads/` folder.
- Data is stored in a local SQLite database.

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite (via `sqlite3`)

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the server:**
   ```bash
   npm start
   ```
   The server will start on [http://localhost:3000](http://localhost:3000)

3. **Access the sites:**
   - **Customer site:** [http://localhost:3000/index.html](http://localhost:3000/index.html)
   - **Admin site:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

4. **Add properties:**
   - Go to the Admin site, fill in the form, and submit. The property will appear on both the admin and customer pages.

5. **Delete properties:**
   - On the Admin site, click the Delete button on any listing.

## Notes
- Images are stored in the `uploads/` directory. Make sure this folder exists (it will be created automatically if missing).
- No authentication is implemented for the admin page (for demo purposes).
- To reset the database, delete the `database.sqlite` file and restart the server.

## Database schema (SQLite)
## Languages (i18n)
- Navbar switcher supports English (EN), Amharic (AM), and Tigrinya (TI).
- Files: `public/i18n/en.json`, `public/i18n/am.json`, `public/i18n/ti.json`.
- Loader: `public/i18n.js` (persists choice in localStorage).
- To translate new text, wrap it with `data-i18n="key"` or use `data-i18n-placeholder` for placeholders and add the key to each JSON.
- `houses`
  - id INTEGER PK AUTOINCREMENT
  - title TEXT, description TEXT, price REAL
  - bedrooms INTEGER, location TEXT, city TEXT
  - type TEXT, status TEXT, floor INTEGER
  - amenities_json TEXT, admin_json TEXT
- `house_images`
  - id INTEGER PK AUTOINCREMENT
  - house_id INTEGER (FK -> houses.id)
  - filename TEXT, position INTEGER
- `feedback`
  - id INTEGER PK AUTOINCREMENT
  - name TEXT, email TEXT, message TEXT, date TEXT, status TEXT