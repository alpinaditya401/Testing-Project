#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <esp_task_wdt.h>
#include <esp_random.h>
#include <ctype.h>
#include <math.h>
#include <time.h>
#include "config.local.h"

static_assert(MAX_FEED_SECONDS >= 1 && MAX_FEED_SECONDS <= 30, "Unsafe feeder duration");
static_assert(RELAY_MAX_ON_SECONDS >= 1 && RELAY_MAX_ON_SECONDS <= 30, "Unsafe relay lease");
static_assert(SERVO_CLOSED_DEGREES >= 0 && SERVO_CLOSED_DEGREES <= 180, "Invalid closed angle");
static_assert(SERVO_OPEN_DEGREES >= 0 && SERVO_OPEN_DEGREES <= 180, "Invalid open angle");
static_assert(TANK_HEIGHT_CM >= 1 && TANK_HEIGHT_CM <= 500, "The server accepts a tank height of 1-500 cm");

// ADC2 stops working once WiFi starts, so every analog sensor has to sit on ADC1.
constexpr bool onAdc1(int pin) { return pin >= 32 && pin <= 39; }
static_assert(onAdc1(PIN_TURBIDITY) && onAdc1(PIN_SOIL_PH) && onAdc1(PIN_TDS), "Analog sensors need GPIO32-39");
static_assert(PIN_TDS != PIN_TURBIDITY && PIN_TDS != PIN_SOIL_PH && PIN_TURBIDITY != PIN_SOIL_PH,
              "Analog sensors must not share a pin");

enum AnalogChannel { CH_TURBIDITY, CH_SOIL_PH, CH_TDS, CH_COUNT };
const int analogPins[CH_COUNT] = {PIN_TURBIDITY, PIN_SOIL_PH, PIN_TDS};
const bool analogEnabled[CH_COUNT] = {TURBIDITY_VOLTAGE_CONFIRMED, SOIL_PH_VOLTAGE_CONFIRMED, TDS_WIRING_CONFIRMED};
const char *const analogPrefix[CH_COUNT] = {"turbidity", "soil_ph", "tds"};

OneWire oneWire(PIN_TEMPERATURE);
DallasTemperature thermometer(&oneWire);
Servo feeder;
Preferences journal;
LiquidCrystal_I2C lcd(LCD_I2C_ADDRESS, 16, 2);
String sessionId, currentId, terminalStatus, pendingTelemetry;
bool configured = false, storageReady = false, connectedBefore = false;
bool feeding = false, relayOn = false, waitingTemperature = false;
uint32_t feedDeadline = 0, relayDeadline = 0, conversionAt = 0;
uint32_t nextNetwork = 0, nextTelemetry = 0, nextAdc = 0, nextWifi = 0, offlineAt = 0;
uint32_t nextEcho = 0, nextDisplay = 0, nextReport = 0;
uint32_t failures = 0;
float temperature = NAN;
int adcIndex = 0, raw[CH_COUNT][9] = {}, millivolts[CH_COUNT][9] = {};
int filteredRaw[CH_COUNT] = {}, filteredMv[CH_COUNT] = {};
bool adcReady = false;
float echoes[5] = {NAN, NAN, NAN, NAN, NAN};
int echoIndex = 0;
int lastTelemetryStatus = 0;
bool showSensorPage = true;

bool due(uint32_t now, uint32_t deadline) { return int32_t(now - deadline) >= 0; }
bool relayEnabled() { return ENABLE_RELAY && RELAY_3V3_COMPATIBLE_CONFIRMED; }
bool actuatorsEnabled() { return ENABLE_FEEDER || relayEnabled(); }
uint32_t retryInterval() {
  unsigned exponent = failures < 6 ? failures++ : 6;
  uint32_t interval = 1000UL << exponent;
  return (interval > 60000 ? 60000 : interval) + esp_random() % 1000;
}

void safeOutputs() {
  if (ENABLE_FEEDER && feeder.attached()) feeder.write(SERVO_CLOSED_DEGREES);
  if (relayEnabled()) digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  feeding = false;
  relayOn = false;
}

bool persistTerminal(const String &status) {
  // One NVS value is the recovery record. A reset during actuation recovers as failed.
  if (!storageReady || journal.putString("pending", currentId + "|" + status) == 0) {
    safeOutputs(); configured = false; return false;
  }
  terminalStatus = status;
  return true;
}

