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
  sendSensorData(lastSensorState == LOW);

  Serial.println("// Boeing 777F Lock Sensor - USB Serial Mode");
  Serial.println("// Ready to send sensor data...");
}

void loop() {
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
    lastSensorState = reading;

    // Send state change over serial (inverted: LOW = engaged)
    bool engaged = (reading == LOW);
    sendSensorData(engaged);
    lastStatusSend = millis();  // Reset timer after state change
  }

  // Send current status periodically (so web app always gets updates)
  if (millis() - lastStatusSend >= statusInterval) {
    sendSensorData(lastSensorState == LOW);
    lastStatusSend = millis();
  }

  // Small delay to prevent overwhelming the serial buffer
  delay(10);
}

void sendSensorData(bool engaged) {
  // Create JSON payload - must be on a single line ending with newline
  // The web application parses complete lines as JSON objects
  String json = "{";
  json += "\"uldPosition\":\"" + String(ULD_POSITION) + "\",";
  json += "\"lockIndex\":" + String(LOCK_INDEX) + ",";
  json += "\"engaged\":" + String(engaged ? "true" : "false") + ",";
  json += "\"value\":" + String(engaged ? 1 : 0);
  json += "}";

  Serial.println(json);  // println adds newline which marks end of JSON
}


/*
 * ===========================================
 * MULTI-SENSOR VERSION
 * ===========================================
 *
 * For monitoring multiple locks on a single ULD, modify the code like this:
 *
 * const int NUM_SENSORS = 4;
 * const int SENSOR_PINS[NUM_SENSORS] = {2, 3, 4, 5};
 * const int LOCK_INDICES[NUM_SENSORS] = {0, 1, 2, 3};  // FL, FR, AL, AR
 * int lastStates[NUM_SENSORS] = {-1, -1, -1, -1};
 *
 * Then in loop(), iterate through all sensors:
 *
 * for (int i = 0; i < NUM_SENSORS; i++) {
 *   int reading = digitalRead(SENSOR_PINS[i]);
 *   if (reading != lastStates[i]) {
 *     // debounce logic here...
 *     lastStates[i] = reading;
 *     sendSensorDataMulti(ULD_POSITION, LOCK_INDICES[i], reading == HIGH);
 *   }
 * }
 */


/*
 * ===========================================
 * TESTING WITHOUT A SENSOR
 * ===========================================
 *
 * If you want to test without a physical sensor, you can use the
 * Arduino's built-in LED button or a simple jumper wire:
 *
 * 1. Connect pin 2 to GND with a jumper wire to simulate DISENGAGED
 * 2. Remove the jumper to simulate ENGAGED (pull-up makes it HIGH)
 *
 * Or modify the code to toggle automatically for testing:
 *
 * void loop() {
 *   static bool testState = true;
 *   static unsigned long lastToggle = 0;
 *
 *   if (millis() - lastToggle > 3000) {  // Toggle every 3 seconds
 *     testState = !testState;
 *     sendSensorData(testState);
 *     lastToggle = millis();
 *   }
 * }
 */


/*
 * ===========================================
 * WIRING DIAGRAM
 * ===========================================
 *
 *   Arduino Uno Wi-Fi Rev4
 *   +-------------------+
 *   |                   |
 *   |  [USB-C] -------> Connect to Computer
 *   |                   |
 *   |  Pin 2  -------> Lock Sensor Signal
 *   |  GND    -------> Lock Sensor Ground
 *   |  5V     -------> Lock Sensor Power (if needed)
 *   |                   |
 *   +-------------------+
 *
 * For a simple switch/contact sensor:
 * - Connect one terminal to Pin 2
 * - Connect other terminal to GND
 * - The INPUT_PULLUP handles the pull-up resistor internally
 *
 * Sensor closed (contact) = LOW = DISENGAGED
 * Sensor open (no contact) = HIGH = ENGAGED
 *
 * If your sensor logic is inverted, change line 55:
 *   bool engaged = (lastSensorState == LOW);  // Inverted logic
 */

