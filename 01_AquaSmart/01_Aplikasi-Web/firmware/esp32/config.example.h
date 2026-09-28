#pragma once

// Copy to aquasmart_esp32/config.local.h; never distribute that private copy.
constexpr char WIFI_SSID[] = "GANTI_SEBELUM_UPLOAD";
constexpr char WIFI_PASSWORD[] = "GANTI_SEBELUM_UPLOAD";
constexpr char DEVICE_ID[] = "GANTI_SEBELUM_UPLOAD";
constexpr char DEVICE_KEY[] = "GANTI_SEBELUM_UPLOAD";
// No trailing slash. The hostname/IP must match the TLS certificate SAN.
constexpr char API_BASE[] = "https://GANTI_SEBELUM_UPLOAD:8443";
constexpr char NTP_SERVER[] = "pool.ntp.org";
constexpr char ROOT_CA[] = R"PEM(GANTI_SEBELUM_UPLOAD)PEM";
constexpr bool ALLOW_PRIVATE_LAN_HTTP = false;
constexpr bool DEVELOPMENT_INSECURE_TLS = false;

constexpr bool DS18B20_WIRING_CONFIRMED = false;
constexpr bool TURBIDITY_VOLTAGE_CONFIRMED = false;
constexpr bool SOIL_PH_VOLTAGE_CONFIRMED = false;
constexpr bool ENABLE_FEEDER = false;
constexpr bool ENABLE_RELAY = false;
constexpr bool RELAY_3V3_COMPATIBLE_CONFIRMED = false;
constexpr bool RELAY_ACTIVE_LOW = false;
constexpr bool TDS_WIRING_CONFIRMED = false;
constexpr bool ULTRASONIC_WIRING_CONFIRMED = false;
constexpr bool ENABLE_LCD = false;
constexpr uint8_t LCD_I2C_ADDRESS = 0x27;
// Distance from the ultrasonic sensor face down to the tank bottom.
constexpr float TANK_HEIGHT_CM = 50.0f;
constexpr int SERVO_CLOSED_DEGREES = 0;
constexpr int SERVO_OPEN_DEGREES = 60;
constexpr unsigned MAX_FEED_SECONDS = 10;
constexpr unsigned RELAY_MAX_ON_SECONDS = 30;
constexpr int PIN_TEMPERATURE = 4;
constexpr int PIN_TURBIDITY = 34;
constexpr int PIN_SOIL_PH = 32;
constexpr int PIN_TDS = 35;
constexpr int PIN_ULTRASONIC_TRIG = 27;
constexpr int PIN_ULTRASONIC_ECHO = 25;
constexpr int PIN_LCD_SDA = 21;
constexpr int PIN_LCD_SCL = 22;
constexpr int PIN_SERVO = 18;
constexpr int PIN_RELAY = 23;
