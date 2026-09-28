import { writeFileSync } from "node:fs"
import { COMPONENTS } from "../components/walkthrough/components-guide.ts"

// Generated from the data behind the 3D panel, so the download and the panel cannot disagree.
const header = `# AquaSmart: panduan komponen dan wiring

Acuan: model Blender 23 September 2026, wiring_netlist.json (expanded_nets), hardware/WIRING.md dan firmware/esp32/config.example.h.
Rancangan belum diuji fisik. Nomor marker menunjukkan komponen, bukan urutan kaki board.
Matikan catu sebelum wiring. Cocokkan label pin dan datasheet modul aktual.
Pin firmware per 26 September 2026: suhu GPIO4, turbidity GPIO34, TDS GPIO35, pH tanah GPIO32, ultrasonik GPIO27 (TRIG) dan GPIO25 (ECHO), LCD GPIO21 (SDA) dan GPIO22 (SCL), servo GPIO18, relay GPIO23.
Model masih memakai GPIO35 untuk pH, GPIO32 untuk tombol pakan, GPIO27 untuk float switch, dan GPIO25 untuk LED pompa. Pin itu kini dipakai firmware; ikuti firmware.
Wokwi historis memiliki mapping berbeda: jangan menggunakannya untuk rancangan ini.
Model pH air adalah usulan; firmware masih soil_placeholder. OLED, tombol, LED dan level memerlukan ekstensi firmware.

`
const sections = COMPONENTS.map(
  (c) =>
    `## ${c.name}\n\n${c.status}\n\n${c.purpose}\n\n${c.wires.map((w) => `- ${w}`).join("\n")}\n\n${c.note}\n`,
)
writeFileSync(
  new URL("../public/models/panduan-wiring.md", import.meta.url),
  header + sections.join("\n"),
)
console.log(`Wrote ${COMPONENTS.length} component explanations.`)
