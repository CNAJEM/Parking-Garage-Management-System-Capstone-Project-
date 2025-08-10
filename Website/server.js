
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb'); 


const app = express();
app.use(cors());
app.use(express.json());


const uri = '----------------------------------';  // replace it with your actual mongoDB connection string
const client = new MongoClient(uri);
const dbName = 'parkingDB';

app.get('/api/parking-data', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const floors = await db.collection('floors').find().toArray();

    const active_alerts = floors.filter(floor => {
      return (floor.occupied_spaces / floor.total_spaces) >= 0.9;
    }).length;

    res.json({
      floors,
      active_alerts,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching parking data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/api/vehicles', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const vehicles = await db.collection('vehicles').find().toArray();

    // Convert _id to string
    const formattedVehicles = vehicles.map(vehicle => ({
      ...vehicle,
      _id: vehicle._id.toString()
    }));

    res.json(formattedVehicles);
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

app.delete('/api/vehicle/:id', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await db.collection('vehicles').deleteOne({ _id: new ObjectId(req.params.id) });

    res.json({ deleted: result.deletedCount > 0 });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

app.get('/health', async (req, res) => {
  try {
    await client.db(dbName).command({ ping: 1 });
    res.json({ mongodb_connected: true });
  } catch {
    res.json({ mongodb_connected: false });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const now = new Date();

    // 1. Get all unauthorized plate numbers from the new collection
    const unauthorizedDocs = await db.collection('unauthorized_vehicles').find().toArray();
    const unauthorizedSet = new Set(unauthorizedDocs.map(doc => doc.plate_number.toUpperCase()));

    // 2. Get all vehicle registration data (with expiry_date)
    const registeredVehicles = await db.collection('vehicles').find().toArray();
    const vehicleMap = new Map();
    registeredVehicles.forEach(vehicle => {
      vehicleMap.set(vehicle.plate_number.toUpperCase(), vehicle);
    });

    // 3. Get all detection entries (plates)
    const plates = await db.collection('plates').find().toArray();
    const alerts = [];

for (const entry of plates) {
  const plate = entry.plate_number.toUpperCase();
  const status = entry.status;
  const time = entry.timestamp_entry;

  // 🚫 Unauthorized Access (explicitly marked as unauthorized)
  if (unauthorizedSet.has(plate)) {
    alerts.push({
      type: 'Unauthorized Access',
      plate_number: plate,
      time
    });
    continue; // Skip other checks for explicitly unauthorized vehicles
  }

  // 🚫 No Permit (vehicle entered but has no permit at all)
  if (status === 'in_garage' && !vehicleMap.has(plate)) {
    alerts.push({
      type: 'No Permit',
      plate_number: plate,
      time
    });
    continue; // Skip other checks since vehicle has no permit
  }

  // 🕒 Extended Stay (vehicle has permit but it's expired)
  if (status === 'in_garage' && vehicleMap.has(plate)) {
    const vehicleInfo = vehicleMap.get(plate);
    const expiryDate = new Date(vehicleInfo.expiry_date);
    if (now > expiryDate) {
      alerts.push({
        type: 'Extended Stay',
        plate_number: plate,
        time
      });
    }
  }
}

    res.json({ alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post("/api/vehicles", async (req, res) => {
  const { plate_number, owner_name, permit_type, email, vehicle_make, vehicle_model, phone_number } = req.body;

  try {
    const now = new Date();
    let expiry_date = new Date(now);

    switch (permit_type.toLowerCase()) {
      case "daily":
        expiry_date.setDate(now.getDate() + 1);
        break;
      case "weekly":
        expiry_date.setDate(now.getDate() + 7);
        break;
      case "monthly":
        expiry_date.setMonth(now.getMonth() + 1);
        break;
      case "semester":
        expiry_date.setDate(now.getDate() + 120);
        break;
      default:
        expiry_date.setDate(now.getDate() + 30);
    }

    const expiryDateStr = expiry_date.toISOString().split('T')[0];

    const db = client.db(dbName);
    const result = await db.collection("vehicles").insertOne({
      plate_number,
      owner_name,
      permit_type,
      expiry_date: expiryDateStr,
      email,
      vehicle_make,
      vehicle_model, 
      phone_number,
      created_at: new Date().toISOString()
    });

    res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error("Insert error:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});


app.get('/api/plates', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const plates = await db.collection('plates').find().sort({ timestamp_entry: -1 }).toArray();

    // Convert _id to string and format date if needed
    const formatted = plates.map(p => ({
      ...p,
      _id: p._id.toString(),
      timestamp_entry: p.timestamp_entry,
      timestamp_exit: p.timestamp_exit || null
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching plates:', error);
    res.status(500).json({ error: 'Failed to fetch plates' });
  }
});

app.delete('/api/plates/:id', async (req, res) => {
  try {
    await client.connect();
    const db = client.db(dbName);
    const result = await db.collection('plates').deleteOne({ _id: new ObjectId(req.params.id) });

    res.json({ deleted: result.deletedCount > 0 });
  } catch (error) {
    console.error('Error deleting plate:', error);
    res.status(500).json({ error: 'Failed to delete plate' });
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
