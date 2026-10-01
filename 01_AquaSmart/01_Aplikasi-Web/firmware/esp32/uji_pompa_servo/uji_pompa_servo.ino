#include <ESP32Servo.h>

constexpr int RELAY_PIN = 23;
constexpr int SERVO_PIN = 18;
constexpr int POMPA_3V_PIN = 14;  // Input driver motor, bukan kabel daya pompa.

constexpr bool RELAY_ACTIVE_LOW = false;
constexpr bool DRIVER_POMPA_ACTIVE_LOW = false;
constexpr int SERVO_POSITION = 90;

Servo myServo;
uint32_t lastReport = 0;

void setOutput(int pin, bool on, bool activeLow) {
  digitalWrite(pin, on != activeLow ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);

  setOutput(RELAY_PIN, false, RELAY_ACTIVE_LOW);
  setOutput(POMPA_3V_PIN, false, DRIVER_POMPA_ACTIVE_LOW);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(POMPA_3V_PIN, OUTPUT);

  myServo.setPeriodHertz(50);
  myServo.attach(SERVO_PIN);
  if (!myServo.attached()) {
    Serial.println("Servo gagal diinisialisasi; keluaran pompa tetap OFF.");
    return;
  }
  myServo.write(SERVO_POSITION);

  setOutput(RELAY_PIN, true, RELAY_ACTIVE_LOW);
  setOutput(POMPA_3V_PIN, true, DRIVER_POMPA_ACTIVE_LOW);
  Serial.println("Perintah: pompa 12V ON | pompa 3V ON | servo 90 derajat.");
  Serial.println("Status keluaran bukan konfirmasi motor berputar. Sketch uji tanpa WiFi/dashboard.");
}

void loop() {
  const uint32_t now = millis();
  if (now - lastReport >= 3000UL) {
    lastReport = now;
    Serial.println(myServo.attached()
      ? "Keluaran: pompa 12V ON | pompa 3V ON | servo 90 derajat."
      : "Inisialisasi gagal: pompa OFF.");
  }
}
