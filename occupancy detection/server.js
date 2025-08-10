const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoURI = "__________";

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Floor schema
const floorSchema = new mongoose.Schema({
  name: String,
  total_spaces: Number,
  occupied_spaces: Number
}, { versionKey: false }); // removes __v

const Floor = mongoose.model('Floor', floorSchema, 'floors');

// POST route to update only occupied_spaces
app.post('/api/floors', async (req, res) => {
  try {
    const { name, occupied_spaces } = req.body;
    if (typeof name !== 'string' || typeof occupied_spaces !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const updated = await Floor.findOneAndUpdate(
      { name },
      { $set: { occupied_spaces } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Floor not found' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("Error updating floor:", err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send("🚗 Parking API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
