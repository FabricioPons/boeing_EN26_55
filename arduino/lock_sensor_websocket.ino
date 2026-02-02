/*
 * Boeing 777F Lock Detection System - Arduino Uno Wi-Fi Rev4
 *
 * This sketch creates a WebSocket server that sends lock sensor data
 * to the React web application.
 *
 * Hardware Setup:
 * - Arduino Uno Wi-Fi Rev4
 * - Lock sensor connected to digital pin (e.g., pin 2)
 *
 * The sensor should output:
 * - HIGH (1) when lock is ENGAGED
 * - LOW (0) when lock is DISENGAGED
 */

#include <WiFiS3.h>
#include <WebSocketServer.h>

// WiFi credentials - UPDATE THESE
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket server port
const int wsPort = 81;

// Sensor configuration
const int SENSOR_PIN = 2;          // Digital pin for lock sensor
const char* ULD_POSITION = "AR";   // Which ULD position this sensor monitors
const int LOCK_INDEX = 0;          // Which lock (0=Forward Left, 1=Forward Right, 2=Aft Left, 3=Aft Right)

// State tracking
int lastSensorState = -1;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;  // 50ms debounce

WiFiServer server(wsPort);
WebSocketServer webSocketServer;

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial port to connect
  }

  // Initialize sensor pin
  pinMode(SENSOR_PIN, INPUT_PULLUP);

  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("WebSocket Server running on port: ");
  Serial.println(wsPort);

  // Start server
  server.begin();

  // Read initial sensor state
  lastSensorState = digitalRead(SENSOR_PIN);
}

void loop() {
  // Check for new WebSocket clients
  WiFiClient client = server.available();

  if (client.connected() && webSocketServer.handshake(client)) {
    Serial.println("Client connected!");

    // Send current state immediately upon connection
    sendSensorData(client, lastSensorState == HIGH);

    // Main loop while client is connected
    while (client.connected()) {
      // Read sensor with debouncing
      int reading = digitalRead(SENSOR_PIN);

      if (reading != lastSensorState) {
        lastDebounceTime = millis();
      }

      if ((millis() - lastDebounceTime) > debounceDelay) {
        if (reading != lastSensorState) {
          lastSensorState = reading;

          // Send state change to client
          bool engaged = (lastSensorState == HIGH);
          sendSensorData(client, engaged);

          Serial.print("Lock state changed: ");
          Serial.println(engaged ? "ENGAGED" : "DISENGAGED");
        }
      }

      // Small delay to prevent overwhelming the loop
      delay(10);
    }

    Serial.println("Client disconnected");
  }

  delay(100);
}

void sendSensorData(WiFiClient& client, bool engaged) {
  // Create JSON payload
  String json = "{";
  json += "\"uldPosition\":\"" + String(ULD_POSITION) + "\",";
  json += "\"lockIndex\":" + String(LOCK_INDEX) + ",";
  json += "\"engaged\":" + String(engaged ? "true" : "false") + ",";
  json += "\"value\":" + String(engaged ? 1 : 0);
  json += "}";

  webSocketServer.sendData(json);

  Serial.print("Sent: ");
  Serial.println(json);
}


/*
 * ===========================================
 * ALTERNATIVE: Using ArduinoWebsockets library
 * ===========================================
 *
 * If you prefer using the ArduinoWebsockets library (more common),
 * install it via Library Manager and use this code instead:
 *
 * #include <WiFiS3.h>
 * #include <ArduinoWebsockets.h>
 *
 * using namespace websockets;
 * WebsocketsServer wsServer;
 *
 * Then in setup():
 *   wsServer.listen(wsPort);
 *
 * And in loop():
 *   WebsocketsClient client = wsServer.accept();
 *   if (client.available()) {
 *     client.send(jsonPayload);
 *   }
 */


/*
 * ===========================================
 * MULTI-SENSOR VERSION
 * ===========================================
 *
 * For monitoring multiple locks, you can modify the code like this:
 *
 * const int NUM_SENSORS = 4;
 * const int SENSOR_PINS[NUM_SENSORS] = {2, 3, 4, 5};
 * const char* LOCK_NAMES[NUM_SENSORS] = {"Forward Left", "Forward Right", "Aft Left", "Aft Right"};
 * int lastStates[NUM_SENSORS] = {-1, -1, -1, -1};
 *
 * Then loop through all sensors and send updates for any that changed.
 */
