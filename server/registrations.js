import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const dataRoot = process.env.DEMO_DATA_DIR
  ? path.resolve(process.env.DEMO_DATA_DIR)
  : path.join(process.cwd(), "server", "data");
const registrationFile = path.join(dataRoot, "registrations", "registrations.json");

async function ensureRegistrationStore() {
  await fs.mkdir(path.dirname(registrationFile), { recursive: true });
  try {
    await fs.access(registrationFile);
  } catch {
    await fs.writeFile(registrationFile, "[]\n", "utf8");
  }
}

export async function createRegistration(details) {
  await ensureRegistrationStore();

  const registrations = JSON.parse(await fs.readFile(registrationFile, "utf8"));
  const now = new Date();
  const random = Math.floor(100000 + Math.random() * 899999);
  const registration = {
    id: `KHM-${now.getFullYear()}-${random}`,
    eventName: "Kochi Half Marathon 2026",
    paymentStatus: "demo_pending",
    createdAt: now.toISOString(),
    details
  };

  const qrPayload = JSON.stringify({
    registrationId: registration.id,
    eventName: registration.eventName,
    participant: details.fullName,
    raceCategory: details.raceCategory
  });
  const qrCode = await QRCode.toDataURL(qrPayload, {
    width: 260,
    margin: 1,
    color: {
      dark: "#090808",
      light: "#fffaf7"
    }
  });

  registrations.push(registration);
  await fs.writeFile(registrationFile, `${JSON.stringify(registrations, null, 2)}\n`, "utf8");

  return {
    ...registration,
    qrCode
  };
}
