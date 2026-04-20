/*
 * Boeing 777F Lock Detection System - Arduino Uno Wi-Fi Rev4
 * USB SERIAL VERSION (Wired Connection)
 *
 * This sketch sends lock sensor data over USB Serial connection
 * to the React web application using the Web Serial API.
 *
 * Hardware Setup:
 * - Arduino Uno Wi-Fi Rev4 connected via USB cable
 * - Lock sensor connected to digital pin (e.g., pin 2)
 *
 * The sensor should output (INVERTED LOGIC for this setup):
 * - HIGH (1) when magnet is close = lock is DISENGAGED
 * - LOW (0) when magnet is away = lock is ENGAGED
 *
 * Data Format (JSON over Serial):
 * {"uldPosition":"AR","lockIndex":0,"engaged":true,"value":1}
 */

// Sensor configuration - MODIFY THESE FOR YOUR SETUP
const int SENSOR_PIN = 8;          // Digital pin for lock sensor
const char* ULD_POSITION = "AR";   // Which ULD position this sensor monitors
const int LOCK_INDEX = 0;          // Which lock (0=Forward Left, 1=Forward Right, 2=Aft Left, 3=Aft Right)

// State tracking
int lastSensorState = -1;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;  // 50ms debounce
unsigned long lastStatusSend = 0;
const unsigned long statusInterval = 1000;  // Send status every 1 second
unsigned long eventSeq = 0;  // Monotonic sequence id for latency-test correlation

// Latency-test burst state (driven by BURST <n> <intervalMs> command)
bool burstActive = false;
unsigned long burstRemaining = 0;
unsigned long burstInterval = 0;
unsigned long burstNextAt = 0;
bool burstEngaged = true;

// Command buffer for serial input (PING, BURST)
String cmdBuffer = "";

void setup() {
  // Initialize serial communication at 115200 baud
  // This must match the baud rate selected in the web application
  Serial.begin(115200);

  while (!Serial) {
    ; // Wait for serial port to connect (needed for native USB)
  }

  // Initialize sensor pin (INPUT, not INPUT_PULLUP - matches original ReedCode.ino)
  pinMode(SENSOR_PIN, INPUT);

  // Initialize LED for visual feedback (like original code)
  pinMode(LED_BUILTIN, OUTPUT);

  // Read and send initial sensor state (inverted: LOW = engaged)
  lastSensorState = digitalRead(SENSOR_PIN);
  sendSensorData(lastSensorState == LOW, millis());

  Serial.println("// Boeing 777F Lock Sensor - USB Serial Mode");
  Serial.println("// Ready to send sensor data...");
}

void loop() {
  // Handle inbound commands (PING, BURST) non-blocking
  processSerialCommands();

  // Drive any in-flight burst test flips
  runBurstScheduler();

  // Read sensor
  int reading = digitalRead(SENSOR_PIN);

  // Control LED like original ReedCode.ino
  if (reading == HIGH) {
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    digitalWrite(LED_BUILTIN, LOW);
  }

  // Check for state change (simple approach without debounce for reed switch)
  if (reading != lastSensorState) {
    unsigned long eventMillis = millis();  // Capture at moment of change
    lastSensorState = reading;

    // Send state change over serial (inverted: LOW = engaged)
    bool engaged = (reading == LOW);
    sendSensorData(engaged, eventMillis);
    lastStatusSend = eventMillis;  // Reset timer after state change
  }

  // Send current status periodically (so web app always gets updates)
  if (millis() - lastStatusSend >= statusInterval) {
    sendSensorData(lastSensorState == LOW, millis());
    lastStatusSend = millis();
  }

  // Small delay to prevent overwhelming the serial buffer
  delay(10);
}

void sendSensorData(bool engaged, unsigned long tMillis) {
  // Create JSON payload - must be on a single line ending with newline
  // The web application parses complete lines as JSON objects
  String json = "{";
  json += "\"uldPosition\":\"" + String(ULD_POSITION) + "\",";
  json += "\"lockIndex\":" + String(LOCK_INDEX) + ",";
  json += "\"engaged\":" + String(engaged ? "true" : "false") + ",";
  json += "\"value\":" + String(engaged ? 1 : 0) + ",";
  json += "\"t\":" + String(tMillis) + ",";
  json += "\"seq\":" + String(eventSeq++);
  json += "}";

  Serial.println(json);  // println adds newline which marks end of JSON
}

// Read available bytes and dispatch complete newline-terminated commands.
void processSerialCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (cmdBuffer.length() > 0) {
        handleCommand(cmdBuffer);
        cmdBuffer = "";
      }
    } else {
      cmdBuffer += c;
      if (cmdBuffer.length() > 64) cmdBuffer = "";  // Guard against runaway input
    }
  }
}

void handleCommand(const String& line) {
  if (line.startsWith("PING")) {
    // Format: PING <id>
    String idStr = line.length() > 5 ? line.substring(5) : "0";
    idStr.trim();
    Serial.print("{\"pong\":");
    Serial.print(idStr);
    Serial.print(",\"t\":");
    Serial.print(millis());
    Serial.println("}");
  } else if (line.startsWith("BURST")) {
    // Format: BURST <n> <intervalMs>
    int sp1 = line.indexOf(' ');
    int sp2 = sp1 >= 0 ? line.indexOf(' ', sp1 + 1) : -1;
    if (sp1 > 0 && sp2 > sp1) {
      unsigned long n = (unsigned long)line.substring(sp1 + 1, sp2).toInt();
      unsigned long iv = (unsigned long)line.substring(sp2 + 1).toInt();
      if (n > 0 && iv > 0) {
        burstActive = true;
        burstRemaining = n;
        burstInterval = iv;
        burstNextAt = millis();  // Fire first immediately
        burstEngaged = !(lastSensorState == LOW);  // Start by flipping current state
      }
    }
  }
}

// Emit burst flips without blocking the main loop.
void runBurstScheduler() {
  if (!burstActive) return;
  unsigned long now = millis();
  if ((long)(now - burstNextAt) < 0) return;
  sendSensorData(burstEngaged, now);
  burstEngaged = !burstEngaged;
  burstRemaining--;
  if (burstRemaining == 0) {
    burstActive = false;
  } else {
    burstNextAt = now + burstInterval;
  }
}



