const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// SQLite setup
const sqlitePath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(sqlitePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function getTableInfo(table) {
  const rows = await all(`PRAGMA table_info(${table})`);
  const byName = Object.fromEntries(rows.map(r => [r.name, r]));
  return { rows, byName };
}

// Create tables
db.serialize(async () => {
  await run(`CREATE TABLE IF NOT EXISTS houses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    bedrooms INTEGER,
    location TEXT,
    city TEXT,
    type TEXT DEFAULT 'house',
    status TEXT DEFAULT 'available',
    floor INTEGER,
    amenities_json TEXT,
    admin_json TEXT,
    title_json TEXT,
    description_json TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS house_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'unread'
  )`);

  await run(`CREATE TABLE IF NOT EXISTS brokers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    status TEXT DEFAULT 'approved',
    code TEXT,
    token TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS broker_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broker_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    bedrooms INTEGER,
    location TEXT,
    city TEXT,
    type TEXT,
    floor INTEGER,
    amenities_json TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status TEXT DEFAULT 'pending',
    admin_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(broker_id) REFERENCES brokers(id) ON DELETE CASCADE
  )`);

  // Migration: Add missing columns to broker_requests if they don't exist
  const brokerReqInfo = await getTableInfo('broker_requests');
  if (!brokerReqInfo.byName['city']) {
    await run(`ALTER TABLE broker_requests ADD COLUMN city TEXT`);
  }
  if (!brokerReqInfo.byName['floor']) {
    await run(`ALTER TABLE broker_requests ADD COLUMN floor INTEGER`);
  }
  if (!brokerReqInfo.byName['amenities_json']) {
    await run(`ALTER TABLE broker_requests ADD COLUMN amenities_json TEXT`);
  }

  await run(`CREATE TABLE IF NOT EXISTS broker_request_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(request_id) REFERENCES broker_requests(id) ON DELETE CASCADE
  )`);
});

// Multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helpers for broker auth
function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function authBroker(req) {
  const token = req.headers['x-broker-token'];
  if (!token) return null;
  return await get(`SELECT id, name, email, phone, status FROM brokers WHERE token = ?`, [token]);
}

// ===== Houses API =====

app.get('/api/houses', async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM houses ORDER BY id DESC`);
    const houseIds = rows.map(r => r.id);
    let images = [];
    if (houseIds.length) {
      const placeholders = houseIds.map(() => '?').join(',');
      images = await all(`SELECT house_id, filename, position FROM house_images WHERE house_id IN (${placeholders}) ORDER BY position ASC, id ASC`, houseIds);
    }
    const imagesByHouse = images.reduce((acc, r) => {
      (acc[r.house_id] ||= []).push(r.filename);
      return acc;
    }, {});
    const out = rows.map(r => {
      const amenities = r.amenities_json ? JSON.parse(r.amenities_json) : {};
      const admin = r.admin_json ? JSON.parse(r.admin_json) : {};
      const title_json = r.title_json ? JSON.parse(r.title_json) : null;
      const description_json = r.description_json ? JSON.parse(r.description_json) : null;
      const imgs = imagesByHouse[r.id] || [];
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        title_json,
        description_json,
        price: r.price,
        bedrooms: r.bedrooms ?? null,
        location: r.location || null,
        city: r.city || null,
        type: r.type || 'house',
        status: r.status || 'available',
        floor: r.floor ?? null,
        amenities,
        admin,
        images: imgs,
        image: imgs[0] || null
      };
    });
    res.json(out);
  } catch (err) {
    console.error('GET /api/houses error:', err);
    res.status(500).json({ error: 'Failed to load houses' });
  }
});

app.post('/api/houses', upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, price, bedrooms, location, city, type, status, floor } = req.body;
    const images = (req.files || []).map(f => f.filename);
    if (!title || !description || !price || images.length === 0) {
      return res.status(400).json({ error: 'Title, description, price and at least one image are required.' });
    }
    const toBool = (val) => typeof val !== 'undefined' && String(val).toLowerCase() !== 'false' && String(val) !== '0';
    const amenities = {
      electricity: toBool(req.body.amenity_electricity),
      water: toBool(req.body.amenity_water),
      parking: toBool(req.body.amenity_parking),
      internet: toBool(req.body.amenity_internet),
      furnished: toBool(req.body.amenity_furnished),
      airConditioning: toBool(req.body.amenity_air_conditioning),
      balcony: toBool(req.body.amenity_balcony),
      petFriendly: toBool(req.body.amenity_pet_friendly),
      generator: toBool(req.body.amenity_generator),
      security: toBool(req.body.amenity_security),
      lift: toBool(req.body.amenity_lift)
    };
    const admin = {
      name: (req.body.admin_name || '').trim() || null,
      email: (req.body.admin_email || '').trim() || null,
      phone: (req.body.admin_phone || '').trim() || null,
      status: 'online'
    };
    const title_json = JSON.stringify({ en: (title || '').toString() });
    const description_json = JSON.stringify({ en: (description || '').toString() });

    const cols = ['title','description','price','bedrooms','location','city','type','status','floor','amenities_json','admin_json','title_json','description_json'];
    const vals = [title, description, Number(price), bedrooms || null, location || null, city || null, (type || 'house'), (status || 'available'), (floor ? parseInt(floor,10) : null), JSON.stringify(amenities), JSON.stringify(admin), title_json, description_json];
    const placeholders = cols.map(() => '?').join(',');
    const result = await run(`INSERT INTO houses (${cols.join(',')}) VALUES (${placeholders})`, vals);
    const houseId = result.lastID;
    for (let i = 0; i < images.length; i++) {
      await run(`INSERT INTO house_images (house_id, filename, position) VALUES (?, ?, ?)`, [houseId, images[i], i]);
    }
    res.json({ success: true, id: houseId });
  } catch (err) {
    console.error('POST /api/houses error:', err);
    res.status(500).json({ error: 'Failed to add house' });
  }
});

app.delete('/api/houses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await get(`SELECT id FROM houses WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'House not found.' });
    await run(`DELETE FROM house_images WHERE house_id = ?`, [id]);
    await run(`DELETE FROM houses WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/houses/:id error:', err);
    res.status(500).json({ error: 'Failed to delete house' });
  }
});

app.put('/api/houses/:id', upload.array('images', 10), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await get(`SELECT * FROM houses WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'House not found.' });
    const { title, description, price, bedrooms, location, city, type, status, floor } = req.body;
    const toBool = (val) => typeof val !== 'undefined' && String(val).toLowerCase() !== 'false' && String(val) !== '0';
    const amenities = {
      electricity: toBool(req.body.amenity_electricity),
      water: toBool(req.body.amenity_water),
      parking: toBool(req.body.amenity_parking),
      internet: toBool(req.body.amenity_internet),
      furnished: toBool(req.body.amenity_furnished),
      airConditioning: toBool(req.body.amenity_air_conditioning),
      balcony: toBool(req.body.amenity_balcony),
      petFriendly: toBool(req.body.amenity_pet_friendly),
      generator: toBool(req.body.amenity_generator),
      security: toBool(req.body.amenity_security),
      lift: toBool(req.body.amenity_lift)
    };
    const updatedAdmin = {
      ...(existing.admin_json ? JSON.parse(existing.admin_json) : {}),
      name: (req.body.admin_name || '').trim() || null,
      email: (req.body.admin_email || '').trim() || null,
      phone: (req.body.admin_phone || '').trim() || null,
      status: 'online'
    };
    const sets = ['title=?','description=?','price=?','bedrooms=?','location=?','city=?','type=?','status=?','floor=?','amenities_json=?','admin_json=?'];
    const params = [title, description, Number(price), bedrooms || null, location || null, city || null, (type || existing.type || 'house'), (status || existing.status || 'available'), (floor ? parseInt(floor,10) : null), JSON.stringify(amenities), JSON.stringify(updatedAdmin)];
    await run(`UPDATE houses SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (req.files && req.files.length > 0) {
      await run(`DELETE FROM house_images WHERE house_id = ?`, [id]);
      const images = req.files.map(f => f.filename);
      for (let i = 0; i < images.length; i++) {
        await run(`INSERT INTO house_images (house_id, filename, position) VALUES (?, ?, ?)`, [id, images[i], i]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/houses/:id error:', err);
    res.status(500).json({ error: 'Failed to update house' });
  }
});

// ===== Feedback API =====

app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const date = new Date().toISOString();
    const result = await run(`INSERT INTO feedback (name, email, message, date, status) VALUES (?, ?, ?, ?, 'unread')`, [name, email, message, date]);
    res.json({ success: true, id: result.lastID, message: 'Feedback submitted successfully!' });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

app.get('/api/feedback', async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM feedback ORDER BY datetime(date) DESC`);
    res.json(rows);
  } catch (error) {
    console.error('Error getting feedback:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

app.put('/api/feedback/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const result = await run(`UPDATE feedback SET status = ? WHERE id = ?`, [status || 'read', id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Feedback not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/feedback/:id error:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

app.delete('/api/feedback/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await run(`DELETE FROM feedback WHERE id = ?`, [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Feedback not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/feedback/:id error:', err);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

// ===== Broker auth with fixed password =====

app.post('/api/brokers/verify', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }
    const uname = String(username).trim();
    let broker = await get(`SELECT * FROM brokers WHERE email = ?`, [uname]);
    const token = randomToken();
    if (broker) {
      await run(`UPDATE brokers SET name = COALESCE(?, name), token = ?, status = 'approved' WHERE id = ?`, [uname, token, broker.id]);
      broker = await get(`SELECT id, name, email, phone, status, token FROM brokers WHERE id = ?`, [broker.id]);
    } else {
      const result = await run(`INSERT INTO brokers (name, email, status, token) VALUES (?, ?, 'approved', ?)`, [uname, uname, token]);
      broker = await get(`SELECT id, name, email, phone, status, token FROM brokers WHERE id = ?`, [result.lastID]);
    }
    res.json(broker);
  } catch (e) {
    console.error('POST /api/brokers/verify error:', e);
    res.status(500).json({ error: 'Failed to verify broker.' });
  }
});

