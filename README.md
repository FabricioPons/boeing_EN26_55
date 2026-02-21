# Boeing 777F Lock Detection System

A React web application for real-time monitoring of cargo deck ULD (Unit Load Device) lock engagement status. Supports three operating modes selectable directly from the app's top bar.

---

## Modes

| Mode | Description | Hardware Required |
|------|-------------|-------------------|
| **USB** | Connects to Arduino via USB Serial (Web Serial API) | Arduino via USB cable |
| **Wireless** | Connects to Arduino via Wi-Fi WebSocket | Arduino on same Wi-Fi network |
| **Demo** | Simulated sensors — no hardware needed | None |

Switch between modes using the tab bar at the top of the app. No restart required.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm
- For USB mode: Chrome, Edge, or Opera (Web Serial API support)
- For Wireless mode: Arduino Uno Wi-Fi Rev4 on the same network

### Install & Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
src/
├── App.js                  # Mode selector shell (top bar + routing)
├── index.js                # React entry point
├── modes/
│   ├── Demo/
│   │   └── index.js        # Simulation UI (software sensor toggle)
│   ├── USB/
│   │   └── index.js        # USB Serial connection UI
│   └── Wireless/
│       └── index.js        # Wi-Fi WebSocket connection UI
arduino/
├── lock_sensor_serial/
│   └── lock_sensor_serial.ino      # Firmware for USB mode
└── lock_sensor_websocket.ino       # Firmware for Wireless mode
```

---

## Aircraft Configurations

Select one of three cargo layouts when starting a monitoring session:

- **Side by Side (L/R)** — 28 positions (AR/AL through PR/PL) for PMC/PAG pallets
- **Center Load** — 14 center positions (A–P) for PMC pallets
- **Lower Deck** — 16 positions for PRA/PGA containers

---

## Arduino Data Format

Both Arduino sketches send JSON over their respective channels:

```json
{
  "uldPosition": "AR",
  "lockIndex": 0,
  "engaged": true,
  "value": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `uldPosition` | string | ULD position identifier (e.g. "AR", "BL") |
| `lockIndex` | number | Lock position: 0=Fwd Left, 1=Fwd Right, 2=Aft Left, 3=Aft Right |
| `engaged` | boolean | Lock state |
| `value` | number | Raw sensor value (1=engaged, 0=disengaged) |

---

## USB Mode Setup

1. Flash `arduino/lock_sensor_serial/lock_sensor_serial.ino` to your Arduino
2. Connect Arduino via USB
3. Open the app in Chrome/Edge/Opera
4. Select **USB** tab, choose baud rate (default: 115200), click **Connect USB**
5. Select the Arduino port in the browser dialog

## Wireless Mode Setup

1. Flash `arduino/lock_sensor_websocket.ino` to your Arduino
2. Update the sketch with your Wi-Fi credentials and note the Arduino's IP address
3. Open the app and select **Wireless** tab
4. Enter the Arduino's IP address and port (default: 81), click **Connect**

---

## Scripts

```bash
npm start      # Start development server
npm run build  # Build for production
npm test       # Run tests
```