int median(int *values) {
  int sorted[9]; memcpy(sorted, values, sizeof(sorted));
  for (int i = 1; i < 9; ++i) {
    int value = sorted[i], j = i;
    while (j > 0 && sorted[j - 1] > value) { sorted[j] = sorted[j - 1]; --j; }
    sorted[j] = value;
  }
  return sorted[4];
}

float readEchoCm() {
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(PIN_ULTRASONIC_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  // A 30 ms timeout covers about 5 m and bounds how long loop() can stall.
  unsigned long echo = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 30000);
  return echo == 0 ? NAN : echo * 0.0343f / 2.0f;
}

float waterDistanceCm() {
  float valid[5]; int count = 0;
  for (float echo : echoes) if (isfinite(echo)) valid[count++] = echo;
  // Fewer than three echoes out of five counts as no reading rather than a noisy one.
  if (count < 3) return NAN;
  for (int i = 1; i < count; ++i) {
    float value = valid[i]; int j = i;
    while (j > 0 && valid[j - 1] > value) { valid[j] = valid[j - 1]; --j; }
    valid[j] = value;
  }
  float distance = valid[count / 2];
  return distance <= 500 ? distance : NAN;
}

// Display only; the server derives the stored level and ppm from the raw values with the same formulas.
float waterLevelPercent(float distance) {
  return constrain((TANK_HEIGHT_CM - distance) / TANK_HEIGHT_CM * 100.0f, 0.0f, 100.0f);
}

float tdsPpmEstimate(int mv) {
  float volts = mv / 1000.0f;
  return (133.42f * volts * volts * volts - 255.86f * volts * volts + 857.39f * volts) * 0.5f;
}

bool tdsReady() { return TDS_WIRING_CONFIRMED && adcReady && filteredMv[CH_TDS] <= 3300; }

void sampleSensors(uint32_t now) {
  if (due(now, nextAdc)) {
    nextAdc = now + 20;
    for (int i = 0; i < CH_COUNT; ++i) if (analogEnabled[i]) {
      raw[i][adcIndex] = analogRead(analogPins[i]);
      millivolts[i][adcIndex] = analogReadMilliVolts(analogPins[i]);
    }
    if (++adcIndex == 9) {
      adcIndex = 0; adcReady = true;
      for (int i = 0; i < CH_COUNT; ++i) { filteredRaw[i] = median(raw[i]); filteredMv[i] = median(millivolts[i]); }
    }
  }
  if (ULTRASONIC_WIRING_CONFIRMED && due(now, nextEcho)) {
    nextEcho = now + 200;
    echoes[echoIndex] = readEchoCm();
    echoIndex = (echoIndex + 1) % 5;
  }
  if (DS18B20_WIRING_CONFIRMED) {
    if (!waitingTemperature) {
      thermometer.requestTemperatures(); conversionAt = now; waitingTemperature = true;
    } else if (now - conversionAt >= 800) {
      float value = thermometer.getTempCByIndex(0);
      temperature = value >= -55 && value <= 125 ? value : NAN;
      waitingTemperature = false;
    }
  }
}

bool privateHttp() {
  String base(API_BASE);
  if (!ALLOW_PRIVATE_LAN_HTTP || !base.startsWith("http://")) return false;
  String host = base.substring(7); int colon = host.indexOf(':');
  if (colon >= 0) host = host.substring(0, colon);
  IPAddress ip;
  if (!ip.fromString(host)) return false;
  return ip[0] == 10 || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] == 192 && ip[1] == 168);
}