app.get('/api/brokers/me', async (req, res) => {
  try {
    const broker = await authBroker(req);
    if (!broker) return res.status(401).json({ error: 'Not authorized' });
    res.json(broker);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load broker profile.' });
  }
});

app.post('/api/broker-requests', upload.array('images', 10), async (req, res) => {
  try {
    const broker = await authBroker(req);
    if (!broker) return res.status(401).json({ error: 'Not authorized' });
    
    const { title, description, price, bedrooms, location, city, type, floor, contact_name, contact_email, contact_phone } = req.body;
    const images = (req.files || []).map(f => f.filename);
    
    if (!title || !description || !price || images.length === 0) {
      return res.status(400).json({ error: 'Title, description, price and at least one image are required.' });
    }
    
    // Parse amenities
    const toBool = (val) => typeof val !== 'undefined' && String(val).toLowerCase() !== 'false' && String(val) !== '0';
    const amenities = {
      electricity: toBool(req.body.amenity_electricity),
      water: toBool(req.body.amenity_water),
      parking: toBool(req.body.amenity_parking),
      internet: toBool(req.body.amenity_internet),
      furnished: toBool(req.body.amenity_furnished),
      airConditioning: toBool(req.body.amenity_air_conditioning),
      balcony: toBool(req.body.amenity_balcony),
      petFriendly: toBool(req.body.amenity_pet_friendly),
      generator: toBool(req.body.amenity_generator),
      security: toBool(req.body.amenity_security),
      lift: toBool(req.body.amenity_lift)
    };
    
    const result = await run(`INSERT INTO broker_requests (broker_id, title, description, price, bedrooms, location, city, type, floor, amenities_json, contact_name, contact_email, contact_phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [
      broker.id,
      title,
      description,
      Number(price),
      bedrooms || null,
      location || null,
      city || null,
      type || 'house',
      floor ? parseInt(floor, 10) : null,
      JSON.stringify(amenities),
      contact_name || null,
      contact_email || null,
      contact_phone || null
    ]);
    const requestId = result.lastID;
    
    for (let i = 0; i < images.length; i++) {
      await run(`INSERT INTO broker_request_images (request_id, filename, position) VALUES (?, ?, ?)`, [requestId, images[i], i]);
    }
    
    res.json({ success: true, id: requestId });
  } catch (e) {
    console.error('POST /api/broker-requests error:', e);
    res.status(500).json({ error: 'Failed to create broker request.' });
  }
});

app.get('/api/broker-requests/mine', async (req, res) => {
  try {
    const broker = await authBroker(req);
    if (!broker) return res.status(401).json({ error: 'Not authorized' });
    const rows = await all(`SELECT * FROM broker_requests WHERE broker_id = ? ORDER BY datetime(created_at) DESC`, [broker.id]);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/broker-requests/mine error:', e);
    res.status(500).json({ error: 'Failed to load requests.' });
  }
});

app.get('/api/admin/broker-requests', async (req, res) => {
  try {
    const rows = await all(`SELECT br.*, b.name as broker_name, b.email as broker_email, b.phone as broker_phone
                            FROM broker_requests br
                            JOIN brokers b ON br.broker_id = b.id
                            ORDER BY datetime(br.created_at) DESC`);
    const reqIds = rows.map(r => r.id);
    let images = [];
    if (reqIds.length) {
      const placeholders = reqIds.map(() => '?').join(',');
      images = await all(`SELECT request_id, filename, position FROM broker_request_images WHERE request_id IN (${placeholders}) ORDER BY position ASC, id ASC`, reqIds);
    }
    const imagesByReq = images.reduce((acc, r) => {
      (acc[r.request_id] ||= []).push(r.filename);
      return acc;
    }, {});
    const out = rows.map(r => ({
      ...r,
      images: imagesByReq[r.id] || []
    }));
    res.json(out);
  } catch (e) {
    console.error('GET /api/admin/broker-requests error:', e);
    res.status(500).json({ error: 'Failed to load broker requests.' });
  }
});

app.post('/api/admin/broker-requests/:id/decision', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action, note } = req.body;
    const request = await get(`SELECT * FROM broker_requests WHERE id = ?`, [id]);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    if (action === 'reject') {
      await run(`UPDATE broker_requests SET status = 'rejected', admin_note = ? WHERE id = ?`, [note || null, id]);
      return res.json({ success: true });
    }
    if (action === 'approve') {
      const imgs = await all(`SELECT filename, position FROM broker_request_images WHERE request_id = ? ORDER BY position ASC, id ASC`, [id]);
      const images = imgs.map(i => i.filename);
      const firstImage = images.length > 0 ? images[0] : null;
      
      // Parse amenities from request if available
      let amenities = {};
      try {
        if (request.amenities_json) amenities = JSON.parse(request.amenities_json);
      } catch(e) {}
      
      const admin = { 
        name: request.contact_name || 'Broker Listing', 
        email: request.contact_email || null, 
        phone: request.contact_phone || null, 
        status: 'online' 
      };
      const title_json = JSON.stringify({ en: request.title || '' });
      const description_json = JSON.stringify({ en: request.description || '' });
      
      // Include 'image' column for backwards compatibility with older DB schema
      const cols = ['title','description','price','bedrooms','location','city','type','status','floor','amenities_json','admin_json','title_json','description_json','image'];
      const vals = [
        request.title,
        request.description,
        Number(request.price) || 0,
        request.bedrooms || null,
        request.location || null,
        request.city || null,
        (request.type || 'house'),
        'available',
        request.floor || null,
        JSON.stringify(amenities),
        JSON.stringify(admin),
        title_json,
        description_json,
        firstImage
      ];
      const placeholders = cols.map(() => '?').join(',');
      const result = await run(`INSERT INTO houses (${cols.join(',')}) VALUES (${placeholders})`, vals);
      const houseId = result.lastID;
      for (let i = 0; i < images.length; i++) {
        await run(`INSERT INTO house_images (house_id, filename, position) VALUES (?, ?, ?)`, [houseId, images[i], i]);
      }
      await run(`UPDATE broker_requests SET status = 'approved', admin_note = ? WHERE id = ?`, [note || null, id]);
      return res.json({ success: true, houseId });
    }
    res.status(400).json({ error: 'Invalid action.' });
  } catch (e) {
    console.error('POST /api/admin/broker-requests/:id/decision error:', e);
    res.status(500).json({ error: 'Failed to update request.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
