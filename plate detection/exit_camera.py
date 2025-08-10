import cv2
import subprocess
import time
from picamera2 import Picamera2
from pymongo import MongoClient
from datetime import datetime

# Initialize PiCamera
picam2 = Picamera2()
picam2.preview_configuration.main.size = (640, 480)
picam2.preview_configuration.main.format = "RGB888"
picam2.configure("preview")
picam2.start()

# Initialize MongoDB
MONGO_URI = "------------------------------" // replace with your actual MongoDB python connection string
client = MongoClient(MONGO_URI)
db = client['parkingDB']
plates_collection = db['plates']

print("🚗 Starting exit detection...")

try:
    while True:
        # Capture frame
        frame = picam2.capture_array()
        img_path = "/tmp/frame_exit.jpg"
        cv2.imwrite(img_path, frame)

        # Run OpenALPR
        result = subprocess.run(
            ['alpr', '-c', 'us', img_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        output = result.stdout.decode().strip()

        if "plate" in output.lower():
            print("\n✅ Plate detected:")
            print(output)

            # Extract plate number
            lines = output.splitlines()
            if len(lines) >= 2:
                parts = lines[1].split()
                plate_number = parts[1] if len(parts) >= 2 else None
                confidence = float(parts[3]) if len(parts) >= 4 else None

                if plate_number:
                    # Look for the plate in DB with status in_garage
                    existing_plate = plates_collection.find_one({
                        "plate_number": plate_number,
                        "status": "in_garage"
                    })

                    if existing_plate:
                        plates_collection.update_one(
                            {"_id": existing_plate["_id"]},
                            {
                                "$set": {
                                    "timestamp_exit": datetime.utcnow(),
                                    "status": "exited"
                                }
                            }
                        )
                        print(f"📤 Updated exit for plate {plate_number}.")
                    else:
                        print(f"⚠️ Plate {plate_number} not found or already exited.")
                else:
                    print("⚠️ Could not parse plate number.")
            else:
                print("⚠️ Unexpected ALPR output format.")

        else:
            print("❌ No license plates found.")

        time.sleep(1)

except KeyboardInterrupt:
    print("\n🛑 Exit camera stopped by user.")