int requestApi(const String &path, const String &payload, String &response) {
  WiFiClient plain;
  WiFiClientSecure secure;
  HTTPClient http;
  String base(API_BASE);
  if (base.startsWith("https://")) {
    if (DEVELOPMENT_INSECURE_TLS) secure.setInsecure();
    else secure.setCACert(ROOT_CA);
    secure.setHandshakeTimeout(3);
    if (!http.begin(secure, base + path)) return -1;
  } else {
    if (!privateHttp() || !http.begin(plain, base + path)) return -1;
  }
  http.setConnectTimeout(2000); http.setTimeout(2000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.useHTTP10(true);
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  int status = payload.length() ? http.POST(payload) : http.GET();
  response = "";
  if (status > 0) {
    auto stream = http.getStreamPtr(); uint32_t began = millis();
    while ((http.connected() || stream->available()) && millis() - began < 2000) {
      while (stream->available()) {
        if (response.length() >= 8192) { http.end(); return -2; }
        response += char(stream->read());
      }
      delay(1);
    }
  }
  http.end(); return status;
}

void buildTelemetry() {
  JsonDocument body;
  time_t utc = time(nullptr); char timestamp[24]; struct tm tmUtc;
  gmtime_r(&utc, &tmUtc); strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  body["device_id"] = DEVICE_ID; body["created_at"] = timestamp;
  body["provenance"] = "device"; body["simulation"] = false; body["source_session"] = sessionId;
  body["temperature"] = nullptr;
  body["temperature_status"] = DS18B20_WIRING_CONFIRMED ? "disconnected" : "unverified";
  if (isfinite(temperature)) { body["temperature"] = temperature; body["temperature_status"] = "ok"; }
  for (int i = 0; i < CH_COUNT; ++i) {
    body[String(analogPrefix[i]) + "_adc"] = nullptr; body[String(analogPrefix[i]) + "_mv"] = nullptr;
    if (analogEnabled[i] && adcReady && filteredMv[i] <= 3300) {
      body[String(analogPrefix[i]) + "_adc"] = filteredRaw[i];
      body[String(analogPrefix[i]) + "_mv"] = filteredMv[i];
    }
  }
  body["turbidity_sensor_mv"] = nullptr; body["turbidity_mapping_percent"] = nullptr;
  if (!body["turbidity_mv"].isNull()) {
    float sensorMv = filteredMv[CH_TURBIDITY] / 0.6f;
    body["turbidity_sensor_mv"] = sensorMv;
    body["turbidity_mapping_percent"] = constrain(100.0f * (1.0f - sensorMv / 5000.0f), 0.0f, 100.0f);
  }
  body["water_distance_cm"] = nullptr; body["tank_height_cm"] = nullptr;
  float distance = waterDistanceCm();
  if (ULTRASONIC_WIRING_CONFIRMED && isfinite(distance)) {
    body["water_distance_cm"] = round(double(distance) * 10.0) / 10.0;
    body["tank_height_cm"] = double(TANK_HEIGHT_CM);
  }
  body["ph_sensor"] = "soil_placeholder"; body["calibrated"] = false;
  pendingTelemetry = ""; serializeJson(body, pendingTelemetry);
}

bool validId(const String &id) {
  if (id.length() != 32) return false;
  for (unsigned i = 0; i < id.length(); ++i) if (!isxdigit(id[i]) || isupper(id[i])) return false;
  return true;
}

void acceptCommand(JsonObject command) {
  String id = command["id"] | "";
  if (!validId(id) || String(command["device_id"] | "") != DEVICE_ID) return;
  if (!command["simulation"].is<bool>() || command["simulation"].as<bool>()) return;
  if (!command["expires_at"].is<long>() || !command["duration"].is<int>() || !command["value"].is<bool>()) return;
  // The server never reopens terminal IDs. Retain a bounded journal as extra replay protection.
  for (int i = 0; i < 8; ++i) {
    String slot = "seen" + String(i);
    if (journal.getString(slot.c_str(), "") == id) return;
  }
  currentId = id;
  if (!persistTerminal("failed")) return;
  unsigned slot = journal.getUInt("slot", 0) % 8;
  String key = "seen" + String(slot);
  if (!journal.putString(key.c_str(), id) || !journal.putUInt("slot", (slot + 1) % 8)) {
    safeOutputs(); configured = false; return;
  }
  long expires = command["expires_at"].as<long>();
  int duration = command["duration"].as<int>(); bool value = command["value"].as<bool>();
  String actuator = command["actuator"] | "";
  if (expires <= time(nullptr)) { persistTerminal("timeout"); return; }
  if (actuator == "feeder" && ENABLE_FEEDER && duration >= 1 && duration <= int(MAX_FEED_SECONDS)) {
    if (!value) { safeOutputs(); persistTerminal("succeeded"); return; }
    if (expires - time(nullptr) < duration + 2) { persistTerminal("timeout"); return; }
    feeder.write(SERVO_OPEN_DEGREES); feeding = true;
    feedDeadline = millis() + duration * 1000UL; terminalStatus = "";
  } else if (actuator == "aerator" && relayEnabled() && duration == 0) {
    digitalWrite(PIN_RELAY, value == RELAY_ACTIVE_LOW ? LOW : HIGH);
    relayOn = value; relayDeadline = millis() + RELAY_MAX_ON_SECONDS * 1000UL;
    persistTerminal("succeeded");
  }
  // Disabled/unsupported commands retain the prewritten failed result.
}

String sensorLine(bool tdsRow) {
  if (tdsRow) {
    if (!TDS_WIRING_CONFIRMED) return "TDS nonaktif";
    if (!tdsReady()) return "TDS membaca...";
    return "TDS " + String(lround(tdsPpmEstimate(filteredMv[CH_TDS]))) + " ppm";
  }
  if (!ULTRASONIC_WIRING_CONFIRMED) return "Air nonaktif";
  float distance = waterDistanceCm();
  if (!isfinite(distance)) return "Air tak terbaca";
  return "Air " + String(lround(waterLevelPercent(distance))) + "% " + String(distance, 1) + "cm";
}

String networkLine() {
  if (!configured) return "Konfig belum isi";
  if (WiFi.status() != WL_CONNECTED) return "WiFi mencari...";
  if (time(nullptr) < 1704067200) return "Tunggu jam NTP";
  switch (lastTelemetryStatus) {
    case 0: return "Belum kirim";
    case 201: return "Terkirim ke web";
    case 401: return "Kunci salah 401";
    case 422: return "Data ditolak 422";
    default: return lastTelemetryStatus < 0 ? "Server tak jawab" : "HTTP " + String(lastTelemetryStatus);
  }
}

void printLine(int row, String text) {
  while (text.length() < 16) text += ' ';
  lcd.setCursor(0, row); lcd.print(text.substring(0, 16));
}

void updateDisplay() {
  if (!ENABLE_LCD) return;
  if (showSensorPage) {
    printLine(0, sensorLine(true));
    printLine(1, sensorLine(false));
  } else {
    printLine(0, WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "WiFi putus");
    printLine(1, networkLine());
  }
  showSensorPage = !showSensorPage;
}

void report() {
  String tds = tdsReady() ? sensorLine(true) + " (" + String(filteredMv[CH_TDS]) + " mV, estimasi)" : sensorLine(true);
  String temp = !DS18B20_WIRING_CONFIRMED ? "Suhu nonaktif"
    : isfinite(temperature) ? "Suhu " + String(temperature, 1) + " C" : "Suhu tak terbaca";
  Serial.printf("%s | %s | %s | %s\n", tds.c_str(), sensorLine(false).c_str(), temp.c_str(), networkLine().c_str());
}

void setup() {
  Serial.begin(115200);
  if (relayEnabled()) {
    digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW); pinMode(PIN_RELAY, OUTPUT);
  }
  if (ENABLE_FEEDER) { feeder.setPeriodHertz(50); feeder.attach(PIN_SERVO, 500, 2400); }
  safeOutputs();
  // The Arduino core already runs the task watchdog at 5 s, so init() would fail; reconfigure instead.
  esp_task_wdt_config_t watchdog = {.timeout_ms = 15000, .idle_core_mask = 0, .trigger_panic = true};
  esp_task_wdt_reconfigure(&watchdog); esp_task_wdt_add(nullptr);
  storageReady = journal.begin("aquasmart", false);
  String recovery = journal.getString("pending", ""); int delimiter = recovery.indexOf('|');
  if (delimiter == 32) { currentId = recovery.substring(0, delimiter); terminalStatus = recovery.substring(delimiter + 1); }
  configured = storageReady && String(WIFI_SSID) != "GANTI_SEBELUM_UPLOAD"
    && String(WIFI_PASSWORD) != "GANTI_SEBELUM_UPLOAD" && String(DEVICE_KEY) != "GANTI_SEBELUM_UPLOAD"
    && String(DEVICE_ID) != "GANTI_SEBELUM_UPLOAD" && String(API_BASE).indexOf("GANTI_SEBELUM_UPLOAD") < 0;
  if (String(API_BASE).startsWith("https://") && !DEVELOPMENT_INSECURE_TLS && String(ROOT_CA).indexOf("BEGIN CERTIFICATE") < 0) configured = false;
  if (DEVELOPMENT_INSECURE_TLS) Serial.println("PERINGATAN: verifikasi identitas TLS DIMATIKAN. Hanya untuk pengembangan, bukan bukti keamanan.");
  analogReadResolution(12);
  for (int i = 0; i < CH_COUNT; ++i) if (analogEnabled[i]) analogSetPinAttenuation(analogPins[i], ADC_11db);
  if (ULTRASONIC_WIRING_CONFIRMED) {
    pinMode(PIN_ULTRASONIC_TRIG, OUTPUT); digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
    pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  }
  if (DS18B20_WIRING_CONFIRMED) { thermometer.begin(); thermometer.setResolution(12); thermometer.setWaitForConversion(false); }
  if (ENABLE_LCD) {
    Wire.begin(PIN_LCD_SDA, PIN_LCD_SCL);
    lcd.init(); lcd.backlight();
    printLine(0, "AquaSmart"); printLine(1, "Menyalakan...");
  }
  sessionId = "esp32-" + String(uint32_t(ESP.getEfuseMac()), HEX) + "-" + String(esp_random(), HEX);
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(false);
  offlineAt = millis();
  Serial.println(configured ? "Konfigurasi termuat, keluaran aman." : "Konfigurasi atau penyimpanan belum lengkap, keluaran dimatikan.");
}

void loop() {
  esp_task_wdt_reset(); uint32_t now = millis();
  // Sensors, LCD and Serial keep running without WiFi so wiring can be checked on the bench.
  sampleSensors(now);
  if (due(now, nextDisplay)) { nextDisplay = now + 3000; updateDisplay(); }
  if (due(now, nextReport)) { nextReport = now + 5000; report(); }
  if (!configured) { safeOutputs(); delay(10); return; }
  if (feeding && due(now, feedDeadline)) { safeOutputs(); persistTerminal("succeeded"); }
  if (relayOn && due(now, relayDeadline)) safeOutputs();
  bool connected = WiFi.status() == WL_CONNECTED;
  if (!connected) {
    if (connectedBefore) {
      bool interrupted = feeding; safeOutputs(); if (interrupted) persistTerminal("failed");
      offlineAt = now; connectedBefore = false;
    }
    if (due(now, nextWifi)) {
      WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      nextWifi = now + retryInterval();
    }
    if (now - offlineAt > 300000UL) { safeOutputs(); ESP.restart(); }
    delay(1); return;
  }
  if (!connectedBefore) {
    safeOutputs(); connectedBefore = true; failures = 0;
    Serial.printf("WiFi tersambung, IP %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, NTP_SERVER); nextNetwork = now;
  }
  // No fabricated epoch timestamps and no commands before NTP synchronization.
  if (time(nullptr) < 1704067200 || feeding || !due(now, nextNetwork)) { delay(1); return; }
  String response; int status;
  String devicePath = "/api/device/devices/" + String(DEVICE_ID) + "/commands";
  if (currentId.length() && terminalStatus.length()) {
    JsonDocument body; body["status"] = terminalStatus; String payload; serializeJson(body, payload);
    status = requestApi(devicePath + "/" + currentId + "/ack", payload, response);
    // 409 is terminal/expired according to this server contract; never actuate again.
    if (status == 200 || status == 409) {
      if (!journal.remove("pending")) { configured = false; safeOutputs(); return; }
      currentId = ""; terminalStatus = "";
    }
  } else if (pendingTelemetry.length() || due(now, nextTelemetry)) {
    if (!pendingTelemetry.length()) buildTelemetry();
    status = requestApi("/api/devices/" + String(DEVICE_ID) + "/telemetry", pendingTelemetry, response);
    lastTelemetryStatus = status;
    if (status == 201 || status == 409 || status == 422) { pendingTelemetry = ""; nextTelemetry = millis() + 10000; }
  } else if (actuatorsEnabled()) {
    status = requestApi(devicePath, "", response);
    if (status == 200) {
      JsonDocument body;
      if (!deserializeJson(body, response) && body["commands"].is<JsonArray>()) {
        for (JsonObject command : body["commands"].as<JsonArray>()) {
          acceptCommand(command); if (currentId.length()) break;
        }
      } else status = -3;
    }
  } else {
    // Without a feeder or relay there is nothing to poll for; wait for the next telemetry slot.
    delay(1); return;
  }
  if (status >= 200 && status < 300) { failures = 0; nextNetwork = millis() + 2000; }
  else { nextNetwork = millis() + retryInterval(); }
  delay(1);
}
